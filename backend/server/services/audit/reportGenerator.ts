import type {
  DetailedAuditReport,
  ReportClaimItem,
  ReportEvidenceItem,
  ReportStatistics,
  OverallAssessment,
  OverallReportStatus,
  ReportGenerationInput,
} from './reportTypes.js';
import type { VerifiedClaim, ExtractedClaim, EvidenceSource, Verdict } from '../contracts.js';
import type { ClaimAssessment, NLILabel } from './nliTypes.js';
import { extractSourceKey } from './nliAggregator.js';
import { logger } from '../../utils/logger.js';
import { GoogleGenAI } from '@google/genai';
import { reasoningAuditor } from './reasoningAuditor.js';

/**
 * Normalizes verdict or assessment into standard ClaimAssessment.
 */
export function normalizeAssessment(verdictOrAssessment?: string): ClaimAssessment {
  const v = (verdictOrAssessment || '').toUpperCase();
  if (v === 'SUPPORTED') return 'SUPPORTED';
  if (v === 'REFUTED' || v === 'CONTRADICTED') return 'CONTRADICTED';
  if (v === 'MISLEADING' || v === 'MIXED') return 'MIXED';
  return 'INCONCLUSIVE';
}

/**
 * Converts EvidenceSource or raw evidence into a typed ReportEvidenceItem.
 */
export function formatEvidenceItem(
  source: EvidenceSource,
  claimAssessment: ClaimAssessment,
  index: number
): ReportEvidenceItem {
  let label: NLILabel = 'NEUTRAL';
  if (claimAssessment === 'SUPPORTED') {
    label = 'ENTAILMENT';
  } else if (claimAssessment === 'CONTRADICTED') {
    label = 'CONTRADICTION';
  }

  return {
    evidence_id: `ev_${index + 1}`,
    source_title: source.title || 'Untitled Source',
    source_url: source.url || '',
    publisher: source.publisher || undefined,
    published_at: undefined,
    passage: source.snippet || '',
    nli_label: label,
  };
}

