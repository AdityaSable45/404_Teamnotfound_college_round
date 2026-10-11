import crypto from 'node:crypto';
import { DetailedEvidenceChunk } from './chunker.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'session_id',
  '_ga',
  '_gl',
  'ocid',
  'msclkid',
]);

export class Deduplicator {
  /**
   * Normalizes a URL by stripping tracking parameters, hash fragments,
   * trailing slashes, and standardizing hostnames.
   */
  normalizeUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      parsed.hash = '';

      // Strip known analytics and tracking query parameters
      for (const param of Array.from(parsed.searchParams.keys())) {
        if (TRACKING_PARAMS.has(param.toLowerCase()) || param.toLowerCase().startsWith('utm_')) {
          parsed.searchParams.delete(param);
        }
      }

      // Normalize trailing slash on path
      if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.toString();
    } catch {
      return rawUrl.trim().toLowerCase();
    }
  }

  /**
   * Generates a 64-character SHA-256 fingerprint for document deduplication.
   */
  computeContentHash(text: string): string {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Filters out near-duplicate evidence chunks (e.g., syndicated wire stories across AP/Reuters/Yahoo)
   * based on token set Jaccard similarity.
   */
  deduplicateChunks(
    chunks: (DetailedEvidenceChunk & { finalScore?: number })[],
    threshold = 0.80
  ): (DetailedEvidenceChunk & { finalScore?: number })[] {
    const retained: (DetailedEvidenceChunk & { finalScore?: number })[] = [];

    for (const chunk of chunks) {
      const chunkTokens = this.tokenizeText(chunk.text);
      let isNearDuplicate = false;

      for (const existing of retained) {
        const existingTokens = this.tokenizeText(existing.text);
        const jaccard = this.calculateJaccard(chunkTokens, existingTokens);

        if (jaccard >= threshold) {
          isNearDuplicate = true;
          break;
        }
      }

      if (!isNearDuplicate) {
        retained.push(chunk);
      }
    }

    return retained;
  }

  private tokenizeText(text: string): Set<string> {
    const tokens = text.toLowerCase().match(/\b\w{3,}\b/g) || [];
    return new Set(tokens);
  }

  private calculateJaccard(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}

export const deduplicator = new Deduplicator();
