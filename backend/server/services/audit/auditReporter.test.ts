import { describe, it, expect } from 'vitest';
import {
  AuditReporter,
  ReportGenerator,
  normalizeAssessment,
  formatEvidenceItem,
  type ReportGenerationInput,
} from './index.js';
import type { VerifiedClaim, VerificationSummary } from '../contracts.js';

describe('Feature 4: Evidence-Based Audit Report Generation', () => {
  const reporter = new AuditReporter();
  const generator = new ReportGenerator();

  const makeClaim = (
    partial: Partial<VerifiedClaim> & { id: string; original_text: string; verdict: any }
  ): VerifiedClaim => ({
    normalized_claim: partial.original_text,
    claim_type: 'general factual',
    check_worthy: true,
    reason: 'Factual verification assertion',
    confidence: 90,
    explanation: 'Explanation',
    sources: [],
    ...partial,
  });

  describe('Assessment & Evidence Normalization', () => {
    it('correctly maps legacy verdicts to standard assessment labels', () => {
      expect(normalizeAssessment('SUPPORTED')).toBe('SUPPORTED');
      expect(normalizeAssessment('REFUTED')).toBe('CONTRADICTED');
      expect(normalizeAssessment('CONTRADICTED')).toBe('CONTRADICTED');
      expect(normalizeAssessment('MISLEADING')).toBe('MIXED');
      expect(normalizeAssessment('MIXED')).toBe('MIXED');
      expect(normalizeAssessment('UNVERIFIABLE')).toBe('INCONCLUSIVE');
      expect(normalizeAssessment('UNKNOWN')).toBe('INCONCLUSIVE');
    });

    it('Case 8: handles missing titles, URLs, and publisher metadata gracefully', () => {
      const source = {
        title: '',
        url: '',
        snippet: 'A minimal snippet.',
      };
      const formatted = formatEvidenceItem(source, 'SUPPORTED', 0);
      expect(formatted.source_title).toBe('Untitled Source');
      expect(formatted.source_url).toBe('');
      expect(formatted.nli_label).toBe('ENTAILMENT');
      expect(formatted.passage).toBe('A minimal snippet.');
    });
  });

  describe('Report Assembly & Claim Analysis', () => {
    it('Case 1 & 2: generates report when all pipeline stages succeed with supported claims', async () => {
      const sampleVerifiedClaims: VerifiedClaim[] = [
        {
          id: 'claim_1',
          original_text: 'Paris is the capital of France.',
          normalized_claim: 'Paris is the official capital of France.',
          claim_type: 'political',
          check_worthy: true,
          reason: 'Geopolitical assertion.',
          verdict: 'SUPPORTED',
          confidence: 95,
          explanation: 'Official records confirm Paris is the capital of France.',
          sources: [
            {
              title: 'Government Portal of France',
              url: 'https://gov.fr/paris',
              publisher: 'Government of France',
              snippet: 'Paris is officially designated as the capital of the French Republic.',
            },
          ],
        },
      ];

      const input: ReportGenerationInput = {
        original_answer: 'Paris is the capital of France and has major historical significance.',
        verified_claims: sampleVerifiedClaims,
        report_id: 'report_test_001',
      };

      const report = await reporter.generateDetailedReport(input);

      expect(report.report_id).toBe('report_test_001');
      expect(report.title).toBe('Second Opinion — AI Answer Audit Report');
      expect(report.created_at).toBeDefined();
      expect(report.overall_assessment.status).toBe('HIGH_RELIABILITY');
      expect(report.overall_assessment.accuracy_score).toBe(100);
      expect(report.statistics.total_claims).toBe(1);
      expect(report.statistics.supported).toBe(1);
      expect(report.statistics.contradicted).toBe(0);
      expect(report.claims.length).toBe(1);
      expect(report.claims[0].supporting_evidence.length).toBe(1);
      expect(report.claims[0].supporting_evidence[0].source_title).toBe('Government Portal of France');
    });

    it('Case 3: highlights contradicted claims prominently without burying them', async () => {
      const mixedClaims: VerifiedClaim[] = [
        makeClaim({
          id: 'claim_supported',
          original_text: 'The speed of light is roughly 300,000 km/s.',
          verdict: 'SUPPORTED',
          confidence: 99,
          explanation: 'Confirmed by physics constants.',
          sources: [
            {
              title: 'Physics Reference',
              url: 'https://physics.nist.gov',
              snippet: 'The speed of light is 299,792 km/s.',
            },
          ],
        }),
        makeClaim({
          id: 'claim_refuted',
          original_text: 'The Great Wall of China is visible from the Moon with the naked eye.',
          verdict: 'REFUTED',
          confidence: 96,
          explanation: 'Debunked by NASA lunar observations.',
          sources: [
            {
              title: 'NASA Fact Sheet',
              url: 'https://nasa.gov/great-wall',
              snippet: 'It is a myth: the Great Wall is not visible from the moon.',
            },
          ],
        }),
      ];

      const report = await reporter.generateDetailedReport({
        original_answer: 'Light travels at 300,000 km/s and the Great Wall is visible from the Moon.',
        verified_claims: mixedClaims,
      });

      expect(report.overall_assessment.status).toBe('MODERATE_RELIABILITY');
      expect(report.statistics.contradicted).toBe(1);
      expect(report.statistics.supported).toBe(1);
      // Ensure contradiction is explicitly flagged in key findings
      const hasContradictionFinding = report.overall_assessment.key_findings.some((f) =>
        f.includes('false or contradicted')
      );
      expect(hasContradictionFinding).toBe(true);
      expect(report.claims[1].contradicting_evidence.length).toBe(1);
    });

    it('Case 4: accurately reflects MIXED and INCONCLUSIVE evidence', async () => {
      const claims: VerifiedClaim[] = [
        makeClaim({
          id: 'claim_mixed',
          original_text: 'Coffee consumption has purely negative cardiovascular effects.',
          verdict: 'MISLEADING',
          confidence: 80,
          explanation: 'Studies present conflicting findings on cardiovascular outcomes.',
          sources: [
            {
              title: 'Medical Review',
              url: 'https://pubmed.ncbi.nlm.nih.gov/12345',
              snippet: 'Moderate consumption correlates with neutral or protective outcomes.',
            },
          ],
        }),
        makeClaim({
          id: 'claim_unverifiable',
          original_text: 'Ancient tablets mention an unknown 13th ruler of the dynasty.',
          verdict: 'UNVERIFIABLE',
          confidence: 60,
          explanation: 'Limited historical corroboration exists.',
          sources: [],
        }),
      ];

      const report = await reporter.generateDetailedReport({
        original_answer: 'Coffee is harmful and an unknown ruler existed.',
        verified_claims: claims,
      });

      expect(report.statistics.mixed).toBe(1);
      expect(report.statistics.inconclusive).toBe(1);
      expect(report.claims[0].assessment).toBe('MIXED');
      expect(report.claims[1].assessment).toBe('INCONCLUSIVE');
      expect(report.claims[1].limitations).toContain(
        'No verifiable evidence passages were retrieved for this claim.'
      );
    });

    it('Case 5: handles empty claims or answer with no verifiable factual assertions', async () => {
      const report = await reporter.generateDetailedReport({
        original_answer: 'Good morning! How can I help you today? Have a great day!',
        verified_claims: [],
      });

      expect(report.statistics.total_claims).toBe(0);
      expect(report.overall_assessment.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(report.overall_assessment.summary).toContain('No verifiable factual assertions');
      expect(report.claims).toEqual([]);
    });

    it('Case 6 & 7: correctly calculates statistics and summary breakdown counts', async () => {
      const claims: VerifiedClaim[] = [
        makeClaim({ id: '1', original_text: 'T1', verdict: 'SUPPORTED', confidence: 90, explanation: '', sources: [] }),
        makeClaim({ id: '2', original_text: 'T2', verdict: 'SUPPORTED', confidence: 90, explanation: '', sources: [] }),
        makeClaim({ id: '3', original_text: 'T3', verdict: 'REFUTED', confidence: 90, explanation: '', sources: [] }),
        makeClaim({ id: '4', original_text: 'T4', verdict: 'MISLEADING', confidence: 80, explanation: '', sources: [] }),
        makeClaim({ id: '5', original_text: 'T5', verdict: 'UNVERIFIABLE', confidence: 60, explanation: '', sources: [] }),
      ];

      const report = await reporter.generateDetailedReport({
        original_answer: 'Five assertions.',
        verified_claims: claims,
      });

      expect(report.statistics.total_claims).toBe(5);
      expect(report.statistics.supported).toBe(2);
      expect(report.statistics.contradicted).toBe(1);
      expect(report.statistics.mixed).toBe(1);
      expect(report.statistics.inconclusive).toBe(1);
      expect(report.statistics.not_assessed).toBe(0);
      // Accuracy = (2 + 0.5 * 1) / 5 * 100 = 50%
      expect(report.statistics.accuracy_score).toBe(50);
    });
  });

  describe('Methodology Disclosure & Limitations', () => {
    it('discloses transparent methodology stages and NLI inference constraints', async () => {
      const report = await reporter.generateDetailedReport({
        original_answer: 'Test text',
        verified_claims: [],
        custom_limitations: ['External search API was rate-limited during execution.'],
      });

      expect(report.methodology.claim_extraction).toBeDefined();
      expect(report.methodology.evidence_retrieval).toBeDefined();
      expect(report.methodology.verification_model).toBe('cross-encoder/nli-deberta-v3-base');
      expect(report.methodology.limitations).toContain(
        'External search API was rate-limited during execution.'
      );
      const hasNliLimitation = report.methodology.limitations.some((l) =>
        l.includes('NLI verification measures semantic entailment')
      );
      expect(hasNliLimitation).toBe(true);
    });
  });

  describe('Report Exporting (JSON and HTML/Print)', () => {
    it('Case 9 & 10: exports valid formatted JSON string', async () => {
      const report = await reporter.generateDetailedReport({
        original_answer: 'Test text.',
        verified_claims: [
          makeClaim({
            id: '1',
            original_text: 'Earth revolves around the Sun.',
            verdict: 'SUPPORTED',
            confidence: 99,
            explanation: 'Astrophysical fact.',
            sources: [],
          }),
        ],
      });

      const jsonStr = reporter.exportToJson(report);
      expect(typeof jsonStr).toBe('string');
      const parsed = JSON.parse(jsonStr);
      expect(parsed.report_id).toBe(report.report_id);
      expect(parsed.statistics.total_claims).toBe(1);
    });

    it('exports print-ready, responsive HTML with accessible status badges', async () => {
      const report = await reporter.generateDetailedReport({
        original_answer: 'Test text.',
        verified_claims: [
          makeClaim({
            id: '1',
            original_text: 'Earth revolves around the Sun.',
            verdict: 'SUPPORTED',
            confidence: 99,
            explanation: 'Astrophysical fact.',
            sources: [
              {
                title: 'Solar System Data',
                url: 'https://nasa.gov/solar-system',
                publisher: 'NASA',
                snippet: 'Planets orbit the Sun.',
              },
            ],
          }),
        ],
      });

      const html = reporter.exportToHtml(report);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(report.title);
      expect(html).toContain('@media print');
      expect(html).toContain('Solar System Data');
      expect(html).toContain('SUPPORTED');
    });
  });

  describe('API Route Handler & Backward Compatibility', () => {
    it('Case 11: handleApiReportGeneration returns 400 for bad payloads and 200 for valid payloads', async () => {
      const badRes = await reporter.handleApiReportGeneration({ invalid: true });
      expect(badRes.status).toBe(400);

      const goodRes = await reporter.handleApiReportGeneration({
        original_answer: 'Valid answer',
        claims: [{ original_text: 'Claim 1' }],
      });
      expect(goodRes.status).toBe(200);
      if ('report_id' in goodRes.data) {
        expect(goodRes.data.statistics.total_claims).toBe(1);
      }
    });

    it('preserves legacy generateAuditReport method for backward compatibility', () => {
      const verifiedClaims: VerifiedClaim[] = [
        makeClaim({
          id: 'c1',
          original_text: 'Statement',
          verdict: 'SUPPORTED',
          confidence: 90,
          explanation: 'Ok',
          sources: [],
        }),
      ];
      const summary: VerificationSummary = {
        total: 1,
        supported: 1,
        refuted: 0,
        misleading: 0,
        unverifiable: 0,
        accuracy_score: 100,
      };

      const legacyReport = reporter.generateAuditReport(verifiedClaims, summary);
      expect(legacyReport.title).toBe('Second Opinion Fact-Check & Verification Audit');
      expect(legacyReport.overallAccuracyScore).toBe(100);
      expect(legacyReport.verdictBreakdown.supported).toBe(1);
    });
  });
});