export class ReportGenerator {
  async generateDetailedReport(input: ReportGenerationInput): Promise<DetailedAuditReport> {
    const reportId = input.report_id || `audit_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const originalAnswer = (input.original_answer || '').trim();

    const rawClaims = input.verified_claims || input.claims || [];
    const claimItems: ReportClaimItem[] = [];
    const distinctDomains = new Set<string>();

    let supportedCount = 0;
    let contradictedCount = 0;
    let mixedCount = 0;
    let inconclusiveCount = 0;
    let notAssessedCount = 0;

    // Process each claim individually
    rawClaims.forEach((claim, idx) => {
      const isVerified = 'verdict' in claim && Boolean(claim.verdict);
      const assessment: ClaimAssessment = isVerified
        ? normalizeAssessment((claim as VerifiedClaim).verdict)
        : 'INCONCLUSIVE';

      if (!isVerified) {
        notAssessedCount++;
      } else if (assessment === 'SUPPORTED') {
        supportedCount++;
      } else if (assessment === 'CONTRADICTED') {
        contradictedCount++;
      } else if (assessment === 'MIXED') {
        mixedCount++;
      } else {
        inconclusiveCount++;
      }

      // Process evidence passages
      const rawSources: EvidenceSource[] = ('sources' in claim && Array.isArray((claim as VerifiedClaim).sources))
        ? (claim as VerifiedClaim).sources
        : [];

      const formattedEvidence: ReportEvidenceItem[] = rawSources.map((s, sIdx) => {
        const item = formatEvidenceItem(s, assessment, sIdx);
        if (s.url) {
          distinctDomains.add(extractSourceKey(s.url, s.title));
        }
        return item;
      });

      const supportingEvidence = formattedEvidence.filter((e) => e.nli_label === 'ENTAILMENT');
      const contradictingEvidence = formattedEvidence.filter((e) => e.nli_label === 'CONTRADICTION');
      const neutralEvidence = formattedEvidence.filter((e) => e.nli_label === 'NEUTRAL');

      const claimLimitations: string[] = [];
      if (rawSources.length === 0) {
        claimLimitations.push('No verifiable evidence passages were retrieved for this claim.');
      } else if (assessment === 'MIXED') {
        claimLimitations.push('Retrieved evidence presents conflicting accounts across independent sources.');
      } else if (assessment === 'INCONCLUSIVE') {
        claimLimitations.push('Evidence is neutral or insufficient to confirm or refute the assertion.');
      }

      const explanation = ('explanation' in claim && typeof (claim as VerifiedClaim).explanation === 'string')
        ? (claim as VerifiedClaim).explanation
        : rawSources.length > 0
        ? `Evaluated against ${rawSources.length} external evidence passage(s).`
        : 'No external evidence was retrieved to establish a definitive assessment.';

      const verifiedClaim = claim as VerifiedClaim;
      claimItems.push({
        claim_id: claim.id || `claim_${idx + 1}`,
        claim_number: idx + 1,
        original_text: claim.original_text,
        normalized_claim: claim.normalized_claim || undefined,
        claim_type: claim.claim_type || undefined,
        assessment,
        explanation,
        evidence: formattedEvidence,
        supporting_evidence: supportingEvidence,
        contradicting_evidence: contradictingEvidence,
        neutral_evidence: neutralEvidence,
        limitations: claimLimitations,
        confidence: verifiedClaim.confidence,
        confidence_level: verifiedClaim.confidence_level,
        confidence_rationale: verifiedClaim.confidence_rationale,
        why_is_this_wrong: verifiedClaim.why_is_this_wrong,
        conflict: verifiedClaim.conflict,
        uncertainty: verifiedClaim.uncertainty,
        temporal_context: verifiedClaim.temporal_context,
      });
    });

    const totalClaims = claimItems.length;
    const assessedClaims = totalClaims - notAssessedCount;

    // Accuracy score calculation
    const accuracyScore =
      assessedClaims > 0
        ? Math.round(((supportedCount + 0.5 * mixedCount) / assessedClaims) * 100)
        : totalClaims === 0
        ? 100
        : 50;

    // Determine overall assessment status & key findings
    const overallAssessment = this.deriveOverallAssessment(
      totalClaims,
      assessedClaims,
      supportedCount,
      contradictedCount,
      mixedCount,
      inconclusiveCount,
      accuracyScore,
      claimItems
    );

    // If configured, attempt grounded LLM executive summary with automatic fallback
    if (input.use_llm_summary && process.env.GEMINI_API_KEY && assessedClaims > 0) {
      try {
        const llmSummary = await this.synthesizeLlmExecutiveSummary(
          originalAnswer,
          claimItems,
          overallAssessment
        );
        if (llmSummary) {
          overallAssessment.summary = llmSummary;
        }
      } catch (err: unknown) {
        logger.warn(
          `Grounded LLM summary generation failed: ${err instanceof Error ? err.message : String(err)}. Using rule-based synthesis.`
        );
      }
    }

    // Process reasoning consistency issues
    let reasoningIssues = input.reasoning_issues;
    let reasoningSummary = input.reasoning_summary;

    if (!reasoningIssues && rawClaims.length > 0) {
      try {
        const reasoningRes = await reasoningAuditor.audit({
          answer: originalAnswer,
          claims: rawClaims as any,
          verifiedClaims: input.verified_claims,
        });
        reasoningIssues = reasoningRes.issues;
        reasoningSummary = reasoningRes.summary;
      } catch (err: unknown) {
        logger.warn(
          `Reasoning consistency audit during report generation encountered error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (reasoningIssues && reasoningIssues.length > 0) {
      reasoningIssues.forEach((issue) => {
        overallAssessment.key_findings.push(
          `Reasoning Issue (${issue.type.replace(/_/g, ' ')}): ${issue.explanation}`
        );
      });
      if (overallAssessment.status === 'HIGH_RELIABILITY' && reasoningIssues.some((i) => i.severity === 'HIGH')) {
        overallAssessment.status = 'MODERATE_RELIABILITY';
      }
    }

    const statistics: ReportStatistics = {
      total_claims: totalClaims,
      assessed_claims: assessedClaims,
      supported: supportedCount,
      contradicted: contradictedCount,
      mixed: mixedCount,
      inconclusive: inconclusiveCount,
      not_assessed: notAssessedCount,
      accuracy_score: accuracyScore,
    };

    const methodologyLimitations: string[] = [
      'NLI verification measures semantic entailment between claims and evidence passages, rather than establishing universal factual truth.',
      'Evidence retrieval is constrained by publicly indexed authoritative web sources and query formulation.',
      ...(input.custom_limitations || []),
    ];

    if (inconclusiveCount > 0) {
      methodologyLimitations.push(`${inconclusiveCount} statement(s) lacked sufficient authoritative corroboration.`);
    }

    return {
      report_id: reportId,
      title: 'Second Opinion — AI Answer Audit Report',
      created_at: createdAt,
      original_answer: originalAnswer,
      overall_assessment: overallAssessment,
      statistics,
      claims: claimItems,
      reasoning_issues: reasoningIssues,
      reasoning_summary: reasoningSummary,
      sources_summary: {
        total_distinct_sources: distinctDomains.size,
        distinct_domains: Array.from(distinctDomains),
      },
      methodology: {
        claim_extraction: 'LLM factual statement extraction with pronoun resolution and opinion filtering.',
        evidence_retrieval: 'Authoritative web evidence retrieval with source trust tier filtering.',
        verification_model: process.env.NLI_MODEL || 'cross-encoder/nli-deberta-v3-base',
        aggregation_approach: 'Conservative rule-based aggregation with distinct source deduplication.',
        limitations: methodologyLimitations,
      },
      export_metadata: {
        version: '1.0.0',
        printable: true,
      },
    };
  }

