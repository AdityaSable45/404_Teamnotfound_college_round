import { describe, it, expect, beforeAll } from 'vitest';
import { claimExtractorService } from '../server/services/claimExtractor.js';
import { auditEngine } from '../server/services/audit/index.js';
import type { ExtractedClaim, EvidenceSource } from '../server/services/contracts.js';

describe('Regression Tests A–H: Australia Mixed Fact Audit & Historical Entailment', () => {
  beforeAll(() => {
    process.env.LLM_PROVIDER = 'fallback';
  });

  const { verifier } = auditEngine;

  // Test A: "Sydney is the largest city in Australia." -> SUPPORTED
  it('Test A: verifies "Sydney is the largest city in Australia." as SUPPORTED', async () => {
    const claim: ExtractedClaim = {
      id: 'claim_a',
      original_text: 'Sydney is the largest city in Australia.',
      normalized_claim: 'Sydney is the largest city in Australia.',
      claim_type: 'general factual',
      check_worthy: true,
      reason: 'Demographic assertion',
    };
    const sources: EvidenceSource[] = [
      {
        title: 'Australian Bureau of Statistics',
        snippet: 'Sydney is the largest city in Australia and the capital city of New South Wales.',
        url: 'https://abs.gov.au/sydney',
        publisher: 'Australian Bureau of Statistics',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('SUPPORTED');
    expect(result.confidence).toBeGreaterThanOrEqual(85);
  });

  // Test B: "The capital of Australia is Sydney." -> REFUTED
  it('Test B: verifies "The capital of Australia is Sydney." as REFUTED when evidence states Canberra is the capital', async () => {
    const claim: ExtractedClaim = {
      id: 'claim_b',
      original_text: 'The capital of Australia is Sydney.',
      normalized_claim: 'The capital of Australia is Sydney.',
      claim_type: 'political',
      check_worthy: true,
      reason: 'Geopolitical assertion',
    };
    const sources: EvidenceSource[] = [
      {
        title: 'Parliament of Australia',
        snippet: 'Canberra is the capital city of Australia and seat of the federal government.',
        url: 'https://aph.gov.au/canberra',
        publisher: 'Parliament of Australia',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('REFUTED');
    expect(result.confidence).toBeGreaterThanOrEqual(90);
    expect(result.explanation.toLowerCase()).toContain('canberra');
  });

  // Test C: "Australia became a federation in 1901." -> SUPPORTED
  it('Test C: verifies "Australia became a federation in 1901." as SUPPORTED', async () => {
    const claim: ExtractedClaim = {
      id: 'claim_c',
      original_text: 'Australia became a federation in 1901.',
      normalized_claim: 'Australia became a federation in 1901.',
      claim_type: 'historical',
      check_worthy: true,
      reason: 'Historical assertion',
    };
    const sources: EvidenceSource[] = [
      {
        title: 'National Museum of Australia',
        snippet: 'On 1 January 1901, the Commonwealth of Australia came into being and Australia became a federation.',
        url: 'https://nma.gov.au/federation',
        publisher: 'National Museum of Australia',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('SUPPORTED');
    expect(result.confidence).toBeGreaterThanOrEqual(85);
  });

  // Test D: "Canberra was later established as the national capital." -> SUPPORTED
  it('Test D: verifies "Canberra was later established as the national capital." as SUPPORTED (no false contradiction)', async () => {
    const claim: ExtractedClaim = {
      id: 'claim_d',
      original_text: 'Canberra was later established as the national capital.',
      normalized_claim: 'Canberra was later established as the national capital.',
      claim_type: 'historical',
      check_worthy: true,
      reason: 'Historical establishment',
    };
    const sources: EvidenceSource[] = [
      {
        title: 'National Capital Authority',
        snippet: 'Canberra was chosen as the site for the national capital in 1908 and Canberra was officially established as the national capital of Australia.',
        url: 'https://nca.gov.au/history',
        publisher: 'National Capital Authority',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('SUPPORTED');
    expect(result.confidence).toBeGreaterThanOrEqual(85);
  });

  // Test E: Full mixed paragraph extracts and verifies correctly (Claims 1–5)
  it('Test E: extracts and correctly verifies all 5 claims from the mixed factual paragraph', async () => {
    const paragraph =
      "The capital of Australia is Sydney, and it is also the country's largest city. " +
      "Australia became a federation in 1901, and Canberra was later established as the national capital. " +
      "Sydney is located on the east coast of Australia and is famous for the Sydney Opera House and Harbour Bridge, while Canberra is located inland in the Australian Capital Territory.";

    const extraction = await claimExtractorService.extractClaims(paragraph);
    expect(extraction.claims.length).toBe(5);

    // Verify extraction antecedent resolution: Claim 2 should resolve "it" to "Sydney", NOT "The is also..."
    const claim1 = extraction.claims[0];
    const claim2 = extraction.claims[1];
    const claim3 = extraction.claims[2];
    const claim4 = extraction.claims[3];
    const claim5 = extraction.claims[4];

    expect(claim1.original_text).toContain('The capital of Australia is Sydney');
    expect(claim2.normalized_claim).toMatch(/^Sydney is also the country's largest city/i);
    expect(claim2.normalized_claim).not.toMatch(/^the is also/i);
    expect(claim3.normalized_claim).toContain('Australia became a federation in 1901');
    expect(claim4.normalized_claim).toContain('Canberra was later established as the national capital');
    expect(claim5.original_text).toContain('Opera House');

    // Verify Claim 1 is REFUTED
    const res1 = await verifier.verifyWithEvidence(claim1, [
      {
        title: 'Parliament of Australia',
        snippet: 'Canberra is the capital of Australia. Sydney is not the national capital.',
        url: 'https://aph.gov.au',
        publisher: 'Parliament of Australia',
      },
    ]);
    expect(res1.verdict).toBe('REFUTED');

    // Verify Claim 2 is SUPPORTED
    const res2 = await verifier.verifyWithEvidence(claim2, [
      {
        title: 'Australian Bureau of Statistics',
        snippet: "Sydney is also the country's largest city by population in Australia.",
        url: 'https://abs.gov.au',
        publisher: 'ABS',
      },
    ]);
    expect(res2.verdict).toBe('SUPPORTED');

    // Verify Claim 3 is SUPPORTED
    const res3 = await verifier.verifyWithEvidence(claim3, [
      {
        title: 'National Museum of Australia',
        snippet: 'Australia became a federation in 1901 following the federation movement.',
        url: 'https://nma.gov.au',
        publisher: 'NMA',
      },
    ]);
    expect(res3.verdict).toBe('SUPPORTED');

    // Verify Claim 4 is SUPPORTED
    const res4 = await verifier.verifyWithEvidence(claim4, [
      {
        title: 'National Capital Authority',
        snippet: 'Canberra was established as the national capital of Australia following an international competition.',
        url: 'https://nca.gov.au',
        publisher: 'NCA',
      },
    ]);
    expect(res4.verdict).toBe('SUPPORTED');

    // Verify Claim 5 is SUPPORTED
    const res5 = await verifier.verifyWithEvidence(claim5, [
      {
        title: 'Geoscience Australia & Tourism',
        snippet:
          'Sydney is located on the east coast of Australia and is famous for the Sydney Opera House and Harbour Bridge. Meanwhile, Canberra is located inland in the Australian Capital Territory.',
        url: 'https://australia.com/destinations',
        publisher: 'Tourism Australia',
      },
    ]);
    expect(res5.verdict).toBe('SUPPORTED');
  });

  // Test F: Multi-proposition sentence with mixed verdicts -> MISLEADING
  it('Test F: verifies a multi-proposition claim with mixed true and false propositions as MISLEADING', async () => {
    const claim: ExtractedClaim = {
      id: 'claim_f',
      original_text: 'Sydney is the capital of Australia, and it is located on the east coast of Australia.',
      normalized_claim: 'Sydney is the capital of Australia, and Sydney is located on the east coast of Australia.',
      claim_type: 'general factual',
      check_worthy: true,
      reason: 'Compound assertion',
    };
    const sources: EvidenceSource[] = [
      {
        title: 'Australian Geography Reference',
        snippet:
          'Canberra is the capital of Australia. Sydney is located on the east coast of Australia.',
        url: 'https://aph.gov.au/geography',
        publisher: 'Australian Geography Reference',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('MISLEADING');
    expect(result.explanation).toContain('misleading');
  });

  // Test G: Neutral entity overlap does not become SUPPORTED
  it('Test G: confirms that high entity overlap without entailment remains UNVERIFIABLE, not SUPPORTED', async () => {
    const claim: ExtractedClaim = {
      id: 'claim_g',
      original_text: 'The capital of Australia is Sydney.',
      normalized_claim: 'The capital of Australia is Sydney.',
      claim_type: 'political',
      check_worthy: true,
      reason: 'Capital assertion',
    };
    const sources: EvidenceSource[] = [
      {
        title: 'Sydney Demographics',
        snippet: 'Sydney is the largest city in Australia, home to beautiful beaches and coastal national parks.',
        url: 'https://example.com/sydney',
        publisher: 'Travel Bureau',
      },
    ];

    const result = await verifier.verifyWithEvidence(claim, sources);
    expect(result.verdict).toBe('UNVERIFIABLE');
    expect(result.verdict).not.toBe('SUPPORTED');
  });

  // Test H: Historical event wording ("was established", "became", "was chosen", "was announced")
  it('Test H: handles varied historical event wording as valid entailment', async () => {
    const historicalVariants = [
      {
        claimText: "Canberra was chosen as the nation's capital.",
        evidenceText: "Canberra was chosen as the nation's capital in 1908 by the Commonwealth Parliament.",
      },
      {
        claimText: 'Canberra was announced as the federal capital.',
        evidenceText: 'In 1913, Canberra was officially announced as the federal capital of Australia.',
      },
      {
        claimText: 'Canberra became the national capital.',
        evidenceText: 'Canberra became the national capital when Parliament House opened in 1927.',
      },
      {
        claimText: 'Canberra was founded as the national capital.',
        evidenceText: 'Canberra was founded as the national capital as a planned city.',
      },
    ];

    for (let i = 0; i < historicalVariants.length; i++) {
      const { claimText, evidenceText } = historicalVariants[i];
      const claim: ExtractedClaim = {
        id: `claim_h_${i}`,
        original_text: claimText,
        normalized_claim: claimText,
        claim_type: 'historical',
        check_worthy: true,
        reason: 'Historical phrasing test',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Historical Records',
          snippet: evidenceText,
          url: `https://history.gov.au/item_${i}`,
          publisher: 'Historical Records',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict, `Failed on "${claimText}"`).toBe('SUPPORTED');
    }
  });
});
