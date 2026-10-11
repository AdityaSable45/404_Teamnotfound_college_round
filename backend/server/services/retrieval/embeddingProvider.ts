import crypto from 'node:crypto';
import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * OpenAI dense embeddings provider using text-embedding-3-small or configured model.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimension: number;
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model = 'text-embedding-3-small') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured for OpenAIEmbeddingProvider');
    }
    this.client = new OpenAI({ apiKey: key });
    this.model = process.env.EMBEDDING_MODEL || model;
    this.dimension = this.model.includes('3-large') ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const batch = await this.embedBatch([text]);
    return batch[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const sanitized = texts.map((t) => t.replace(/\n+/g, ' ').trim() || 'empty');
    const response = await this.client.embeddings.create({
      model: this.model,
      input: sanitized,
    });

    return response.data.map((item) => item.embedding);
  }
}

/**
 * Deterministic dense semantic feature hashing embedding provider.
 * Maps arbitrary text into a fixed-dimension dense vector space (default: 256 dimensions)
 * with subword n-grams, word tokens, and L2 normalization.
 * Requires zero external API keys and guarantees reproducible dense vectors.
 */
export class LocalDenseEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'dense-semantic';
  readonly dimension: number;

  constructor(dimension = 256) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    return this.generateDenseVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.generateDenseVector(t));
  }

  private generateDenseVector(text: string): number[] {
    const vec = new Float64Array(this.dimension);
    const normalized = text.toLowerCase().trim();

    if (!normalized) {
      return Array.from(vec);
    }

    // 1. Extract words and subwords (character n-grams of length 3 to 5)
    const tokens = normalized.match(/\b\w+\b/g) || [];
    const ngrams: string[] = [];

    for (const token of tokens) {
      // Add full word
      ngrams.push(`w:${token}`);
      // Add subwords for morphological root matching
      if (token.length >= 3) {
        for (let i = 0; i <= token.length - 3; i++) {
          ngrams.push(`ng:${token.slice(i, i + 3)}`);
        }
      }
    }

    // 2. Hash each feature into the vector space with Murmur-like deterministic hashing
    for (const gram of ngrams) {
      const hash = this.hashString(gram);
      const index = Math.abs(hash) % this.dimension;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vec[index] += sign * (gram.startsWith('w:') ? 1.5 : 0.8);
    }

    // 3. L2 Normalize the vector so norm = 1.0
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSq += vec[i] * vec[i];
    }

    const norm = Math.sqrt(sumSq);
    if (norm > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vec[i] /= norm;
      }
    }

    return Array.from(vec);
  }

  private hashString(str: string): number {
    const md5 = crypto.createHash('md5').update(str).digest();
    return md5.readInt32LE(0);
  }
}

/**
 * Factory to instantiate the appropriate EmbeddingProvider based on environment.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const preferred = (process.env.EMBEDDING_PROVIDER || '').toLowerCase().trim();

  if (preferred === 'openai' && process.env.OPENAI_API_KEY) {
    try {
      return new OpenAIEmbeddingProvider();
    } catch (err: unknown) {
      logger.warn(`Failed to initialize OpenAIEmbeddingProvider, falling back to LocalDenseEmbeddingProvider: ${err}`);
    }
  }

  return new LocalDenseEmbeddingProvider();
}