  private deriveOverallAssessment(
    total: number,
    assessed: number,
    supported: number,
    contradicted: number,
    mixed: number,
    inconclusive: number,
    accuracyScore: number,
    claimItems: ReportClaimItem[]
  ): OverallAssessment {
    const keyFindings: string[] = [];

    if (contradicted > 0) {
      const contradictedExamples = claimItems
        .filter((c) => c.assessment === 'CONTRADICTED')
        .map((c) => `"${c.original_text.slice(0, 80)}..."`);
      keyFindings.push(
        `Contains ${contradicted} demonstrably false or contradicted assertion(s): ${contradictedExamples.slice(0, 2).join('; ')}.`
      );
    }

    if (mixed > 0) {
      keyFindings.push(
        `Identified ${mixed} contested or partially misleading statement(s) subject to conflicting evidence.`
      );
    }

    if (inconclusive > 0) {
      keyFindings.push(
        `Unable to verify ${inconclusive} assertion(s) due to lack of conclusive authoritative sources.`
      );
    }

    if (supported > 0) {
      keyFindings.push(
        `Substantiated ${supported} statement(s) against official or authoritative records.`
      );
    }

    let status: OverallReportStatus = 'PARTIALLY_ASSESSED';
    let summary = '';

    if (total === 0) {
      status = 'INSUFFICIENT_EVIDENCE';
      summary = 'No verifiable factual assertions were detected in the audited text.';
    } else if (assessed === 0 || inconclusive === total) {
      status = 'INSUFFICIENT_EVIDENCE';
      summary = 'Available evidence was insufficient to definitively verify any extracted claims.';
    } else if (contradicted > 0 && (contradicted / assessed > 0.5 || contradicted >= 3)) {
      status = 'LOW_RELIABILITY_WARNING';
      summary = `Low reliability warning: ${contradicted} of ${assessed} assessed assertion(s) were directly refuted or contradicted by authoritative external evidence.`;
    } else if (contradicted > 0) {
      status = 'MODERATE_RELIABILITY';
      summary = `Moderate reliability: Evidence reveals mixed accuracy. While ${supported} claim(s) were substantiated, ${contradicted} statement(s) were contradicted by external evidence.`;
    } else if (mixed > 0) {
      status = 'MODERATE_RELIABILITY';
      summary = `Moderate reliability: Evidence contains conflicting or contested assertions (${mixed} claim(s) subject to competing evidence).`;
    } else if (accuracyScore >= 80 && supported > 0) {
      status = 'HIGH_RELIABILITY';
      summary = `High reliability: ${supported} of ${assessed} assessed claim(s) were substantiated by authoritative external evidence with strong grounding.`;
    } else {
      status = 'PARTIALLY_ASSESSED';
      summary = `Partially substantiated audit: ${supported} supported, with ${inconclusive} assertion(s) remaining unverified due to incomplete evidence coverage.`;
    }

    return {
      status,
      summary,
      accuracy_score: accuracyScore,
      key_findings: keyFindings,
    };
  }

