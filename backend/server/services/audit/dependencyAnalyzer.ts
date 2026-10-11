/**
 * Claim Dependency & Relationship Analyzer (Feature 14)
 * Maps premise-to-conclusion chains, sequential dependencies, and flags
 * when conclusions depend on refuted or unverified premises.
 */

import { ExtractedClaim, VerifiedClaim } from '../contracts.js';

export interface ClaimDependencyNode {
  claimId: string;
  dependsOnClaimIds: string[];
  isConclusion: boolean;
  issueWarning?: string;
}

export class DependencyAnalyzer {
  private causalConnectives = [
    /\b(therefore|thus|hence|consequently|as\s+a\s+result|which\s+means\s+that|proves\s+that)\b/i,
    /\b(because\s+of\s+this|for\s+this\s+reason|leading\s+to|demonstrating\s+that)\b/i,
  ];

  analyzeDependencies(
    claims: ExtractedClaim[],
    verifiedClaims?: VerifiedClaim[]
  ): ClaimDependencyNode[] {
    const nodes: ClaimDependencyNode[] = [];
    const verifiedMap = new Map<string, VerifiedClaim>();
    if (verifiedClaims) {
      verifiedClaims.forEach((vc) => verifiedMap.set(vc.id, vc));
    }

    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      const text = claim.original_text.toLowerCase();
      const dependsOn: string[] = [];
      let isConclusion = false;

      // 1. Check if sentence starts or contains explicit inferential connective
      const hasCausal = this.causalConnectives.some((p) => p.test(text));
      if (hasCausal && i > 0) {
        isConclusion = true;
        // Typically depends on the immediate preceding claim or prior premise
        dependsOn.push(claims[i - 1].id);
      }

      // 2. Anaphoric pronoun reference to prior claim subject
      if (i > 0 && /^(it|this|that|these|they)\b/i.test(claim.original_text.trim())) {
        if (!dependsOn.includes(claims[i - 1].id)) {
          dependsOn.push(claims[i - 1].id);
        }
      }

      // 3. Dependency status check: does this claim depend on an unverified or refuted premise?
      let issueWarning: string | undefined;
      for (const parentId of dependsOn) {
        const parentVerified = verifiedMap.get(parentId);
        if (parentVerified) {
          if (parentVerified.verdict === 'REFUTED') {
            issueWarning = `Dependency Risk: Depends on Claim #${parentId.replace('claim_', '')}, which was REFUTED.`;
            break;
          } else if (parentVerified.verdict === 'UNVERIFIABLE') {
            issueWarning = `Dependency Risk: Depends on Claim #${parentId.replace('claim_', '')}, which could not be verified.`;
            break;
          }
        }
      }

      nodes.push({
        claimId: claim.id,
        dependsOnClaimIds: dependsOn,
        isConclusion,
        issueWarning,
      });
    }

    return nodes;
  }
}

export const dependencyAnalyzer = new DependencyAnalyzer();
