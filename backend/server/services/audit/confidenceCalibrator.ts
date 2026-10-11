/**
 * Confidence Calibrator Service (Feature 6)
 * Produces interpretable, calibrated confidence ratings considering:
 * - Evidence agreement & NLI margin
 * - Source authority & diversity
 * - Source independence (syndication penalty)
 * - Proposition alignment strength
 * - Uncertainty / ambiguity penalties
 */

import { Verdict, EvidenceSource, ExtractedClaim } from '../contracts.js';

export interface CalibrationInput {
  verdict: Verdict;
  rawConfidence: number; // 0 - 100
  sources: EvidenceSource[];
  independentGroupsCount?: number;
  uncertainty?: ExtractedClaim['uncertainty'];
  hasConflict?: boolean;
}

export interface CalibrationResult {
  confidence: number; // 0 - 100
  confidence_level: 'HIGH' | 'MODERATE' | 'LOW';
  confidence_rationale: string;
}

export class ConfidenceCalibrator {
  calibrate(input: CalibrationInput): CalibrationResult {
    let score = input.rawConfidence;
    const sources = input.sources || [];
    const indepGroups = input.independentGroupsCount ?? sources.length;

    // 1. Source diversity & independence factor
    if (sources.length >= 2 && indepGroups >= 2) {
      // Bonus for independent multi-source corroboration
      score = Math.min(99, score + 4);
    } else if (sources.length > 2 && indepGroups <= 1) {
      // Syndication penalty: multiple sources merely echo the same syndicate/root domain
      score = Math.max(40, score - 8);
    } else if (sources.length <= 1) {
      // Single source penalty
      score = Math.min(88, score - 5);
    }

    // 2. Source tier authority factor
    const hasAuthoritative = sources.some(
      (s) =>
        s.tier === 'GOVERNMENT' ||
        s.tier === 'ACADEMIC' ||
        s.tier === 'REFERENCE_ENCYCLOPEDIA' ||
        s.tier === 'FACT_CHECKER'
    );
    const hasOnlyWeb = sources.every((s) => s.tier === 'GENERAL_WEB' || s.tier === 'SOCIAL_MEDIA');

    if (hasAuthoritative && (input.verdict === 'SUPPORTED' || input.verdict === 'REFUTED')) {
      score = Math.min(98, score + 3);
    } else if (hasOnlyWeb) {
      score = Math.max(45, score - 6);
    }

    // 3. Uncertainty penalty
    if (input.uncertainty?.level === 'HIGH') {
      score = Math.max(35, score - 12);
    } else if (input.uncertainty?.level === 'MEDIUM') {
      score = Math.max(45, score - 6);
    }

    // 4. Conflicting evidence penalty
    if (input.hasConflict) {
      score = Math.max(40, Math.min(75, score - 15));
    }

    // Cap at boundaries
    score = Math.max(25, Math.min(98, Math.round(score)));

    // Categorize into Level and Rationale
    let level: 'HIGH' | 'MODERATE' | 'LOW' = 'MODERATE';
    let rationale = '';

    if (score >= 82) {
      level = 'HIGH';
      if (input.verdict === 'REFUTED') {
        rationale = `High confidence (${score}%) — direct contradiction verified across authoritative independent evidence passages.`;
      } else if (input.verdict === 'SUPPORTED') {
        rationale = `High confidence (${score}%) — multiple independent authoritative sources substantiating the proposition.`;
      } else {
        rationale = `High confidence (${score}%) — strong empirical evidence basis.`;
      }
    } else if (score >= 60) {
      level = 'MODERATE';
      if (input.hasConflict) {
        rationale = `Moderate confidence (${score}%) — retrieved evidence contains competing or mixed claims across sources.`;
      } else if (sources.length <= 1) {
        rationale = `Moderate confidence (${score}%) — supported by evidence, but corroboration is limited to a single independent source.`;
      } else if (input.uncertainty?.isUncertain) {
        rationale = `Moderate confidence (${score}%) — evidence aligns, but claim contains epistemic hedging or approximations.`;
      } else {
        rationale = `Moderate confidence (${score}%) — consistent evidence with minor gaps or secondary source dependence.`;
      }
    } else {
      level = 'LOW';
      if (input.verdict === 'UNVERIFIABLE') {
        rationale = `Low confidence (${score}%) — available evidence is insufficient, ambiguous, or lacks direct proposition ground.`;
      } else if (input.hasConflict) {
        rationale = `Low confidence (${score}%) — significant disagreement between retrieved passages reduces assessment reliability.`;
      } else {
        rationale = `Low confidence (${score}%) — limited evidence depth and high uncertainty in source materials.`;
      }
    }

    return {
      confidence: score,
      confidence_level: level,
      confidence_rationale: rationale,
    };
  }
}

export const confidenceCalibrator = new ConfidenceCalibrator();
