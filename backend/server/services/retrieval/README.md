# Developer 1 Domain: Retrieval Pipeline

This directory isolates the complete search, source filtering, web content scraping, chunking, dense embeddings, and semantic vector retrieval pipeline.

## Architecture

```text
Claim / Query
  ↓
1. SearchEngine (SearchProvider abstraction: DuckDuckGo, Wikipedia, extensible)
  ↓
2. SourceFilter (Government, academic, fact-checkers, news tiers & domain scoring)
  ↓
3. PageFetcher (SSRF protection, private IP blocking, safe redirects, size & timeout caps)
  ↓
4. ContentExtractor (Cheerio HTML-to-text cleanup, boilerplate & navigation removal)
  ↓
5. DocumentChunker (Sentence-aware splitting, deterministic SHA-256 chunk IDs)
  ↓
6. EmbeddingProvider (Dense semantic vectors: OpenAI text-embedding-3 or local feature hashing)
  ↓
7. VectorEvidenceRetriever (Cosine similarity + multi-factor composite ranking)
  ↓
8. Deduplicator (URL parameter sanitization, content hashing, near-duplicate pruning)
  ↓
Top-K Grounded Evidence Chunks
```

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SEARCH_TIMEOUT_MS` | `8000` | AbortController timeout for external search queries |
| `PAGE_FETCH_TIMEOUT_MS` | `10000` | AbortController timeout for full webpage fetching |
| `MAX_PAGE_SIZE_BYTES` | `5000000` | Maximum allowed page payload size (5 MB) |
| `CHUNK_SIZE` | `800` | Target character length for document chunking |
| `CHUNK_OVERLAP` | `100` | Sentence overlap between contiguous chunks |
| `EMBEDDING_PROVIDER` | `dense-semantic` | `openai` or `dense-semantic` (deterministic local dense vectors) |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Model name when using OpenAI embeddings |
| `OPENAI_API_KEY` | *(optional)* | API key for OpenAI embeddings |
| `SIMILARITY_WEIGHT` | `0.70` | Weight for vector cosine similarity in ranking |
| `SOURCE_SCORE_WEIGHT` | `0.20` | Weight for source credibility score in ranking |
| `FRESHNESS_WEIGHT` | `0.10` | Weight for source publication freshness |

## Public Export

```typescript
import { retrievalEngine } from './index.js';

// Accepts either string query or ExtractedClaim object
const result = await retrievalEngine.retrieveEvidence("India's GDP grew by 8.2% in Q1 2025");
console.log(result.evidence);
```
