import { describe, it, expect, beforeEach } from 'vitest';
import {
  ReasoningAuditor,
  RuleBasedReasoningProvider,
  type ReasoningIssue,
} from './index.js';
import type { ExtractedClaim } from '../contracts.js';

describe('Feature: Reasoning Consistency Checks', () => {
  let auditor: ReasoningAuditor;

  beforeEach(() => {
    // Force deterministic rule provider for fast, reliable unit testing
    auditor = new ReasoningAuditor(new RuleBasedReasoningProvider());
  });

  const createClaim = (id: string, text: string): ExtractedClaim => ({
    id,
    original_text: text,
    normalized_claim: text,
    claim_type: 'general factual',
    check_worthy: true,
    reason: 'Assertion for audit',
  });

  // =========================================================================
  // Test 1 — Internal Contradiction
  // =========================================================================
  describe('Test 1 — Internal Contradiction', () => {
    it('detects internal contradiction when two claims make mutually conflicting numerical statements about the Earth', async () => {
      const answer =
        'The Earth is approximately 4.5 billion years old. The Earth is less than 1 billion years old.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'The Earth is approximately 4.5 billion years old.'),
        createClaim('claim_2', 'The Earth is less than 1 billion years old.'),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      const contradiction = result.issues.find((i) => i.type === 'INTERNAL_CONTRADICTION');
      expect(contradiction).toBeDefined();
      expect(contradiction?.severity).toBe('HIGH');
      expect(contradiction?.claimIds).toContain('claim_1');
      expect(contradiction?.claimIds).toContain('claim_2');
      expect(contradiction?.explanation.toLowerCase()).toContain('earth');
      expect(contradiction?.confidence).toBeGreaterThanOrEqual(85);
      expect(result.summary.hasContradictions).toBe(true);
      expect(result.summary.assessment).toBe('INCONSISTENT');
    });

    it('detects internal contradiction for mutually exclusive population statements (India)', async () => {
      const answer =
        'India has a population of more than 1 billion. India has fewer than 500 million people.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'India has a population of more than 1 billion.'),
        createClaim('claim_2', 'India has fewer than 500 million people.'),
      ];

      const result = await auditor.audit({ answer, claims });

      const contradiction = result.issues.find((i) => i.type === 'INTERNAL_CONTRADICTION');
      expect(contradiction).toBeDefined();
      expect(contradiction?.claimIds).toEqual(expect.arrayContaining(['claim_1', 'claim_2']));
    });
  });

  // =========================================================================
  // Test 2 — Unsupported Conclusion
  // =========================================================================
  describe('Test 2 — Unsupported Conclusion', () => {
    it('detects unsupported conclusion when preceding claims establish general fitness but conclusion guarantees perfect health', async () => {
      const answer =
        'Exercise improves physical fitness. Running is exercise. Therefore running guarantees perfect health.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'Exercise improves physical fitness.'),
        createClaim('claim_2', 'Running is exercise.'),
        createClaim('claim_3', 'Therefore running guarantees perfect health.'),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      const conclusionIssue = result.issues.find((i) => i.type === 'UNSUPPORTED_CONCLUSION');
      expect(conclusionIssue).toBeDefined();
      expect(conclusionIssue?.severity).toBe('HIGH');
      expect(conclusionIssue?.claimIds).toContain('claim_3');
      expect(conclusionIssue?.conclusionId).toBe('claim_3');
      expect(conclusionIssue?.explanation).toContain('stronger than what the preceding claims establish');
      expect(conclusionIssue?.confidence).toBeGreaterThanOrEqual(80);
      expect(result.summary.hasUnsupportedConclusions).toBe(true);
    });

    it('detects unsupported conclusion for absolute heart disease guarantee leap', async () => {
      const answer =
        'Regular exercise improves cardiovascular fitness. Running is a form of exercise. Therefore running guarantees that a person will never develop heart disease.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'Regular exercise improves cardiovascular fitness.'),
        createClaim('claim_2', 'Running is a form of exercise.'),
        createClaim('claim_3', 'Therefore running guarantees that a person will never develop heart disease.'),
      ];

      const result = await auditor.audit({ answer, claims });

      const issue = result.issues.find((i) => i.type === 'UNSUPPORTED_CONCLUSION');
      expect(issue).toBeDefined();
      expect(issue?.premiseIds).toEqual(expect.arrayContaining(['claim_1', 'claim_2']));
      expect(issue?.conclusionId).toBe('claim_3');
    });
  });

  // =========================================================================
  // Test 3 — Unsupported Causality
  // =========================================================================
  describe('Test 3 — Unsupported Causality', () => {
    it('detects unsupported causality when premise only establishes observational correlation but conclusion asserts direct causation', async () => {
      const answer =
        'People who consume more coffee report higher stress. Therefore coffee consumption causes stress.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'People who consume more coffee report higher stress.'),
        createClaim('claim_2', 'Therefore coffee consumption causes stress.'),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      const causalityIssue = result.issues.find((i) => i.type === 'UNSUPPORTED_CAUSALITY');
      expect(causalityIssue).toBeDefined();
      expect(causalityIssue?.severity).toBe('HIGH');
      expect(causalityIssue?.claimIds).toContain('claim_1');
      expect(causalityIssue?.claimIds).toContain('claim_2');
      expect(causalityIssue?.explanation.toLowerCase()).toContain('correlation');
      expect(causalityIssue?.confidence).toBeGreaterThanOrEqual(80);
      expect(result.summary.hasUnsupportedCausality).toBe(true);
    });
  });

  // =========================================================================
  // Test 4 — No False Positive (Orbits)
  // =========================================================================
  describe('Test 4 — No False Positive (Astronomical Orbits)', () => {
    it('reports no reasoning issues for independent true astronomical facts', async () => {
      const answer = 'The Earth orbits the Sun. The Moon orbits the Earth.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'The Earth orbits the Sun.'),
        createClaim('claim_2', 'The Moon orbits the Earth.'),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues).toHaveLength(0);
      expect(result.summary.totalIssues).toBe(0);
      expect(result.summary.hasContradictions).toBe(false);
      expect(result.summary.hasUnsupportedConclusions).toBe(false);
      expect(result.summary.hasUnsupportedCausality).toBe(false);
      expect(result.summary.reasoningScore).toBe(100);
      expect(result.summary.assessment).toBe('CONSISTENT');
    });
  });

  // =========================================================================
  // Test 5 — Independent True Claims (Capitals)
  // =========================================================================
  describe('Test 5 — Independent True Claims (Capitals)', () => {
    it('reports no reasoning issues for independent geographic capital facts', async () => {
      const answer = 'Paris is the capital of France. Tokyo is the capital of Japan.';
      const claims: ExtractedClaim[] = [
        createClaim('claim_1', 'Paris is the capital of France.'),
        createClaim('claim_2', 'Tokyo is the capital of Japan.'),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues).toHaveLength(0);
      expect(result.summary.totalIssues).toBe(0);
      expect(result.summary.reasoningScore).toBe(100);
      expect(result.summary.assessment).toBe('CONSISTENT');
    });
  });

  // =========================================================================
  // Test 6 — Invalid Comparison / False Equivalence
  // =========================================================================
  describe('Test 6 — Invalid Comparison / False Equivalence', () => {
    it('detects invalid comparison when asserting broad equivalence based on a single trait', async () => {
      const answer =
        'Both situations share one characteristic and are therefore equivalent with the same outcome.';
      const claims: ExtractedClaim[] = [
        createClaim(
          'claim_1',
          'Both situations share one characteristic and are therefore equivalent with the same outcome.'
        ),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      const comparisonIssue = result.issues.find((i) => i.type === 'INVALID_COMPARISON');
      expect(comparisonIssue).toBeDefined();
      expect(comparisonIssue?.severity).toBe('MEDIUM');
      expect(result.summary.hasInvalidComparisons).toBe(true);
    });
  });

  // =========================================================================
  // Edge Cases & Robustness
  // =========================================================================
  describe('Edge Cases', () => {
    it('handles empty claims array cleanly without crashing', async () => {
      const result = await auditor.audit({ answer: '', claims: [] });
      expect(result.issues).toHaveLength(0);
      expect(result.summary.totalIssues).toBe(0);
      expect(result.summary.assessment).toBe('CONSISTENT');
    });

    it('calculates proper penalties when multiple issues are present', async () => {
      const answer =
        'The Earth is 4.5 billion years old. The Earth is less than 1 billion years old. Exercise helps health, therefore running guarantees perfect health.';
      const claims: ExtractedClaim[] = [
        createClaim('c1', 'The Earth is 4.5 billion years old.'),
        createClaim('c2', 'The Earth is less than 1 billion years old.'),
        createClaim('c3', 'Exercise helps health, therefore running guarantees perfect health.'),
      ];

      const result = await auditor.audit({ answer, claims });

      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      expect(result.summary.reasoningScore).toBeLessThan(60);
      expect(result.summary.assessment).toBe('INCONSISTENT');
    });
  });
});
