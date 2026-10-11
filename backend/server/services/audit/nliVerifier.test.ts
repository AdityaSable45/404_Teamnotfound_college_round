import { describe, it, expect } from 'vitest';
import type { ExtractedClaim, EvidenceSource } from '../contracts.js';
import {
  NLIVerifier,
  DEBERTA_V3_LABEL_MAPPING,
  softmax,
  chunkLongPassage,
  extractSourceKey,
  NLIAggregator,
  ClaimVerificationRequest,
  NLIModelAdapter,
  NLIPair,
  NLIScores,
} from './index.js';

describe('Feature 3: Evidence-Based Claim Verification Using NLI Model', () => {
  const verifier = new NLIVerifier();

  describe('Model Integration & Label Mapping', () => {
    it('Case 9: correctly maps model output indices according to cross-encoder/nli-deberta-v3-base', () => {
      const mapping = DEBERTA_V3_LABEL_MAPPING;
      expect(mapping[0]).toBe('CONTRADICTION');
      expect(mapping[1]).toBe('ENTAILMENT');
      expect(mapping[2]).toBe('NEUTRAL');

      const modelInfo = verifier.getModelInfo();
      expect(modelInfo.modelIdentifier).toBe('cross-encoder/nli-deberta-v3-base');
      expect(modelInfo.labelMapping[0]).toBe('CONTRADICTION');
      expect(modelInfo.labelMapping[1]).toBe('ENTAILMENT');
      expect(modelInfo.labelMapping[2]).toBe('NEUTRAL');
    });

    it('computes calibrated softmax probabilities summing to 1.0', () => {
      const logits = [2.0, 1.0, 0.1];
      const probs = softmax(logits);
      expect(probs.length).toBe(3);
      const sum = probs.reduce((acc, p) => acc + p, 0);
      expect(sum).toBeCloseTo(1.0, 2);
      expect(probs[0]).toBeGreaterThan(probs[1]);
      expect(probs[1]).toBeGreaterThan(probs[2]);
    });
  });

  describe('Passage Handling & Chunking', () => {
    it('safely splits long evidence passages without losing text', () => {
      const longText =
        'Sentence one about population data. '.repeat(20) +
        'Sentence two confirming the statistics officially.';
      const chunks = chunkLongPassage(longText, 300);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(450);
      });
    });
  });

  describe('Premise and Hypothesis Verification', () => {
    it('passes premise and hypothesis in correct order (premise = evidence, hypothesis = claim)', async () => {
      let recordedPremise = '';
      let recordedHypothesis = '';

      const testAdapter: NLIModelAdapter = {
        modelIdentifier: 'mock-test',
        getLabelMapping: () => DEBERTA_V3_LABEL_MAPPING,
        predict: async (pairs: NLIPair[]) => {
          recordedPremise = pairs[0].premise;
          recordedHypothesis = pairs[0].hypothesis;
          return [{ entailment: 0.95, contradiction: 0.02, neutral: 0.03 }];
        },
      };

      const customVerifier = new NLIVerifier(testAdapter);
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_order_check',
        claim_text: 'Paris is the capital of France.',
        evidence: [
          {
            evidence_id: 'ev_1',
            text: 'Official records state that Paris is the capital of France.',
            source_title: 'French Government Portal',
            source_url: 'https://gov.fr/capital',
          },
        ],
      };

      await customVerifier.verifyClaim(req);
      expect(recordedPremise).toBe('Official records state that Paris is the capital of France.');
      expect(recordedHypothesis).toBe('Paris is the capital of France.');
    });
  });

  describe('Claim–Evidence NLI Evaluation', () => {
    it('Case 1: correctly identifies ENTAILMENT and returns SUPPORTED assessment', async () => {
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_1',
        claim_text: 'New Delhi is the official capital of India.',
        evidence: [
          {
            evidence_id: 'ev_1',
            text: 'New Delhi is officially designated as the capital of India according to the Constitution.',
            source_title: 'Government of India Directory',
            source_url: 'https://india.gov.in/capital',
          },
        ],
      };

      const result = await verifier.verifyClaim(req);
      expect(result.claim_id).toBe('claim_1');
      expect(result.assessment).toBe('SUPPORTED');
      expect(result.evidence_results.length).toBe(1);
      expect(result.evidence_results[0].nli_label).toBe('ENTAILMENT');
      expect(result.evidence_results[0].scores.entailment).toBeGreaterThan(0.6);
      expect(result.explanation).toContain('substantiates');
    });

    it('Case 2: correctly identifies CONTRADICTION and returns CONTRADICTED assessment', async () => {
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_2',
        claim_text: 'The Great Wall of China is visible from the Moon with the naked eye.',
        evidence: [
          {
            evidence_id: 'ev_2',
            text: 'NASA records and Apollo astronauts confirmed it is a myth: the Great Wall of China is not visible from the Moon with the naked eye.',
            source_title: 'NASA Lunar Observation Records',
            source_url: 'https://nasa.gov/great-wall-myth',
          },
        ],
      };

      const result = await verifier.verifyClaim(req);
      expect(result.claim_id).toBe('claim_2');
      expect(result.assessment).toBe('CONTRADICTED');
      expect(result.evidence_results.length).toBe(1);
      expect(result.evidence_results[0].nli_label).toBe('CONTRADICTION');
      expect(result.evidence_results[0].scores.contradiction).toBeGreaterThan(0.6);
      expect(result.explanation).toContain('contradicts');
    });

    it('Case 3: correctly identifies NEUTRAL evidence and returns INCONCLUSIVE assessment', async () => {
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_3',
        claim_text: 'The treaty was signed on October 14, 1925.',
        evidence: [
          {
            evidence_id: 'ev_3',
            text: 'The conference room was decorated with mahogany tables and velvet curtains during the international delegation visit.',
            source_title: 'Historical Interior Archive',
            source_url: 'https://archive.org/rooms',
          },
        ],
      };

      const result = await verifier.verifyClaim(req);
      expect(result.assessment).toBe('INCONCLUSIVE');
      expect(result.evidence_results[0].nli_label).toBe('NEUTRAL');
      expect(result.evidence_results[0].scores.neutral).toBeGreaterThan(0.5);
      expect(result.explanation).toContain('insufficient');
    });

    it('Case 4: detects conflicting evidence passages from distinct sources and returns MIXED assessment', async () => {
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_4',
        claim_text: 'The summit agreement was ratified unanimously.',
        evidence: [
          {
            evidence_id: 'ev_4a',
            text: 'Official records confirm the summit agreement was ratified unanimously by all participating states.',
            source_title: 'Summit Official Release',
            source_url: 'https://summit.org/release',
          },
          {
            evidence_id: 'ev_4b',
            text: 'Contrary to official claims, independent monitors report two delegations did not vote and refused to ratify.',
            source_title: 'Independent Monitor Report',
            source_url: 'https://monitors.org/dissent',
          },
        ],
      };

      const result = await verifier.verifyClaim(req);
      expect(result.assessment).toBe('MIXED');
      expect(result.evidence_results.length).toBe(2);
      expect(result.explanation).toContain('conflicting');
    });

    it('Case 5: prevents counting multiple passages from the same domain as independent corroboration', () => {
      const key1 = extractSourceKey('https://example.com/page1', 'Example Report');
      const key2 = extractSourceKey('https://example.com/page2', 'Example Report');
      expect(key1).toBe('example.com');
      expect(key2).toBe('example.com');
      expect(key1).toBe(key2);

      const aggregator = new NLIAggregator({ minDistinctSources: 2 });
      const sameSourceResults = [
        {
          evidence_id: '1',
          nli_label: 'ENTAILMENT' as const,
          scores: { entailment: 0.9, contradiction: 0.05, neutral: 0.05 },
          passage: 'Passage one.',
          source_title: 'Example News',
          source_url: 'https://news.example.com/article1',
        },
        {
          evidence_id: '2',
          nli_label: 'ENTAILMENT' as const,
          scores: { entailment: 0.9, contradiction: 0.05, neutral: 0.05 },
          passage: 'Passage two.',
          source_title: 'Example News',
          source_url: 'https://news.example.com/article2',
        },
      ];

      const aggResult = aggregator.aggregate('Some claim', sameSourceResults);
      // Because minDistinctSources=2 and both came from news.example.com, it should remain INCONCLUSIVE
      expect(aggResult.distinctSourcesCount).toBe(1);
      expect(aggResult.assessment).toBe('INCONCLUSIVE');
    });

    it('Case 6: handles empty evidence array gracefully without crashing', async () => {
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_empty',
        claim_text: 'Jupiter has 95 known moons.',
        evidence: [],
      };

      const result = await verifier.verifyClaim(req);
      expect(result.claim_id).toBe('claim_empty');
      expect(result.assessment).toBe('INCONCLUSIVE');
      expect(result.evidence_results).toEqual([]);
      expect(result.explanation).toContain('No evidence passages were provided');
    });

    it('Case 7: rejects missing or invalid input fields with descriptive validation errors', async () => {
      // @ts-expect-error test invalid payload
      await expect(verifier.verifyClaim(null)).rejects.toThrow('Invalid verification request');

      await expect(
        // @ts-expect-error test missing claim_id
        verifier.verifyClaim({ claim_text: 'Text', evidence: [] })
      ).rejects.toThrow('Missing or invalid claim_id');

      await expect(
        // @ts-expect-error test missing claim_text
        verifier.verifyClaim({ claim_id: '1', evidence: [] })
      ).rejects.toThrow('Missing or empty claim_text');

      await expect(
        verifier.verifyClaim({ claim_id: '1', claim_text: '', evidence: [] })
      ).rejects.toThrow('Missing or empty claim_text');

      await expect(
        // @ts-expect-error test invalid evidence type
        verifier.verifyClaim({ claim_id: '1', claim_text: 'Text', evidence: 'invalid' })
      ).rejects.toThrow('evidence must be an array');
    });

    it('Case 8: handles model inference errors gracefully without crashing the service', async () => {
      const failingAdapter: NLIModelAdapter = {
        modelIdentifier: 'failing-adapter',
        getLabelMapping: () => DEBERTA_V3_LABEL_MAPPING,
        predict: async () => {
          throw new Error('Service Unavailable 503');
        },
      };

      const fallbackVerifier = new NLIVerifier(failingAdapter);
      const req: ClaimVerificationRequest = {
        claim_id: 'claim_fail_resilience',
        claim_text: 'Gold is a noble metal.',
        evidence: [
          {
            evidence_id: 'ev_fail',
            text: 'Gold does not react with oxygen.',
            source_title: 'Chemistry Reference',
            source_url: 'https://chem.org/gold',
          },
        ],
      };

      const result = await fallbackVerifier.verifyClaim(req);
      expect(result.claim_id).toBe('claim_fail_resilience');
      expect(result.assessment).toBe('INCONCLUSIVE');
      expect(result.evidence_results[0].nli_label).toBe('NEUTRAL');
    });

    it('Case 10: handleApiVerification returns 400 for bad requests and 200 for valid requests', async () => {
      const badRes = await verifier.handleApiVerification({ claim_id: 'c1' });
      expect(badRes.status).toBe(400);

      const goodRes = await verifier.handleApiVerification({
        claim_id: 'c1',
        claim_text: 'The speed of light in vacuum is approximately 300,000 km/s.',
        evidence: [],
      });
      expect(goodRes.status).toBe(200);
      if ('assessment' in goodRes.data) {
        expect(goodRes.data.assessment).toBe('INCONCLUSIVE');
      }
    });
  });

  describe('Regression: Capital & Proposition Entailment vs Semantic Similarity', () => {
    it('Test A: "The capital of Australia is Sydney." is REFUTED and cites the contradictory Canberra evidence', async () => {
      const claim: ExtractedClaim = {
        id: 'claim_australia_sydney',
        original_text: 'The capital of Australia is Sydney.',
        normalized_claim: 'The capital of Australia is Sydney.',
        claim_type: 'political',
        check_worthy: true,
        reason: 'Capital assertion',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Sydney - Wikipedia',
          snippet: 'Sydney is the capital city of the state of New South Wales, and the most populous city in Australia.',
          url: 'https://en.wikipedia.org/wiki/Sydney',
          publisher: 'Wikipedia',
        },
        {
          title: 'Canberra - Wikipedia',
          snippet: 'Canberra is the capital city of Australia. Founded following the federation of the colonies of Australia...',
          url: 'https://en.wikipedia.org/wiki/Canberra',
          publisher: 'Wikipedia',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict).toBe('REFUTED');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
      expect(result.explanation).toContain('contradicts');
      // Verify supporting evidence contains contradiction (Canberra is capital of Australia)
      expect(result.explanation).toMatch(/Canberra is the capital city of Australia/i);
    });

    it('Test B: "The capital of Australia is Canberra." is SUPPORTED', async () => {
      const claim: ExtractedClaim = {
        id: 'claim_australia_canberra',
        original_text: 'The capital of Australia is Canberra.',
        normalized_claim: 'The capital of Australia is Canberra.',
        claim_type: 'political',
        check_worthy: true,
        reason: 'Capital assertion',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Canberra - Wikipedia',
          snippet: 'Canberra is the capital city of Australia. Founded following the federation of the colonies of Australia as the seat of government...',
          url: 'https://en.wikipedia.org/wiki/Canberra',
          publisher: 'Wikipedia',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict).toBe('SUPPORTED');
      expect(result.confidence).toBeGreaterThanOrEqual(80);
      expect(result.explanation).toContain('substantiates');
    });

    it('Test C: "The capital of Australia is Sydney." + "Sydney is the largest city in Australia." is not SUPPORTED (UNVERIFIABLE)', async () => {
      const claim: ExtractedClaim = {
        id: 'claim_c',
        original_text: 'The capital of Australia is Sydney.',
        normalized_claim: 'The capital of Australia is Sydney.',
        claim_type: 'political',
        check_worthy: true,
        reason: 'Capital assertion',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Sydney Geography',
          snippet: 'Sydney is the largest city in Australia.',
          url: 'https://example.com/sydney-largest',
          publisher: 'City Guide',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict).not.toBe('SUPPORTED');
      expect(result.verdict).toBe('UNVERIFIABLE');
    });

    it('Test D: "The capital of Australia is Sydney." + "Canberra is the capital of Australia." is REFUTED', async () => {
      const claim: ExtractedClaim = {
        id: 'claim_d',
        original_text: 'The capital of Australia is Sydney.',
        normalized_claim: 'The capital of Australia is Sydney.',
        claim_type: 'political',
        check_worthy: true,
        reason: 'Capital assertion',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Australian Government Portal',
          snippet: 'Canberra is the capital of Australia.',
          url: 'https://australia.gov.au/capital',
          publisher: 'Australian Government',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict).toBe('REFUTED');
      expect(result.explanation).toMatch(/Canberra is the capital of Australia/i);
    });

    it('Test E: "The capital of Australia is Sydney." + "Sydney has a population of approximately 5.6 million." is NEUTRAL / UNVERIFIABLE', async () => {
      const claim: ExtractedClaim = {
        id: 'claim_e',
        original_text: 'The capital of Australia is Sydney.',
        normalized_claim: 'The capital of Australia is Sydney.',
        claim_type: 'political',
        check_worthy: true,
        reason: 'Capital assertion',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Demographics Archive',
          snippet: 'Sydney has a population of approximately 5.6 million.',
          url: 'https://example.com/population',
          publisher: 'Demographics Office',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict).not.toBe('SUPPORTED');
      expect(result.verdict).toBe('UNVERIFIABLE');
    });

    it('Test F: "The capital of Australia is Sydney." + Evidence 1 (largest city) + Evidence 2 (Canberra is capital) is REFUTED without dilution', async () => {
      const claim: ExtractedClaim = {
        id: 'claim_f',
        original_text: 'The capital of Australia is Sydney.',
        normalized_claim: 'The capital of Australia is Sydney.',
        claim_type: 'political',
        check_worthy: true,
        reason: 'Capital assertion',
      };
      const sources: EvidenceSource[] = [
        {
          title: 'Sydney Demographics',
          snippet: 'Sydney is the largest city in Australia.',
          url: 'https://example.com/sydney-largest',
          publisher: 'City Guide',
        },
        {
          title: 'Australian Government Directory',
          snippet: 'Canberra is the capital city of Australia.',
          url: 'https://australia.gov.au/capital',
          publisher: 'Australian Government',
        },
      ];

      const result = await verifier.verifyWithEvidence(claim, sources);
      expect(result.verdict).toBe('REFUTED');
      expect(result.explanation).toContain('contradicts');
      expect(result.explanation).toMatch(/Canberra is the capital city of Australia/i);
    });

    it('generalizes to other entities and relations (e.g. currency, invention)', async () => {
      const currencyClaim: ExtractedClaim = {
        id: 'claim_currency',
        original_text: 'The currency of Japan is the Yuan.',
        normalized_claim: 'The currency of Japan is the Yuan.',
        claim_type: 'general factual',
        check_worthy: true,
        reason: 'Currency assertion',
      };
      const currencySources: EvidenceSource[] = [
        {
          title: 'Bank of Japan',
          snippet: 'The yen is the official currency of Japan.',
          url: 'https://boj.or.jp/currency',
          publisher: 'Bank of Japan',
        },
      ];
      const currencyResult = await verifier.verifyWithEvidence(currencyClaim, currencySources);
      expect(currencyResult.verdict).toBe('REFUTED');

      const correctCurrencyClaim: ExtractedClaim = {
        id: 'claim_currency_correct',
        original_text: 'The currency of Japan is the Yen.',
        normalized_claim: 'The currency of Japan is the Yen.',
        claim_type: 'general factual',
        check_worthy: true,
        reason: 'Currency assertion',
      };
      const correctResult = await verifier.verifyWithEvidence(correctCurrencyClaim, currencySources);
      expect(correctResult.verdict).toBe('SUPPORTED');
    });
  });
});
