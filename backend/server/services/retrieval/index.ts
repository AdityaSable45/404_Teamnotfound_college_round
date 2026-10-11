import type { ExtractedClaim, FilteredSource, EvidenceChunk } from '../contracts.js';
import {
  liveSearchEngine,
  LiveSearchEngine,
  TavilyProvider,
  DuckDuckGoProvider,
  WikipediaProvider,
} from './searchEngine.js';
import type { SearchProvider, SearchResult } from './searchEngine.js';
import { sourceFilter, SourceFilter } from './sourceFilter.js';
import { pageFetcher, PageFetcher } from './pageFetcher.js';
import type { FetchedPageResult } from './pageFetcher.js';
import { contentExtractor, ContentExtractor } from './contentExtractor.js';
import type { ExtractedDocument } from './contentExtractor.js';
import { documentChunker, DocumentChunker } from './chunker.js';
import type { DetailedEvidenceChunk } from './chunker.js';
import {
  vectorEvidenceRetriever,
  VectorEvidenceRetriever,
} from './vectorRetrieval.js';
import type { RankedEvidenceChunk } from './vectorRetrieval.js';
import { getEmbeddingProvider } from './embeddingProvider.js';
import type { EmbeddingProvider } from './embeddingProvider.js';
import { deduplicator, Deduplicator } from './deduplication.js';
import { languageDetector } from '../audit/languageDetector.js';
import { logger } from '../../utils/logger.js';

export {
  liveSearchEngine,
  LiveSearchEngine,
  TavilyProvider,
  DuckDuckGoProvider,
  WikipediaProvider,
  sourceFilter,
  SourceFilter,
  pageFetcher,
  PageFetcher,
  contentExtractor,
  ContentExtractor,
  documentChunker,
  DocumentChunker,
  vectorEvidenceRetriever,
  VectorEvidenceRetriever,
  getEmbeddingProvider,
  deduplicator,
  Deduplicator,
};

export type {
  SearchProvider,
  SearchResult,
  FetchedPageResult,
  ExtractedDocument,
  DetailedEvidenceChunk,
  RankedEvidenceChunk,
  EmbeddingProvider,
};

export interface RetrievalResult {
  query: string;
  evidence: RankedEvidenceChunk[];
  // Maintained for seamless integration with claimVerifier.ts (Developer 2):
  rawSources: FilteredSource[];
  topEvidenceChunks: EvidenceChunk[];
}

/**
 * RetrievalEngine: End-to-end evidence retrieval pipeline.
 *
 * Claim
 *  ↓ SearchProvider (DuckDuckGo + Wikipedia, extensible)
 *  ↓ URL Normalization & Source Filtering (gov/edu/news credibility ranking)
 *  ↓ Webpage Fetching (Safe redirect tracking, SSRF protection, size caps)
 *  ↓ Content Extraction (Article text cleanup via Cheerio)
 *  ↓ Document Chunking (Sentence-aware splitting, deterministic SHA-256 IDs)
 *  ↓ Dense Embeddings & Cosine Similarity
 *  ↓ Multi-Factor Evidence Ranking (similarity + source credibility + freshness)
 *  ↓ Near-Duplicate Pruning
 *  ↓ Top-K Grounded Evidence Chunks
 */
