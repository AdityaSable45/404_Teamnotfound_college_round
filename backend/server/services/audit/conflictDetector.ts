/**
 * Evidence Conflict Detector (Feature 9)
 * Detects, weighs, and reports competing claims across retrieved evidence passages.
 * Prevents low-quality sources from overwhelming authoritative findings.
 */

import { EvidenceSource, FilteredSource } from '../contracts.js';

export interface ConflictAssessment {
  hasConflict: boolean;
  supportingCount: number;
  contradictingCount: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
  authoritativeDominance: boolean;
}

export class ConflictDetector {
  detectConflict(
    supportingSources: EvidenceSource[],
    contradictingSources: EvidenceSource[]
  ): ConflictAssessment {
    const supCount = supportingSources.length;
    const conCount = contradictingSources.length;

    if (supCount === 0 || conCount === 0) {
      return {
        hasConflict: false,
        supportingCount: supCount,
        contradictingCount: conCount,
        severity: 'LOW',
        explanation: 'No competing evidentiary claims detected.',
        authoritativeDominance: false,
      };
    }

    // Evaluate authority of supporting vs contradicting
    const isAuthoritative = (s: EvidenceSource) => {
      const tier = (s as FilteredSource).tier;
      return (
        tier === 'GOVERNMENT' ||
        tier === 'ACADEMIC' ||
        tier === 'REFERENCE_ENCYCLOPEDIA' ||
        tier === 'FACT_CHECKER' ||
        (s.url && /\.(gov|edu|mil)\b/i.test(s.url))
      );
    };

    const supAuth = supportingSources.filter(isAuthoritative).length;
    const conAuth = contradictingSources.filter(isAuthoritative).length;

    let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    let authoritativeDominance = false;
    let explanation = '';

    if (supAuth > 0 && conAuth === 0) {
      authoritativeDominance = true;
      severity = 'LOW';
      explanation = `Authoritative consensus: ${supAuth} high-credibility sources support the claim, while disputing sources lack official or academic authority.`;
    } else if (conAuth > 0 && supAuth === 0) {
      authoritativeDominance = true;
      severity = 'HIGH';
      explanation = `Authoritative refutation: ${conAuth} high-credibility sources contradict the claim, outweighing weaker supporting snippets.`;
    } else if (supAuth > 0 && conAuth > 0) {
      severity = 'HIGH';
      explanation = `Substantive scholarly/official dispute: ${supAuth} authoritative sources substantiate the claim, while ${conAuth} authoritative sources present contrary findings.`;
    } else {
      severity = 'MEDIUM';
      explanation = `Competing general web reports: ${supCount} sources support versus ${conCount} sources contradict, without dominant institutional authority.`;
    }

    return {
      hasConflict: true,
      supportingCount: supCount,
      contradictingCount: conCount,
      severity,
      explanation,
      authoritativeDominance,
    };
  }
}

export const conflictDetector = new ConflictDetector();
