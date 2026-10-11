import type {
  ClaimAssessment,
  EvidenceComparisonResult,
} from './nliTypes.js';

export interface AggregatorOptions {
  entailmentThreshold?: number;     // default 0.65
  contradictionThreshold?: number;  // default 0.65
  neutralThreshold?: number;        // default 0.60
  minDistinctSources?: number;      // default 1
}

export interface AggregationResult {
  assessment: ClaimAssessment;
  explanation: string;
  supportingSourceCount: number;
  contradictingSourceCount: number;
  distinctSourcesCount: number;
}

/**
 * Normalizes a URL or title to extract a distinct source key.
 * Prevents counting multiple passages from the same source as independent corroboration.
 */
export function extractSourceKey(url?: string, title?: string): string {
  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      // Fall through to title or raw string
    }
  }
  return (title || url || 'unknown_source').trim().toLowerCase();
}

export function isUntrustedUserForum(url?: string, title?: string): boolean {
  return /(reddit\.com|facebook\.com|twitter\.com|x\.com|quora\.com|instagram\.com|tiktok\.com|pinterest\.com|zhihu\.com)/i.test(
    url || title || ''
  );
}

export class NLIAggregator {
  private entailmentThreshold: number;
  private contradictionThreshold: number;
  private minDistinctSources: number;

  constructor(options?: AggregatorOptions) {
    this.entailmentThreshold = options?.entailmentThreshold ?? 0.65;
    this.contradictionThreshold = options?.contradictionThreshold ?? 0.65;
    this.minDistinctSources = options?.minDistinctSources ?? 1;
  }

  aggregate(
    claimText: string,
    evidenceResults: EvidenceComparisonResult[]
  ): AggregationResult {
    if (!evidenceResults || evidenceResults.length === 0) {
      return {
        assessment: 'INCONCLUSIVE',
        explanation: 'No evidence passages were provided to evaluate this claim.',
        supportingSourceCount: 0,
        contradictingSourceCount: 0,
        distinctSourcesCount: 0,
      };
    }

    // Group passages by distinct source to prevent duplication bias
    const sourcesByLabel = {
      supporting: new Map<string, EvidenceComparisonResult[]>(),
      contradicting: new Map<string, EvidenceComparisonResult[]>(),
      neutral: new Map<string, EvidenceComparisonResult[]>(),
    };

    const allDistinctSources = new Set<string>();

    for (const result of evidenceResults) {
      const sourceKey = extractSourceKey(result.source_url, result.source_title);
      allDistinctSources.add(sourceKey);

      if (
        result.nli_label === 'ENTAILMENT' &&
        result.scores.entailment >= this.entailmentThreshold &&
        !isUntrustedUserForum(result.source_url, result.source_title)
      ) {
        const existing = sourcesByLabel.supporting.get(sourceKey) || [];
        existing.push(result);
        sourcesByLabel.supporting.set(sourceKey, existing);
      } else if (
        result.nli_label === 'CONTRADICTION' &&
        result.scores.contradiction >= this.contradictionThreshold &&
        !isUntrustedUserForum(result.source_url, result.source_title)
      ) {
        const existing = sourcesByLabel.contradicting.get(sourceKey) || [];
        existing.push(result);
        sourcesByLabel.contradicting.set(sourceKey, existing);
      } else {
        const existing = sourcesByLabel.neutral.get(sourceKey) || [];
        existing.push(result);
        sourcesByLabel.neutral.set(sourceKey, existing);
      }
    }

    const supportingSourceCount = sourcesByLabel.supporting.size;
    const contradictingSourceCount = sourcesByLabel.contradicting.size;
    const distinctSourcesCount = allDistinctSources.size;

    // Case 1: Conflicting evidence from credible sources -> MIXED
    if (supportingSourceCount > 0 && contradictingSourceCount > 0) {
      const supportingSourceNames = Array.from(sourcesByLabel.supporting.values())
        .map((arr) => arr[0]?.source_title)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');
      const contradictingSourceNames = Array.from(sourcesByLabel.contradicting.values())
        .map((arr) => arr[0]?.source_title)
        .filter(Boolean)
        .slice(0, 2)
        .join(', ');

      return {
        assessment: 'MIXED',
        explanation: `Evidence presents conflicting findings: substantiated by source(s) [${supportingSourceNames || 'supporting'}], but contradicted by source(s) [${contradictingSourceNames || 'contradicting'}].`,
        supportingSourceCount,
        contradictingSourceCount,
        distinctSourcesCount,
      };
    }

    // Case 2: Sufficient distinct contradiction -> CONTRADICTED
    if (contradictingSourceCount >= this.minDistinctSources) {
      const bestResult = Array.from(sourcesByLabel.contradicting.values())
        .flat()
        .sort((a, b) => b.scores.contradiction - a.scores.contradiction)[0];

      return {
        assessment: 'CONTRADICTED',
        explanation: `Supplied evidence from ${bestResult?.source_title || 'retrieved source'} directly contradicts this assertion. Passage excerpt: "${bestResult?.passage?.slice(0, 140)}..."`,
        supportingSourceCount,
        contradictingSourceCount,
        distinctSourcesCount,
      };
    }

    // Case 3: Sufficient distinct entailment -> SUPPORTED
    if (supportingSourceCount >= this.minDistinctSources) {
      const bestResult = Array.from(sourcesByLabel.supporting.values())
        .flat()
        .sort((a, b) => b.scores.entailment - a.scores.entailment)[0];

      return {
        assessment: 'SUPPORTED',
        explanation: `Supplied evidence from ${bestResult?.source_title || 'retrieved source'} substantiates this assertion. Passage excerpt: "${bestResult?.passage?.slice(0, 140)}..."`,
        supportingSourceCount,
        contradictingSourceCount,
        distinctSourcesCount,
      };
    }

    // Case 4: Default / weak / neutral evidence -> INCONCLUSIVE
    return {
      assessment: 'INCONCLUSIVE',
      explanation:
        'The provided evidence passages contain insufficient or neutral information to definitively substantiate or contradict the claim.',
      supportingSourceCount,
      contradictingSourceCount,
      distinctSourcesCount,
    };
  }
}

export const nliAggregator = new NLIAggregator();
