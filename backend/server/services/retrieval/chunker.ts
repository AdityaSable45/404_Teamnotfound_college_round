import crypto from 'node:crypto';
import { ExtractedDocument } from './contentExtractor.js';

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface DetailedEvidenceChunk {
  id: string;
  documentId: string;
  text: string;
  title: string;
  url: string;
  domain: string;
  sourceType: string;
  sourceScore: number;
  chunkIndex: number;
  publishedAt?: string;
  author?: string;
}

export class DocumentChunker {
  private defaultChunkSize: number;
  private defaultChunkOverlap: number;

  constructor(options?: ChunkOptions) {
    this.defaultChunkSize =
      options?.chunkSize ?? Number(process.env.CHUNK_SIZE || 800);
    this.defaultChunkOverlap =
      options?.chunkOverlap ?? Number(process.env.CHUNK_OVERLAP || 100);
  }

  /**
   * Chunks a document in a sentence/paragraph-aware manner and generates
   * deterministic, content-hashed IDs.
   */
  chunkDocument(
    doc: ExtractedDocument,
    metadata: {
      documentId: string;
      domain: string;
      sourceType: string;
      sourceScore: number;
    },
    options?: ChunkOptions
  ): DetailedEvidenceChunk[] {
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkOverlap = options?.chunkOverlap ?? this.defaultChunkOverlap;

    const rawText = doc.text.trim();
    if (!rawText) return [];

    // 1. Break into atomic sentences / paragraphs
    const paragraphs = rawText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const sentences: string[] = [];

    for (const paragraph of paragraphs) {
      // Split on sentence boundaries while preserving punctuation
      const sentenceMatches = paragraph
        .split(/(?<=[.?!])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (sentenceMatches.length > 0) {
        sentences.push(...sentenceMatches);
      } else {
        sentences.push(paragraph);
      }
    }

    if (sentences.length === 0) return [];

    // 2. Assemble chunks respecting sentence boundaries and overlap
    const chunks: DetailedEvidenceChunk[] = [];
    let currentSentences: string[] = [];
    let currentLength = 0;
    let chunkIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLen = sentence.length;

      // If adding this sentence exceeds chunk size and we already have content
      if (currentLength + sentenceLen > chunkSize && currentSentences.length > 0) {
        const chunkText = currentSentences.join(' ').trim();
        if (chunkText.length >= 25) {
          const chunkId = this.generateDeterministicId(
            metadata.documentId,
            chunkIndex,
            chunkText
          );

          chunks.push({
            id: chunkId,
            documentId: metadata.documentId,
            text: chunkText,
            title: doc.title,
            url: doc.canonicalUrl,
            domain: metadata.domain,
            sourceType: metadata.sourceType,
            sourceScore: metadata.sourceScore,
            chunkIndex,
            publishedAt: doc.publishedAt,
            author: doc.author,
          });
          chunkIndex++;
        }

        // Apply overlap: keep trailing sentences that fit within chunkOverlap
        const overlapSentences: string[] = [];
        let overlapLen = 0;
        for (let j = currentSentences.length - 1; j >= 0; j--) {
          const s = currentSentences[j];
          if (overlapLen + s.length <= chunkOverlap) {
            overlapSentences.unshift(s);
            overlapLen += s.length;
          } else {
            break;
          }
        }

        currentSentences = overlapSentences;
        currentLength = overlapLen;
      }

      currentSentences.push(sentence);
      currentLength += sentenceLen;
    }

    // Add trailing chunk
    if (currentSentences.length > 0) {
      const chunkText = currentSentences.join(' ').trim();
      if (chunkText.length >= 25) {
        const chunkId = this.generateDeterministicId(
          metadata.documentId,
          chunkIndex,
          chunkText
        );

        chunks.push({
          id: chunkId,
          documentId: metadata.documentId,
          text: chunkText,
          title: doc.title,
          url: doc.canonicalUrl,
          domain: metadata.domain,
          sourceType: metadata.sourceType,
          sourceScore: metadata.sourceScore,
          chunkIndex,
          publishedAt: doc.publishedAt,
          author: doc.author,
        });
      }
    }

    return chunks;
  }

  /**
   * Deterministic SHA-256 hash based on documentId, chunkIndex, and normalized text.
   */
  private generateDeterministicId(
    documentId: string,
    chunkIndex: number,
    text: string
  ): string {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    return crypto
      .createHash('sha256')
      .update(`${documentId}_${chunkIndex}_${normalized}`)
      .digest('hex')
      .slice(0, 16);
  }
}

export const documentChunker = new DocumentChunker();
