import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LiveSearchEngine,
  TavilyProvider,
  DuckDuckGoProvider,
  WikipediaProvider,
  SearchProvider,
} from '../server/services/retrieval/searchEngine.js';
import { logger } from '../server/utils/logger.js';
import { sourceFilter, SourceFilter } from '../server/services/retrieval/sourceFilter.js';
import { pageFetcher, PageFetcher } from '../server/services/retrieval/pageFetcher.js';
import { contentExtractor } from '../server/services/retrieval/contentExtractor.js';
import { documentChunker } from '../server/services/retrieval/chunker.js';
import {
  LocalDenseEmbeddingProvider,
  getEmbeddingProvider,
} from '../server/services/retrieval/embeddingProvider.js';
import {
  vectorEvidenceRetriever,
  VectorEvidenceRetriever,
} from '../server/services/retrieval/vectorRetrieval.js';
import { deduplicator } from '../server/services/retrieval/deduplication.js';
import { retrievalEngine } from '../server/services/retrieval/index.js';

describe('Retrieval Domain Unit Tests', () => {
  // ==========================================
  // 1. Search Engine Tests
  // ==========================================
  // ==========================================
  // 1. Search Engine Tests
  // ==========================================
  describe('Search Engine (searchEngine.ts)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    // 1. Tavily success → correctly mapped SearchResult[]
    it('1. Tavily success -> correctly maps SearchResult[]', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                title: 'Official GDP Report',
                url: 'https://reuters.com/markets/gdp-growth',
                content: 'Economic growth was officially measured at 8.2% in the first quarter.',
                score: 0.95,
              },
            ],
          }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new TavilyProvider('test-api-key');
      const results = await provider.search('gdp growth');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        title: 'Official GDP Report',
        url: 'https://reuters.com/markets/gdp-growth',
        snippet: 'Economic growth was officially measured at 8.2% in the first quarter.',
        publisher: 'reuters.com',
      });
    });

    // 2. Tavily timeout → returns []
    it('2. Tavily timeout -> returns []', async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      );
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new TavilyProvider('test-api-key');
      const results = await provider.search('timeout query', 50);

      expect(results).toEqual([]);
    });

    // 3. Tavily 401 → returns []
    it('3. Tavily 401 unauthorized -> returns []', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new TavilyProvider('invalid-key');
      const results = await provider.search('unauthorized query');

      expect(results).toEqual([]);
    });

    // 4. Tavily 429 → returns []
    it('4. Tavily 429 rate limit -> returns []', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new TavilyProvider('rate-limited-key');
      const results = await provider.search('rate limited query');

      expect(results).toEqual([]);
    });

    // 5. malformed Tavily response → returns []
    it('5. malformed Tavily response -> returns []', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Unexpected token < in JSON')),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new TavilyProvider('test-api-key');
      const results = await provider.search('malformed json query');

      expect(results).toEqual([]);
    });

    // 6. Tavily + Wikipedia + DuckDuckGo aggregation
    it('6. Tavily + Wikipedia + DuckDuckGo aggregation', async () => {
      const mockTavily: SearchProvider = {
        name: 'tavily',
        search: vi.fn().mockResolvedValue([
          { title: 'Tavily Fact', url: 'https://tavily-source.com/page', snippet: 'Tavily content', publisher: 'tavily-source.com' },
        ]),
      };
      const mockWiki: SearchProvider = {
        name: 'wikipedia',
        search: vi.fn().mockResolvedValue([
          { title: 'Wiki Fact', url: 'https://en.wikipedia.org/wiki/Fact', snippet: 'Wiki content', publisher: 'Wikipedia' },
        ]),
      };
      const mockDDG: SearchProvider = {
        name: 'duckduckgo',
        search: vi.fn().mockResolvedValue([
          { title: 'DDG Fact', url: 'https://duck-source.com/page', snippet: 'DDG content', publisher: 'duck-source.com' },
        ]),
      };

      const engine = new LiveSearchEngine([mockTavily, mockWiki, mockDDG]);
      const results = await engine.searchEvidence('aggregation query');

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.title)).toEqual(['Tavily Fact', 'Wiki Fact', 'DDG Fact']);
    });

    // 7. DuckDuckGo CAPTCHA does not prevent Tavily results
    it('7. DuckDuckGo CAPTCHA does not prevent Tavily results', async () => {
      const mockTavily: SearchProvider = {
        name: 'tavily',
        search: vi.fn().mockResolvedValue([
          { title: 'Authoritative Record', url: 'https://gov.in/record', snippet: 'Verified factual data', publisher: 'gov.in' },
        ]),
      };
      const mockDDG: SearchProvider = {
        name: 'duckduckgo',
        search: vi.fn().mockResolvedValue([]), // Returns empty because of challenge
      };

      const engine = new LiveSearchEngine([mockTavily, mockDDG]);
      const results = await engine.searchEvidence('fact check claim');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Authoritative Record');
    });

    // 8. URL deduplication still works
    it('8. URL deduplication still works across providers', async () => {
      const mockProvider1: SearchProvider = {
        name: 'p1',
        search: vi.fn().mockResolvedValue([
          { title: 'Duplicate Page', url: 'https://example.com/data', snippet: 'Snippet A' },
        ]),
      };
      const mockProvider2: SearchProvider = {
        name: 'p2',
        search: vi.fn().mockResolvedValue([
          { title: 'Duplicate Page Copy', url: 'https://example.com/data', snippet: 'Snippet B' },
        ]),
      };

      const engine = new LiveSearchEngine([mockProvider1, mockProvider2]);
      const results = await engine.searchEvidence('dedup query');

      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/data');
    });

    // 9. custom providers still override default provider selection
    it('9. custom providers still override default provider selection', () => {
      const customMock: SearchProvider = {
        name: 'custom-only',
        search: vi.fn().mockResolvedValue([]),
      };

      const engine = new LiveSearchEngine([customMock]);
      const activeProviders = engine.getProviders();

      expect(activeProviders).toHaveLength(1);
      expect(activeProviders[0].name).toBe('custom-only');
    });

    // 10. API key is never included in logs
    it('10. API key is never included in logs on error or query', async () => {
      const secretKey = 'tvly-secret-production-token-98765';
      const warnSpy = vi.spyOn(logger, 'warn');

      const mockFetch = vi.fn().mockRejectedValue(
        new Error(`Connection failure to Tavily with key ${secretKey}`)
      );
      global.fetch = mockFetch as unknown as typeof fetch;

      const provider = new TavilyProvider(secretKey);
      await provider.search('test query');

      for (const call of warnSpy.mock.calls) {
        const logContent = JSON.stringify(call);
        expect(logContent).not.toContain(secretKey);
      }
    });

    it('rejects CAPTCHA / bot challenge responses from DuckDuckGo', async () => {
      const provider = new DuckDuckGoProvider();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><body><div class="anomaly-detected">Please complete challenge</div></body></html>'),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const results = await provider.search('test query', 2000);
      expect(results).toEqual([]);
    });
  });

  // ==========================================
  // 2. Source Filter Tests
  // ==========================================
  describe('Source Filtering (sourceFilter.ts)', () => {
    it('classifies government and international body domains with high priority', () => {
      const sources = [
        { title: 'US Census', url: 'https://www.census.gov/data.html', snippet: 'Data snippet' },
        { title: 'Indian Gov Portal', url: 'https://india.gov.in/facts', snippet: 'Data snippet' },
        { title: 'WHO Health Info', url: 'https://www.who.int/news/item', snippet: 'Health report' },
      ];

      const filtered = sourceFilter.filterAndRankSources(sources);
      expect(filtered.length).toBe(3);
      for (const item of filtered) {
        expect(item.tier).toBe('GOVERNMENT');
        expect(item.credibilityScore).toBe(95);
      }
    });

    it('classifies academic and scientific repositories correctly', () => {
      const sources = [
        { title: 'MIT Study', url: 'https://news.mit.edu/2024/research', snippet: 'Physics paper' },
        { title: 'Oxford Paper', url: 'https://www.ox.ac.uk/research', snippet: 'History analysis' },
        { title: 'Nature Journal', url: 'https://www.nature.com/articles/d41586', snippet: 'Biology article' },
      ];

      const filtered = sourceFilter.filterAndRankSources(sources);
      for (const item of filtered) {
        expect(item.tier).toBe('ACADEMIC');
        expect(item.credibilityScore).toBe(92);
      }
    });

    it('classifies fact-checkers and mainstream news outlets', () => {
      const sources = [
        { title: 'Reuters Fact Check', url: 'https://www.reuters.com/fact-check/claim-x', snippet: 'Fact check' },
        { title: 'BBC World News', url: 'https://www.bbc.com/news/world-123', snippet: 'News report' },
        { title: 'Random Blog', url: 'https://superfakeposts.xyz/article', snippet: 'Blog' },
      ];

      const filtered = sourceFilter.filterAndRankSources(sources);
      expect(filtered[0].tier).toBe('FACT_CHECKER');
      expect(filtered[0].credibilityScore).toBe(98);

      const bbc = filtered.find((f) => f.domain === 'bbc.com');
      expect(bbc?.tier).toBe('MAINSTREAM_NEWS');
      expect(bbc?.credibilityScore).toBe(85);

      const blog = filtered.find((f) => f.domain === 'superfakeposts.xyz');
      expect(blog?.tier).toBe('GENERAL_WEB');
      expect(blog?.credibilityScore).toBe(65);
    });

    it('deduplicates normalized URLs with tracking query parameters', () => {
      const sources = [
        { title: 'Page A', url: 'https://reuters.com/news/article?utm_source=twitter&utm_medium=social', snippet: 'Text' },
        { title: 'Page A Again', url: 'https://reuters.com/news/article?utm_source=facebook', snippet: 'Text' },
      ];

      const filtered = sourceFilter.filterAndRankSources(sources);
      expect(filtered.length).toBe(1);
      expect(filtered[0].url).toBe('https://reuters.com/news/article');
    });
  });

  // ==========================================
  // 3. Page Fetcher Security Tests
  // ==========================================
  describe('Page Fetcher Security (pageFetcher.ts)', () => {
    it('allows valid HTTP and HTTPS URLs', () => {
      expect(pageFetcher.validateUrl('https://en.wikipedia.org/wiki/India').valid).toBe(true);
      expect(pageFetcher.validateUrl('http://example.com/path').valid).toBe(true);
    });

    it('rejects unsupported protocols (file, ftp, javascript, data)', () => {
      const fileRes = pageFetcher.validateUrl('file:///etc/passwd');
      expect(fileRes.valid).toBe(false);
      expect(fileRes.errorCode).toBe('UNSUPPORTED_PROTOCOL');

      const ftpRes = pageFetcher.validateUrl('ftp://ftp.example.com/file');
      expect(ftpRes.valid).toBe(false);
      expect(ftpRes.errorCode).toBe('UNSUPPORTED_PROTOCOL');
    });

    it('blocks localhost, loopback, and internal network hostnames (SSRF)', () => {
      const blocked = [
        'http://localhost:8080/admin',
        'http://127.0.0.1/secrets',
        'http://0.0.0.0:3000',
        'http://server.local/internal',
        'http://app.internal/data',
      ];

      for (const url of blocked) {
        const res = pageFetcher.validateUrl(url);
        expect(res.valid).toBe(false);
        expect(res.errorCode).toBe('SSRF_BLOCKED');
      }
    });

    it('blocks private IPv4 ranges and cloud metadata endpoints (SSRF)', () => {
      const privateIps = [
        'http://10.0.0.1/dashboard',
        'http://172.16.5.10/admin',
        'http://192.168.1.1/router',
        'http://169.254.169.254/latest/meta-data/', // AWS/GCP/Azure instance metadata
      ];

      for (const url of privateIps) {
        const res = pageFetcher.validateUrl(url);
        expect(res.valid).toBe(false);
        expect(res.errorCode).toBe('SSRF_BLOCKED');
      }
    });

    it('handles fetch timeouts with controlled error response', async () => {
      const fetcher = new PageFetcher({ timeoutMs: 10 });
      const res = await fetcher.fetchPage('https://httpstat.us/200?sleep=5000');
      expect(res.success).toBe(false);
      expect(['TIMEOUT', 'FETCH_ERROR']).toContain(res.errorCode);
    });

    it('rejects oversized page responses', async () => {
      const fetcher = new PageFetcher({ maxSizeBytes: 50 });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'text/html',
          'content-length': '500',
        }),
        text: () => Promise.resolve('This text is longer than fifty bytes limit for testing purpose'),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const res = await fetcher.fetchPage('https://example.com/large', { maxSizeBytes: 50 });
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('OVERSIZED');
    });
  });

  // ==========================================
  // 4. Content Extractor Tests
  // ==========================================
  describe('Content Extractor (contentExtractor.ts)', () => {
    it('extracts clean text while stripping navigation, scripts, ads, and footers', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Economic Growth Report 2025</title>
            <meta name="author" content="Dr. Jane Smith">
            <meta property="article:published_time" content="2025-03-01T10:00:00Z">
          </head>
          <body>
            <nav><a href="/">Home</a><a href="/about">About Us</a></nav>
            <header><h1>Site Header Banner</h1></header>
            <div class="ads">Buy something now! Click here.</div>
            <article>
              <h1>Economic Growth Report 2025</h1>
              <p>India recorded an 8.2% expansion in gross domestic product during the first quarter.</p>
              <p>Manufacturing and capital expenditure drove the primary momentum according to official figures.</p>
            </article>
            <div id="cookie-banner">Accept all cookies</div>
            <footer>Copyright 2025 All Rights Reserved</footer>
            <script>console.log("analytics track");</script>
          </body>
        </html>
      `;

      const doc = contentExtractor.extractContent(html, 'https://example.com/gdp');

      expect(doc.title).toBe('Economic Growth Report 2025');
      expect(doc.author).toBe('Dr. Jane Smith');
      expect(doc.publishedAt).toBe('2025-03-01T10:00:00Z');
      expect(doc.text).toContain('8.2% expansion in gross domestic product');
      expect(doc.text).not.toContain('Buy something now');
      expect(doc.text).not.toContain('Accept all cookies');
      expect(doc.text).not.toContain('analytics track');
    });
  });

  // ==========================================
  // 5. Document Chunker Tests
  // ==========================================
  describe('Document Chunker (chunker.ts)', () => {
    const sampleDoc = {
      title: 'GDP Overview',
      canonicalUrl: 'https://gov.in/gdp',
      text: 'Sentence one discusses GDP statistics in India. Sentence two notes foreign direct investment inflows. Sentence three highlights service sector expansion. Sentence four examines agricultural output.',
    };

    const metadata = {
      documentId: 'doc_123',
      domain: 'gov.in',
      sourceType: 'GOVERNMENT',
      sourceScore: 95,
    };

    it('generates deterministic chunk IDs across runs for identical text', () => {
      const chunksA = documentChunker.chunkDocument(sampleDoc, metadata, { chunkSize: 120, chunkOverlap: 30 });
      const chunksB = documentChunker.chunkDocument(sampleDoc, metadata, { chunkSize: 120, chunkOverlap: 30 });

      expect(chunksA.length).toBeGreaterThan(0);
      expect(chunksA.length).toBe(chunksB.length);
      for (let i = 0; i < chunksA.length; i++) {
        expect(chunksA[i].id).toBe(chunksB[i].id);
        expect(chunksA[i].chunkIndex).toBe(chunksB[i].chunkIndex);
      }
    });

    it('respects sentence boundaries and preserves source metadata', () => {
      const chunks = documentChunker.chunkDocument(sampleDoc, metadata, { chunkSize: 100, chunkOverlap: 20 });

      for (const chunk of chunks) {
        expect(chunk.domain).toBe('gov.in');
        expect(chunk.sourceType).toBe('GOVERNMENT');
        expect(chunk.sourceScore).toBe(95);
        expect(chunk.url).toBe('https://gov.in/gdp');
        expect(chunk.text.length).toBeGreaterThan(20);
      }
    });
  });

  // ==========================================
  // 6. Embeddings Provider Tests
  // ==========================================
  describe('Embedding Provider (embeddingProvider.ts)', () => {
    it('LocalDenseEmbeddingProvider generates dense numeric vectors with consistent dimensions', async () => {
      const provider = new LocalDenseEmbeddingProvider(256);
      expect(provider.dimension).toBe(256);

      const vec = await provider.embed('Gross Domestic Product growth report');
      expect(Array.isArray(vec)).toBe(true);
      expect(vec.length).toBe(256);

      // Verify L2 normalization: norm ≈ 1.0
      let sumSq = 0;
      for (const val of vec) sumSq += val * val;
      expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.001);
    });

    it('embedBatch returns matching count and dimensions', async () => {
      const provider = new LocalDenseEmbeddingProvider(128);
      const batch = await provider.embedBatch(['Query 1', 'Query 2', 'Query 3']);

      expect(batch.length).toBe(3);
      expect(batch[0].length).toBe(128);
      expect(batch[1].length).toBe(128);
    });
  });

  // ==========================================
  // 7. Vector Retrieval & Semantic Ranking Tests
  // ==========================================
  describe('Vector Retrieval & Evidence Ranking (vectorRetrieval.ts)', () => {
    it('ranks semantically matching chunks higher and calculates cosine similarity correctly', async () => {
      const retriever = new VectorEvidenceRetriever(new LocalDenseEmbeddingProvider(256));

      const chunks = [
        {
          id: 'chunk_1',
          documentId: 'doc_1',
          text: 'India recorded an 8.2% expansion in GDP during the first quarter.',
          title: 'Official GDP Estimates',
          url: 'https://gov.in/gdp',
          domain: 'gov.in',
          sourceType: 'GOVERNMENT',
          sourceScore: 95,
          chunkIndex: 0,
        },
        {
          id: 'chunk_2',
          documentId: 'doc_2',
          text: 'Recipe for classic Italian pasta with olive oil and garlic.',
          title: 'Cooking Guide',
          url: 'https://cooking.com/pasta',
          domain: 'cooking.com',
          sourceType: 'GENERAL_WEB',
          sourceScore: 65,
          chunkIndex: 0,
        },
      ];

      const ranked = await retriever.rankEvidenceChunks(
        "India's GDP grew by 8.2% in Q1 2025",
        'claim_1',
        chunks,
        2
      );

      expect(ranked.length).toBe(2);
      // Relevant GDP chunk should rank first with higher similarity & finalScore
      expect(ranked[0].id).toBe('chunk_1');
      expect(ranked[0].similarity).toBeGreaterThan(ranked[1].similarity);
      expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore);
      expect(ranked[0].tier).toBe('GOVERNMENT');
    });

    it('calculates vector cosine similarity correctly', () => {
      const retriever = new VectorEvidenceRetriever();
      // Identical vectors: cosine similarity = 1.0
      const vecA = [0.6, 0.8];
      const vecB = [0.6, 0.8];
      expect(retriever.calculateCosineSimilarity(vecA, vecB)).toBe(1.0);

      // Orthogonal vectors: cosine similarity = 0.0
      const vecC = [1.0, 0.0];
      const vecD = [0.0, 1.0];
      expect(retriever.calculateCosineSimilarity(vecC, vecD)).toBe(0.0);
    });
  });

  // ==========================================
  // 8. Deduplication Tests
  // ==========================================
  describe('Deduplication (deduplication.ts)', () => {
    it('normalizes URLs by stripping tracking parameters and trailing slashes', () => {
      const raw = 'https://example.com/article/?utm_source=twitter&utm_medium=cpc&fbclid=123#comments';
      const clean = deduplicator.normalizeUrl(raw);
      expect(clean).toBe('https://example.com/article');
    });

    it('generates consistent content hashes for document deduplication', () => {
      const hash1 = deduplicator.computeContentHash('Sample Article Body Text');
      const hash2 = deduplicator.computeContentHash('  Sample article body   text  ');
      expect(hash1).toBe(hash2);
    });

    it('prunes near-duplicate syndicated chunks based on token overlap', () => {
      const chunks = [
        {
          id: 'chunk_reuters',
          documentId: 'doc_1',
          text: 'India recorded an 8.2% expansion in GDP during the first quarter of the fiscal year according to official government estimates.',
          title: 'Reuters GDP News',
          url: 'https://reuters.com/news',
          domain: 'reuters.com',
          sourceType: 'MAINSTREAM_NEWS',
          sourceScore: 85,
          chunkIndex: 0,
          finalScore: 0.95,
        },
        {
          id: 'chunk_syndicated',
          documentId: 'doc_2',
          text: 'India recorded an 8.2% expansion in GDP during the first quarter of the fiscal year according to official government estimates.',
          title: 'Syndicated Partner News',
          url: 'https://syndicated.com/news',
          domain: 'syndicated.com',
          sourceType: 'GENERAL_WEB',
          sourceScore: 65,
          chunkIndex: 0,
          finalScore: 0.80,
        },
      ];

      const pruned = deduplicator.deduplicateChunks(chunks, 0.85);
      expect(pruned.length).toBe(1);
      expect(pruned[0].id).toBe('chunk_reuters');
    });
  });
});
