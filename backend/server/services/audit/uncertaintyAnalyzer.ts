/**
 * Uncertainty & Ambiguity Analyzer (Feature 5)
 * Analyzes claims for vague wording, epistemic hedging, absolute guarantees,
 * approximate quantities, and incomplete evidence states.
 */

export interface UncertaintyAnalysis {
  isUncertain: boolean;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
  flags: string[];
  explanation: string;
}

export class UncertaintyAnalyzer {
  private vaguePatterns = [
    { pattern: /\b(allegedly|reportedly|supposedly|purportedly)\b/i, flag: 'UNVERIFIED_HEARSAY' },
    { pattern: /\b(some\s+(?:say|claim|argue|believe)|many\s+(?:believe|think|claim))\b/i, flag: 'ATTRIBUTION_WEAKNESS' },
    { pattern: /\b(arguably|perhaps|maybe|possibly|it\s+is\s+thought\s+that)\b/i, flag: 'EPISTEMIC_HEDGE' },
    { pattern: /\b(rumored|unconfirmed|speculative|anecdotal)\b/i, flag: 'UNCONFIRMED_REPORT' },
  ];

  private absolutePatterns = [
    { pattern: /\b(always|never|everyone|nobody|no\s+one)\b/i, flag: 'UNIVERSAL_GENERALIZATION' },
    { pattern: /\b(guaranteed|100%|completely|totally|entirely|without\s+exception)\b/i, flag: 'ABSOLUTE_GUARANTEE' },
    { pattern: /\b(impossible|infallible|undeniable|irrefutable)\b/i, flag: 'UNQUALIFIED_CERTAINTY' },
  ];

  private approximationPatterns = [
    { pattern: /\b(approximately|around|roughly|nearly|about|estimated\s+(?:at|to\s+be))\b/i, flag: 'APPROXIMATE_QUANTITY' },
    { pattern: /\b(circa|c\.\s*\d{3,4}|in\s+the\s+range\s+of)\b/i, flag: 'HISTORICAL_ESTIMATE' },
  ];

  analyzeClaim(text: string): UncertaintyAnalysis {
    const clean = text.trim();
    const reasons: string[] = [];
    const flags: string[] = [];

    // 1. Check vague wording
    for (const item of this.vaguePatterns) {
      if (item.pattern.test(clean)) {
        flags.push(item.flag);
        reasons.push(`Contains hedging or hearsay language ("${item.flag.toLowerCase().replace(/_/g, ' ')}")`);
      }
    }

    // 2. Check absolute / overbroad language
    for (const item of this.absolutePatterns) {
      if (item.pattern.test(clean)) {
        flags.push(item.flag);
        reasons.push(`Uses extreme or absolute language that cannot easily be guaranteed ("${item.flag.toLowerCase().replace(/_/g, ' ')}")`);
      }
    }

    // 3. Check approximations
    for (const item of this.approximationPatterns) {
      if (item.pattern.test(clean)) {
        flags.push(item.flag);
        reasons.push(`Uses numerical or historical approximations ("${item.flag.toLowerCase().replace(/_/g, ' ')}")`);
      }
    }

    // Determine uncertainty level
    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (flags.includes('UNIVERSAL_GENERALIZATION') || flags.includes('ABSOLUTE_GUARANTEE') || flags.length >= 2) {
      level = 'HIGH';
    } else if (flags.length === 1) {
      level = 'MEDIUM';
    }

    const isUncertain = flags.length > 0;
    const explanation = isUncertain
      ? `Claim exhibits ${level.toLowerCase()} uncertainty: ${reasons.join('; ')}.`
      : 'Claim is phrased as a specific, direct assertion without prominent hedges or overbroad absolutes.';

    return {
      isUncertain,
      level,
      reasons,
      flags,
      explanation,
    };
  }
}

export const uncertaintyAnalyzer = new UncertaintyAnalyzer();