export class RetrievalEngine {
  async retrieveEvidence(
    claimOrQuery: ExtractedClaim | string,
    topK = 5
  ): Promise<RetrievalResult> {
    const claimText =
      typeof claimOrQuery === 'string'
        ? claimOrQuery.trim()
        : (claimOrQuery.normalized_claim || claimOrQuery.original_text).trim();

    const claimId =
      typeof claimOrQuery === 'string'
        ? `q_${deduplicator.computeContentHash(claimText).slice(0, 8)}`
        : claimOrQuery.id;

    logger.info(`RetrievalEngine: Executing retrieval pipeline for query: "${claimText.slice(0, 60)}..."`);

    // 1. Search (with cross-lingual enrichment if multilingual)
    let searchQuery = claimText;
    const isMultilingual =
      (typeof claimOrQuery === 'object' && (claimOrQuery.language === 'hi' || claimOrQuery.language === 'mr')) ||
      /[\u0900-\u097F]/.test(claimText);

    if (isMultilingual) {
      const crossLingual = languageDetector.generateCrossLingualQuery(claimText);
      if (crossLingual && crossLingual !== claimText) {
        searchQuery = `${claimText} ${crossLingual}`;
      }
    }

    const rawSources = await liveSearchEngine.searchEvidence(searchQuery);

    // 2. Source Filtering & Credibility Scoring
    const filteredSources = sourceFilter.filterAndRankSources(rawSources);

    // 3. Webpage Fetching & Content Extraction (parallel fetch with fallback to snippet)
    const allChunks: DetailedEvidenceChunk[] = [];
    const maxPagesToFetch = Math.min(
      filteredSources.length,
      Number(process.env.MAX_PAGES_TO_FETCH || 2)
    );
    const fetchTimeoutMs = Number(process.env.PAGE_FETCH_TIMEOUT_MS || 3500);

    const fetchPromises = filteredSources.slice(0, maxPagesToFetch).map(async (source) => {
      const documentId = `doc_${deduplicator.computeContentHash(source.url || source.title).slice(0, 10)}`;
      let extractedDoc: ExtractedDocument | null = null;

      if (source.url && /^https?:\/\//i.test(source.url)) {
        try {
          const pageResult = await pageFetcher.fetchPage(source.url, { timeoutMs: fetchTimeoutMs });
          if (pageResult.success && pageResult.html) {
            extractedDoc = contentExtractor.extractContent(pageResult.html, pageResult.finalUrl || source.url);
          } else {
            logger.debug(`Page fetch unsuccessful for ${source.url} (${pageResult.errorCode}); falling back to snippet`);
          }
        } catch (fetchErr) {
          logger.warn(`Error during page fetch for ${source.url}: ${fetchErr}`);
        }
      }

      // Fallback: If page fetch was blocked, timed out, or had no URL, use the search snippet
      if (!extractedDoc || extractedDoc.text.length < 50) {
        extractedDoc = {
          title: source.title,
          canonicalUrl: source.url || '',
          text: source.snippet || source.title,
        };
      }

      // 4. Document Chunking (cap per document at 15 chunks for fast ranking)
      const chunks = documentChunker.chunkDocument(extractedDoc, {
        documentId,
        domain: source.domain,
        sourceType: source.tier,
        sourceScore: source.credibilityScore,
      });

      return chunks.slice(0, 15);
    });

    const chunkResults = await Promise.all(fetchPromises);
    for (const chunks of chunkResults) {
      allChunks.push(...chunks);
    }

    // 5. Dense Vector Embedding, Semantic Similarity & Composite Ranking (capped at top 30 chunks)
    const candidateChunks = allChunks.slice(0, 30);
    const rankedEvidence = await vectorEvidenceRetriever.rankEvidenceChunks(
      claimText,
      claimId,
      candidateChunks,
      topK
    );

    logger.info(`RetrievalEngine: Successfully retrieved ${rankedEvidence.length} grounded evidence passages`);

    // Enrich rawSources snippets with the top grounded evidence passage extracted from each webpage
    for (const source of filteredSources) {
      const topChunk = rankedEvidence.find(
        (c) => c.url === source.url || (c.domain && source.domain && c.domain === source.domain)
      );
      if (topChunk && topChunk.text && topChunk.text.length > 25) {
        source.snippet = topChunk.text;
      }
    }

    return {
      query: claimText,
      evidence: rankedEvidence,
      rawSources: filteredSources,
      topEvidenceChunks: rankedEvidence,
    };
  }
}

export const retrievalEngine = new RetrievalEngine();
