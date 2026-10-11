import { VerifiedClaim, VerificationSummary, AuditReport } from '../contracts.js';
import { logger } from '../../utils/logger.js';
import type {
  DetailedAuditReport,
  ReportGenerationInput,
} from './reportTypes.js';
import { reportGenerator, ReportGenerator } from './reportGenerator.js';

export class AuditReporter {
  private generator: ReportGenerator;

  constructor(generator?: ReportGenerator) {
    this.generator = generator || reportGenerator;
  }

  /**
   * Feature 4: Full Evidence-Based Detailed Audit Report Generation.
   */
  async generateDetailedReport(
    input: ReportGenerationInput
  ): Promise<DetailedAuditReport> {
    logger.info('AuditReporter: Generating detailed evidence-based audit report');
    return this.generator.generateDetailedReport(input);
  }

  /**
   * Handles API requests to generate an audit report with robust validation.
   */
  async handleApiReportGeneration(body: unknown): Promise<{
    status: number;
    data: DetailedAuditReport | { error: string };
  }> {
    if (!body || typeof body !== 'object') {
      return {
        status: 400,
        data: { error: 'Request body must be a valid JSON object' },
      };
    }

    const payload = body as Record<string, unknown>;
    const originalAnswer = typeof payload.original_answer === 'string' ? payload.original_answer : '';
    const claims = Array.isArray(payload.claims) ? payload.claims : undefined;
    const verifiedClaims = Array.isArray(payload.verified_claims) ? payload.verified_claims : undefined;

    if (!claims && !verifiedClaims) {
      return {
        status: 400,
        data: { error: 'Must provide either claims or verified_claims array' },
      };
    }

    try {
      const report = await this.generateDetailedReport({
        original_answer: originalAnswer,
        claims: claims as any,
        verified_claims: verifiedClaims as any,
        report_id: typeof payload.report_id === 'string' ? payload.report_id : undefined,
        custom_limitations: Array.isArray(payload.custom_limitations) ? (payload.custom_limitations as string[]) : undefined,
        use_llm_summary: Boolean(payload.use_llm_summary),
      });

      return {
        status: 200,
        data: report,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Report generation error';
      logger.error('AuditReporter: Error during report generation', { error: msg });
      return {
        status: 500,
        data: { error: 'Failed to generate audit report' },
      };
    }
  }

  /**
   * Exports report to JSON string.
   */
  exportToJson(report: DetailedAuditReport): string {
    return this.generator.exportToJson(report);
  }

  /**
   * Exports report to print-friendly HTML string.
   */
  exportToHtml(report: DetailedAuditReport): string {
    return this.generator.exportToHtml(report);
  }

  // =========================================================================
  // Backward-Compatible Methods (retained for existing pipeline & test suite)
  // =========================================================================

  /**
   * Generates a structured audit report with executive summary and key risk analysis.
   */
  generateAuditReport(
    verifiedClaims: VerifiedClaim[],
    summary: VerificationSummary
  ): AuditReport {
    logger.info(`AuditReporter: Generating legacy audit report for ${verifiedClaims.length} claims`);

    const total = verifiedClaims.length;
    const supported = verifiedClaims.filter((c) => c.verdict === 'SUPPORTED').length;
    const refuted = verifiedClaims.filter((c) => c.verdict === 'REFUTED').length;
    const misleading = verifiedClaims.filter((c) => c.verdict === 'MISLEADING').length;
    const unverifiable = verifiedClaims.filter((c) => c.verdict === 'UNVERIFIABLE').length;

    // Executive summary synthesis
    let executiveSummary = '';
    if (total === 0) {
      executiveSummary = 'No verifiable factual assertions were detected in the audited text.';
    } else if (summary.accuracy_score >= 80) {
      executiveSummary = `High reliability audit: ${supported} of ${total} claims were substantiated by authoritative external evidence with strong grounding.`;
    } else if (summary.accuracy_score >= 50) {
      executiveSummary = `Moderate reliability: Evidence indicates mixed accuracy with ${refuted} refuted and ${misleading} potentially misleading or contested claims.`;
    } else {
      executiveSummary = `Low reliability warning: Multiple key claims were contradicted or refuted by authoritative records (${refuted} refuted out of ${total} claims).`;
    }

    // Identify risk factors
    const keyRiskFactors: string[] = [];
    if (refuted > 0) {
      keyRiskFactors.push(`Contains ${refuted} demonstrably false assertion(s) contradicted by official evidence.`);
    }
    if (misleading > 0) {
      keyRiskFactors.push(`Contains ${misleading} statement(s) missing crucial context or presenting contested views as fact.`);
    }
    if (unverifiable > 0) {
      keyRiskFactors.push(`Unable to corroborate ${unverifiable} statement(s) with reputable public sources.`);
    }

    return {
      title: 'Second Opinion Fact-Check & Verification Audit',
      generatedAt: new Date().toISOString(),
      overallAccuracyScore: summary.accuracy_score,
      executiveSummary,
      verdictBreakdown: {
        supported,
        refuted,
        misleading,
        unverifiable,
        total,
      },
      claimsAudit: verifiedClaims,
      keyRiskFactors,
    };
  }
}

export const auditReporter = new AuditReporter();
