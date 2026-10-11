import { describe, it, expect, beforeAll } from 'vitest';
import { claimExtractorService } from '../server/services/claimExtractor.js';
import { auditEngine } from '../server/services/audit/index.js';
import { debertaNLIAdapter } from '../server/services/audit/nliAdapter.js';
import { sourceFilter } from '../server/services/retrieval/sourceFilter.js';
import type { ExtractedClaim, EvidenceSource } from '../server/services/contracts.js';

describe('Regression Tests: Great Wall Claims & Refined Extraction / Verification', () => {
  beforeAll(() => {
    process.env.LLM_PROVIDER = 'fallback';
  });

  const { verifier } = auditEngine;

  // Requirement 1: Coordinated sentences never inherit trailing predicate text
  it('Requirement 1: extracts coordinated sentences without inheriting trailing predicate text', async () => {
    const input =
      "The Great Wall of China is located in Japan, and it is also the country's largest tourist attraction.";
    const result = await claimExtractorService.extractClaims(input);

    expect(result.claims.length).toBe(2);
    expect(result.claims[0].normalized_claim).toBe('The Great Wall of China is located in Japan.');
    expect(result.claims[1].normalized_claim).toBe(
      "The Great Wall of China is also the country's largest tourist attraction."
    );
    expect(result.claims[1].normalized_claim).not.toContain('Located in Japan');
  });

  // Requirement 2: "The Great Wall of China is located in Japan." -> REFUTED when evidence says China
  it('Requirement 2: refutes "The Great Wall of China is located in Japan." when evidence states it is in China', async () => {
    const claim: ExtractedClaim = {
      id: 'gw_loc_1',
      original_text: 'The Great Wall of China is located in Japan.',
      normalized_claim: 'The Great Wall of China is located in Japan.',
      claim_type: 'general factual',
      check_worthy: true,
      reason: 'Geographical assertion',
    };

    const sources: EvidenceSource[] = [
      {
        title: 'Encyclopaedia Britannica',
        snippet:
          'The Great Wall of China is a historic system of fortifications located across northern China.',
        url: 'https://britannica.com/topic/Great-Wall-of-China',
        publisher: 'Encyclopaedia Britannica',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('REFUTED');
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.explanation.toLowerCase()).toContain('contradicts');
  });

  // Requirement 3: Do not treat generic search snippets as entailment merely because they share tokens
  it('Requirement 3: generic/irrelevant search snippets sharing tokens with claim do not yield entailment', () => {
    const genericPremise =
      'The Great Wall of China is visited by millions of tourists annually from all over the world.';
    const hypothesis = 'The Great Wall of China is located in Japan.';

    const scores = debertaNLIAdapter.predictLocalPair({
      premise: genericPremise,
      hypothesis,
    });

    // Should NOT be entailment merely because 4 out of 5 words are shared
    expect(scores.entailment).toBeLessThan(0.1);
  });

  // Requirement 4: Correctly isolate 3 propositions in Claim #2 series
  it('Requirement 4: correctly isolates the 3 coordinate propositions in defensive system & Qin dynasty series', async () => {
    const input =
      'The Great Wall was primarily a defensive system against invasions, construction existed before the Qin dynasty, and Qin-era rulers joined earlier fortifications.';
    const result = await claimExtractorService.extractClaims(input);

    expect(result.claims.length).toBe(3);
    expect(result.claims[0].normalized_claim).toBe(
      'The Great Wall was primarily a defensive system against invasions.'
    );
    expect(result.claims[1].normalized_claim).toBe(
      'Construction existed before the Qin dynasty.'
    );
    expect(result.claims[2].normalized_claim).toBe(
      'Qin-era rulers joined earlier fortifications.'
    );
  });

  // Requirement 5: Zhihu forum does not create MISLEADING verdict against authoritative evidence
  it('Requirement 5: untrusted forum sources such as Zhihu do not create a MISLEADING verdict when authoritative sources support the claim', async () => {
    const claim: ExtractedClaim = {
      id: 'gw_auth_1',
      original_text: 'The Great Wall was built as a defensive system against invasions.',
      normalized_claim: 'The Great Wall was built as a defensive system against invasions.',
      claim_type: 'historical',
      check_worthy: true,
      reason: 'Historical assertion',
    };

    const sources: EvidenceSource[] = [
      {
        title: 'UNESCO World Heritage Centre',
        snippet:
          'The Great Wall was built as a defensive system against invasions from northern nomadic tribes.',
        url: 'https://whc.unesco.org/en/list/438',
        publisher: 'UNESCO',
      },
      {
        title: 'Zhihu Q&A Discussion',
        snippet:
          'Contrary to common belief, some forum users argue the Great Wall was never built as a defensive system.',
        url: 'https://zhihu.com/question/123456',
        publisher: 'Zhihu',
      },
    ];

    // Source filter should categorize Zhihu as UNTRUSTED
    const filtered = sourceFilter.filterAndRankSources(sources);
    const zhihuSource = filtered.find((s) => s.domain.includes('zhihu.com'));
    expect(zhihuSource?.tier).toBe('UNTRUSTED');

    // NLI Verification should remain SUPPORTED rather than being dragged to MISLEADING
    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('SUPPORTED');
  });
});
