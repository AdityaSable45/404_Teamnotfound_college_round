import dotenv from 'dotenv';
import {
  ExtractedClaim,
  VerifiedClaim,
  ClaimVerificationResponse,
} from './contracts.js';
import { logger } from '../utils/logger.js';
import { retrievalEngine } from './retrieval/index.js';
import { sourceFilter } from './retrieval/sourceFilter.js';
import { auditEngine } from './audit/index.js';
import { confidenceCalibrator } from './audit/confidenceCalibrator.js';
import { conflictDetector } from './audit/conflictDetector.js';
import { whyWrongGenerator } from './audit/whyWrongGenerator.js';

export interface VerificationOptions {
  mode?: 'quick' | 'deep' | 'research' | 'manual' | 'web';
  evidence_text?: string;
  file_metadata?: Array<{ name: string; size: number; type?: string }>;
  original_answer?: string;
  language?: string;
}

export class ClaimVerificationService {
  async verifyClaims(
    claims: ExtractedClaim[],
    options?: VerificationOptions
  ): Promise<ClaimVerificationResponse> {
    const startTime = Date.now();
    dotenv.config({ override: true });

    const auditMode = options?.mode || 'deep';
    const isManual = auditMode === 'manual';
    logger.info(
      `Starting ${isManual ? 'manual evidence' : 'live evidence'}-based verification for ${claims.length} claims (mode=${auditMode})`
    );

    const verifiedClaims: VerifiedClaim[] = [];
    const providerName = isManual
      ? 'manual-evidence-nli'
      : (process.env.LLM_PROVIDER || 'live-search-nli').toLowerCase();

    for (const claim of claims) {
      let sources = [];

      if (isManual) {
        if (options?.evidence_text) {
          sources.push({
            title: options.file_metadata?.length
              ? `Manual Notes & Document Reference (${options.file_metadata.map((f) => f.name).join(', ')})`
              : 'User-Provided Evidence Text',
            snippet: options.evidence_text,
            url: '',
            publisher: 'Manual Evidence',
          });
        } else if (options?.file_metadata?.length) {
          sources.push({
            title: `Uploaded Document: ${options.file_metadata.map((f) => f.name).join(', ')}`,
            snippet: `Reference document provided by user: ${options.file_metadata.map((f) => f.name).join(', ')}.`,
            url: '',
            publisher: 'Uploaded Document',
          });
        }
      } else {
        // 1. Retrieval Domain: Search -> Filter (with mode policy) -> Vector Retrieval
        const retrievalResult = await retrievalEngine.retrieveEvidence(claim);
        sources = retrievalResult.rawSources;
      }

      // Feature 13: Source Independence Clustering
      const clusterResult = sourceFilter.clusterIndependentEvidenceGroups(sources);
      const activeSources = clusterResult.sources;
      const indepGroupsCount = clusterResult.independentGroupsCount;

      // 2. Audit Domain: Evidence-grounded NLI evaluation
      const nliResult = await auditEngine.verifier.verifyWithEvidence(claim, activeSources);

      // Feature 9: Evidence Conflict Detection
      const contradictingSources =
        nliResult.verdict === 'REFUTED' || nliResult.verdict === 'MISLEADING'
          ? activeSources
          : [];
      const supportingSources =
        nliResult.verdict === 'SUPPORTED'
          ? activeSources
          : [];

      const conflictResult = conflictDetector.detectConflict(supportingSources, contradictingSources);

      // Feature 8: "Why is this wrong?" generation for Refuted/Misleading assertions
      const whyWrong = whyWrongGenerator.generate(
        claim.normalized_claim,
        nliResult.verdict,
        nliResult.confidence,
        contradictingSources
      );

      // Feature 6: Confidence Calibration with interpretable rationale
      const calibrated = confidenceCalibrator.calibrate({
        verdict: nliResult.verdict,
        rawConfidence: nliResult.confidence,
        sources: activeSources,
        independentGroupsCount: indepGroupsCount,
        uncertainty: claim.uncertainty,
        hasConflict: conflictResult.hasConflict,
      });

      verifiedClaims.push({
        ...claim,
        verdict: nliResult.verdict,
        confidence: calibrated.confidence,
        confidence_level: calibrated.confidence_level,
        confidence_rationale: calibrated.confidence_rationale,
        explanation: nliResult.explanation,
        sources: activeSources,
        why_is_this_wrong: whyWrong,
        conflict: conflictResult.hasConflict ? conflictResult : undefined,
        evidence_groups_count: indepGroupsCount,
        total_sources_count: activeSources.length,
      });
    }

    const total = verifiedClaims.length;
    const supported = verifiedClaims.filter((c) => c.verdict === 'SUPPORTED').length;
    const refuted = verifiedClaims.filter((c) => c.verdict === 'REFUTED').length;
    const misleading = verifiedClaims.filter((c) => c.verdict === 'MISLEADING').length;
    const unverifiable = verifiedClaims.filter((c) => c.verdict === 'UNVERIFIABLE').length;

    // Accuracy score: supported + half of misleading / total
    const accuracyScore =
      total > 0
        ? Math.round(((supported + 0.5 * misleading) / total) * 100)
        : 100;

    const avgConfidence =
      total > 0
        ? Math.round(verifiedClaims.reduce((acc, c) => acc + c.confidence, 0) / total)
        : 100;

    const totalConflicts = verifiedClaims.filter((c) => c.conflict?.hasConflict).length;

    const elapsed = Date.now() - startTime;

    // 3. Reasoning Domain (Feature 4): Reasoning Consistency Checks
    const rawAnswer = options?.original_answer || claims.map((c) => c.original_text).join(' ');
    let reasoningIssues: any[] = [];
    let reasoningSummary: any = undefined;

    try {
      const reasoningRes = await auditEngine.reasoning.audit({
        answer: rawAnswer,
        claims,
        verifiedClaims,
      });
      reasoningIssues = reasoningRes.issues;
      reasoningSummary = reasoningRes.summary;
    } catch (err: unknown) {
      logger.warn('ClaimVerifier: Reasoning audit error, continuing without reasoning issues', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Explanation Domain: Audit Report Synthesis
    const auditReport = auditEngine.reporter.generateAuditReport(verifiedClaims, {
      total,
      supported,
      refuted,
      misleading,
      unverifiable,
      accuracy_score: accuracyScore,
      average_confidence: avgConfidence,
      total_conflicts: totalConflicts,
    });

    logger.info(
      `Verification finished in ${elapsed}ms. Accuracy: ${accuracyScore}%. Executive Summary: "${auditReport.executiveSummary}"`
    );

    return {
      verified_claims: verifiedClaims,
      summary: {
        total,
        supported,
        refuted,
        misleading,
        unverifiable,
        accuracy_score: accuracyScore,
        average_confidence: avgConfidence,
        total_conflicts: totalConflicts,
      },
      detected_language: claims[0]?.language || 'en',
      audit_mode: auditMode,
      reasoning_issues: reasoningIssues,
      reasoning_summary: reasoningSummary,
      metadata: {
        processing_time_ms: elapsed,
        provider: providerName,
      },
    };
  }
}

export const claimVerifierService = new ClaimVerificationService();
