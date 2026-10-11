import { SourceTier, EvidenceChunk } from '../contracts.js';
import { DetailedEvidenceChunk } from './chunker.js';
import { EmbeddingProvider, getEmbeddingProvider } from './embeddingProvider.js';
import { deduplicator } from './deduplication.js';
import { logger } from '../../utils/logger.js';

export interface RankedEvidenceChunk extends EvidenceChunk, DetailedEvidenceChunk {
  similarity: number;
  finalScore: number;
}

export class VectorEvidenceRetriever {
  private embeddingProvider: EmbeddingProvider;
  private similarityWeight: number;
  private sourceScoreWeight: number;
  private freshnessWeight: number;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider || getEmbeddingProvider();
    this.similarityWeight = Number(process.env.SIMILARITY_WEIGHT || 0.7);
    this.sourceScoreWeight = Number(process.env.SOURCE_SCORE_WEIGHT || 0.2);
    this.freshnessWeight = Number(process.env.FRESHNESS_WEIGHT || 0.1);
  }

  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  /**
   * Embeds the claim and chunks, calculates cosine similarity, ranks by weighted composite score,
   * deduplicates near-duplicate evidence passages, and returns the top-K grounded chunks.
   */
  async rankEvidenceChunks(
    claimText: string,
    claimId: string,
    chunks: DetailedEvidenceChunk[],
    topK = 5
  ): Promise<RankedEvidenceChunk[]> {
    if (chunks.length === 0) return [];

    logger.info(
      `VectorEvidenceRetriever: Embedding & ranking ${chunks.length} chunks using provider '${this.embeddingProvider.name}'`
    );

    // 1 & 2. Generate embeddings with automatic fallback on provider failure
    let queryVec: number[];
    let chunkVectors: number[][];

    try {
      queryVec = await this.embeddingProvider.embed(claimText);
      const chunkTexts = chunks.map((c) => c.text);
      chunkVectors = this.embeddingProvider.embedBatch
        ? await this.embeddingProvider.embedBatch(chunkTexts)
        : await Promise.all(chunkTexts.map((t) => this.embeddingProvider.embed(t)));
    } catch (err: unknown) {
      logger.warn(
        `Active embedding provider '${this.embeddingProvider.name}' failed (${err}). Falling back to LocalDenseEmbeddingProvider.`
      );
      const { LocalDenseEmbeddingProvider } = await import('./embeddingProvider.js');
      const fallbackProvider = new LocalDenseEmbeddingProvider();
      queryVec = await fallbackProvider.embed(claimText);
      chunkVectors = await fallbackProvider.embedBatch(chunks.map((c) => c.text));
    }

    // 3. Compute cosine similarity & composite relevance score
    const scoredChunks: RankedEvidenceChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkVec = chunkVectors[i];

      const similarity = this.calculateCosineSimilarity(queryVec, chunkVec);
      const normalizedSourceScore = Math.min(1.0, Math.max(0.0, chunk.sourceScore / 100));
      const freshnessScore = this.calculateFreshnessScore(chunk.publishedAt);

      // Relevance score (NOT truth probability - strictly evidence ranking)
      const finalScore = Math.round(
        (similarity * this.similarityWeight +
          normalizedSourceScore * this.sourceScoreWeight +
          freshnessScore * this.freshnessWeight) * 100
      ) / 100;

      const tier = this.mapSourceTypeToTier(chunk.sourceType);

      scoredChunks.push({
        ...chunk,
        claimId,
        sourceUrl: chunk.url,
        sourceTitle: chunk.title,
        publisher: chunk.domain,
        similarityScore: similarity,
        similarity,
        finalScore,
        tier,
      });
    }

    // 4. Sort descending by composite finalScore
    scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

    // 5. Deduplicate near-identical syndicated chunks
    const deduplicated = deduplicator.deduplicateChunks(scoredChunks, 0.8) as RankedEvidenceChunk[];

    return deduplicated.slice(0, topK);
  }

  /**
   * Cosine similarity between two dense numeric vectors: (u · v) / (||u|| * ||v||)
   */
  calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    // Clamp to [0, 1] for normalized semantic distance
    const clamped = Math.max(0, Math.min(1, sim));
    return Math.round(clamped * 100) / 100;
  }

  private calculateFreshnessScore(publishedAt?: string): number {
    if (!publishedAt) return 0.5; // neutral baseline if publication date unknown
    try {
      const pubDate = new Date(publishedAt).getTime();
      if (isNaN(pubDate)) return 0.5;

      const ageMs = Date.now() - pubDate;
      const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
      const ageYears = ageMs / oneYearMs;

      if (ageYears <= 1) return 1.0;
      if (ageYears <= 2) return 0.85;
      if (ageYears <= 5) return 0.7;
      return 0.5;
    } catch {
      return 0.5;
    }
  }

  private mapSourceTypeToTier(sourceType: string): SourceTier {
    switch (sourceType.toUpperCase()) {
      case 'FACT_CHECKER':
        return 'FACT_CHECKER';
      case 'GOVERNMENT':
        return 'GOVERNMENT';
      case 'ACADEMIC':
        return 'ACADEMIC';
      case 'MAINSTREAM_NEWS':
        return 'MAINSTREAM_NEWS';
      case 'UNTRUSTED':
        return 'UNTRUSTED';
      default:
        return 'GENERAL_WEB';
    }
  }
}

export const vectorEvidenceRetriever = new VectorEvidenceRetriever();