  private async synthesizeLlmExecutiveSummary(
    originalText: string,
    claims: ReportClaimItem[],
    assessment: OverallAssessment
  ): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

    const claimsContext = claims
      .map(
        (c) =>
          `- [Claim ${c.claim_number}] [${c.assessment}] "${c.original_text}"\n  Evidence: ${c.explanation}`
      )
      .join('\n');

    const prompt = `You are a fact-checking auditor synthesizing an executive summary for an AI Answer Audit Report.
STRICT GROUNDING RULES:
1. Base your summary solely on the provided claims and their verification assessments.
2. DO NOT introduce external knowledge, uncited statistics, or unverified claims.
3. If claims are contradicted or mixed, highlight them honestly.
4. Keep the summary concise (2 to 4 sentences).

AUDITED TEXT EXCERPT:
"${originalText.slice(0, 300)}..."

COMPLETED CLAIM ASSESSMENTS:
${claimsContext}

OVERALL ACCURACY: ${assessment.accuracy_score}% | STATUS: ${assessment.status}

Write a professional, balanced 2-4 sentence executive summary.`;

    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        maxOutputTokens: 250,
        temperature: 0.2,
      },
    });

    const text = (res.text || '').trim();
    return text || assessment.summary;
  }

  /**
   * Exports report to formatted JSON string.
   */
  exportToJson(report: DetailedAuditReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Exports report to a print-friendly, responsive HTML document.
   */
  exportToHtml(report: DetailedAuditReport): string {
    const statusColors: Record<OverallReportStatus, string> = {
      HIGH_RELIABILITY: '#16a34a',
      MODERATE_RELIABILITY: '#d97706',
      LOW_RELIABILITY_WARNING: '#dc2626',
      PARTIALLY_ASSESSED: '#2563eb',
      INSUFFICIENT_EVIDENCE: '#64748b',
    };

    const claimBadgeColors: Record<ClaimAssessment, { bg: string; text: string }> = {
      SUPPORTED: { bg: '#dcfce7', text: '#166534' },
      CONTRADICTED: { bg: '#fee2e2', text: '#991b1b' },
      MIXED: { bg: '#fef3c7', text: '#92400e' },
      INCONCLUSIVE: { bg: '#f1f5f9', text: '#475569' },
    };

    const statusColor = statusColors[report.overall_assessment.status] || '#2563eb';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${report.title} - ${report.report_id}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      color: #1e293b;
      background: #f8fafc;
      margin: 0;
      padding: 24px;
    }
    .report-container {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #0f172a;
    }
    .meta {
      font-size: 13px;
      color: #64748b;
    }
    .overall-badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 6px;
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      background-color: ${statusColor};
      margin-top: 12px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px;
      margin: 20px 0;
    }
    .stat-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .stat-num {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
      margin: 28px 0 16px 0;
    }
    .claim-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      background: #ffffff;
    }
    .claim-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .badge {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .evidence-item {
      font-size: 13px;
      background: #f8fafc;
      border-left: 3px solid #cbd5e1;
      padding: 8px 12px;
      margin-top: 8px;
    }
    .evidence-item a {
      color: #2563eb;
      text-decoration: none;
    }
    .evidence-item a:hover {
      text-decoration: underline;
    }
    .limitations-box {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 6px;
      padding: 12px 16px;
      font-size: 13px;
      color: #92400e;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .report-container { border: none; box-shadow: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <h1>${report.title}</h1>
      <div class="meta">Report ID: ${report.report_id} &bull; Generated: ${report.created_at}</div>
      <div class="overall-badge">${report.overall_assessment.status.replace(/_/g, ' ')} &bull; ${report.overall_assessment.accuracy_score}% Accuracy Score</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-num">${report.statistics.total_claims}</div>
        <div class="stat-label">Total Claims</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: #16a34a;">${report.statistics.supported}</div>
        <div class="stat-label">Supported</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: #dc2626;">${report.statistics.contradicted}</div>
        <div class="stat-label">Contradicted</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: #d97706;">${report.statistics.mixed}</div>
        <div class="stat-label">Mixed</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: #64748b;">${report.statistics.inconclusive}</div>
        <div class="stat-label">Inconclusive</div>
      </div>
    </div>

    <div class="section-title">Executive Summary</div>
    <p>${report.overall_assessment.summary}</p>
    ${
      report.overall_assessment.key_findings.length > 0
        ? `<ul>${report.overall_assessment.key_findings.map((f) => `<li>${f}</li>`).join('')}</ul>`
        : ''
    }

    <div class="section-title">Claim-by-Claim Audit</div>
    ${report.claims
      .map((c) => {
        const badge = claimBadgeColors[c.assessment] || { bg: '#f1f5f9', text: '#475569' };
        return `
      <div class="claim-card">
        <div class="claim-header">
          <strong>Claim #${c.claim_number}</strong>
          <span class="badge" style="background: ${badge.bg}; color: ${badge.text};">${c.assessment}</span>
        </div>
        <p style="margin: 4px 0 8px 0; font-weight: 500;">"${c.original_text}"</p>
        <p style="font-size: 13px; color: #475569; margin: 4px 0;">${c.explanation}</p>
        ${
          c.evidence.length > 0
            ? c.evidence
                .map(
                  (e) => `
          <div class="evidence-item">
            <div><strong>${e.source_title}</strong> ${e.publisher ? `(${e.publisher})` : ''} - <a href="${e.source_url}" target="_blank" rel="noopener">Link</a></div>
            <div style="font-style: italic; margin-top: 4px;">"${e.passage}"</div>
          </div>`
                )
                .join('')
            : '<div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">No retrieved evidence passages available.</div>'
        }
      </div>`;
      })
      .join('')}

    ${
      report.reasoning_issues && report.reasoning_issues.length > 0
        ? `
    <div class="section-title">Reasoning Consistency Audit</div>
    ${report.reasoning_issues
      .map(
        (issue) => `
      <div style="border: 1px solid #fed7aa; background: #fff7ed; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #c2410c;">${issue.type.replace(/_/g, ' ')}</strong>
          <span style="font-size: 12px; background: #ffedd5; color: #9a3412; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${issue.severity} Severity &bull; ${issue.confidence}% Confidence</span>
        </div>
        <p style="margin: 4px 0; font-size: 13px; color: #431407;">${issue.explanation}</p>
        <div style="font-size: 12px; color: #7c2d12; margin-top: 4px;"><strong>Claims involved:</strong> ${issue.claimIds.join(', ')}</div>
      </div>`
      )
      .join('')}
    `
        : ''
    }

    <div class="section-title">Methodology & Limitations</div>
    <div class="limitations-box">
      <strong>Pipeline Configuration:</strong>
      <p style="margin: 4px 0 8px 0;">Verification Model: <code>${report.methodology.verification_model}</code> &bull; Aggregation: ${report.methodology.aggregation_approach}</p>
      <strong>Disclosed Limitations:</strong>
      <ul style="margin: 4px 0 0 0; padding-left: 20px;">
        ${report.methodology.limitations.map((l) => `<li>${l}</li>`).join('')}
      </ul>
    </div>
  </div>
</body>
</html>`;
  }
}

export const reportGenerator = new ReportGenerator();
