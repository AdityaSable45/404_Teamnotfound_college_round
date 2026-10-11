import { describe, it, expect } from 'vitest';
import { claimExtractorService } from '../server/services/claimExtractor.js';
import { languageDetector } from '../server/services/audit/languageDetector.js';
import { uncertaintyAnalyzer } from '../server/services/audit/uncertaintyAnalyzer.js';
import { confidenceCalibrator } from '../server/services/audit/confidenceCalibrator.js';
import { temporalVerifier } from '../server/services/audit/temporalVerifier.js';
import { conflictDetector } from '../server/services/audit/conflictDetector.js';
import { whyWrongGenerator } from '../server/services/audit/whyWrongGenerator.js';
import { dependencyAnalyzer } from '../server/services/audit/dependencyAnalyzer.js';
import { sourceFilter } from '../server/services/retrieval/sourceFilter.js';
import type { ExtractedClaim, EvidenceSource } from '../server/services/contracts.js';

describe('Complete Product Hackathon Features Suite (Features 1–17)', () => {
  // Feature 1 & Feature 3: Error Localization Offsets & Extracted Entities
  it('Feature 1 & 3: extracts character start/end offsets and maps back to original answer', async () => {
    const input = 'The capital of Australia is Sydney. Australia became a federation in 1901.';
    const result = await claimExtractorService.extractClaims(input);

    expect(result.claims.length).toBe(2);
    const claim1 = result.claims[0];
    const claim2 = result.claims[1];

    expect(claim1.offset_start).toBe(0);
    expect(claim1.offset_end).toBe(35);
    expect(input.slice(claim1.offset_start!, claim1.offset_end!)).toBe('The capital of Australia is Sydney.');

    expect(claim2.offset_start).toBeGreaterThanOrEqual(35);
    expect(claim2.offset_end).toBe(input.length);
    expect(input.slice(claim2.offset_start!, claim2.offset_end!)).toContain('Australia became a federation in 1901');

    // Check entities & relations extraction
    expect(claim1.entities?.length).toBeGreaterThan(0);
  });

  // Feature 5: Uncertainty & Ambiguity Handling
  describe('Feature 5: Uncertainty & Ambiguity Analysis', () => {
    it('detects epistemic hedging and hearsay language', () => {
      const vague = uncertaintyAnalyzer.analyzeClaim('Scientists allegedly discovered a new particle, some say.');
      expect(vague.isUncertain).toBe(true);
      expect(vague.level).toBe('HIGH');
      expect(vague.flags).toContain('UNVERIFIED_HEARSAY');
    });

    it('detects extreme universal generalizations and absolute guarantees', () => {
      const absolute = uncertaintyAnalyzer.analyzeClaim('This medical treatment is 100% guaranteed to cure everyone.');
      expect(absolute.isUncertain).toBe(true);
      expect(absolute.level).toBe('HIGH');
      expect(absolute.flags).toContain('ABSOLUTE_GUARANTEE');
      expect(absolute.flags).toContain('UNIVERSAL_GENERALIZATION');
    });

    it('detects numerical approximations', () => {
      const approx = uncertaintyAnalyzer.analyzeClaim('The ancient fortress was built circa 1200 with approximately 5000 soldiers.');
      expect(approx.isUncertain).toBe(true);
      expect(approx.flags).toContain('APPROXIMATE_QUANTITY');
      expect(approx.flags).toContain('HISTORICAL_ESTIMATE');
    });
  });

  // Feature 6: Confidence Calibration & Human-Interpretable Rationale
  describe('Feature 6: Confidence Calibration', () => {
    it('produces high calibrated confidence with rationale for independent authoritative agreement', () => {
      const sources: EvidenceSource[] = [
        { title: 'Source 1', snippet: 'A', url: 'https://nasa.gov/article1', tier: 'GOVERNMENT' },
        { title: 'Source 2', snippet: 'B', url: 'https://mit.edu/study2', tier: 'ACADEMIC' },
      ];
      const calibrated = confidenceCalibrator.calibrate({
        verdict: 'SUPPORTED',
        rawConfidence: 90,
        sources,
        independentGroupsCount: 2,
      });

      expect(calibrated.confidence_level).toBe('HIGH');
      expect(calibrated.confidence).toBeGreaterThanOrEqual(85);
      expect(calibrated.confidence_rationale).toContain('High confidence');
      expect(calibrated.confidence_rationale).toContain('independent');
    });

    it('penalizes syndication copies from single origin and provides moderate rationale', () => {
      const sources: EvidenceSource[] = [
        { title: 'Mirror 1', snippet: 'Text', url: 'https://wire.example.com/a' },
        { title: 'Mirror 2', snippet: 'Text', url: 'https://wire.example.com/b' },
        { title: 'Mirror 3', snippet: 'Text', url: 'https://wire.example.com/c' },
      ];
      const calibrated = confidenceCalibrator.calibrate({
        verdict: 'SUPPORTED',
        rawConfidence: 80,
        sources,
        independentGroupsCount: 1, // syndication cluster
      });

      expect(calibrated.confidence).toBeLessThan(80);
      expect(calibrated.confidence_rationale).toContain('Moderate confidence');
    });
  });

  // Feature 8: "Why Is This Wrong?" Explanation Generation
  describe('Feature 8: "Why Is This Wrong?" Explanation', () => {
    it('generates an evidence-backed counter-explanation for refuted assertions', () => {
      const counterSources: EvidenceSource[] = [
        {
          title: 'Parliament of Australia Records',
          snippet: 'Canberra was chosen as the national capital city of Australia, while Sydney serves as the capital of New South Wales.',
          url: 'https://aph.gov.au/canberra',
        },
      ];

      const explanation = whyWrongGenerator.generate(
        'The capital of Australia is Sydney',
        'REFUTED',
        94,
        counterSources
      );

      expect(explanation).toBeDefined();
      expect(explanation?.summary).toContain('Sydney');
      expect(explanation?.summary).toContain('Parliament of Australia Records');
      expect(explanation?.key_counter_source).toBe('Parliament of Australia Records');
      expect(explanation?.contradicting_evidence).toContain('Canberra');
    });
  });

  // Feature 9: Evidence Conflict Detection
  describe('Feature 9: Evidence Conflict Detection', () => {
    it('detects conflicting evidence and notes authoritative refutation', () => {
      const supporting: EvidenceSource[] = [
        { title: 'Random Travel Forum', snippet: 'Sydney feels like the capital.', url: 'https://blog.travel.xyz' },
      ];
      const contradicting: EvidenceSource[] = [
        { title: 'National Government Portal', snippet: 'Canberra is the official federal capital.', url: 'https://australia.gov.au', tier: 'GOVERNMENT' },
      ];

      const conflict = conflictDetector.detectConflict(supporting, contradicting);
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.authoritativeDominance).toBe(true);
      expect(conflict.severity).toBe('HIGH');
      expect(conflict.explanation).toContain('Authoritative refutation');
    });
  });

  // Feature 10: Multilingual & Cross-Lingual Verification (Hindi + Marathi + English)
  describe('Feature 10: Multilingual Verification', () => {
    it('detects Hindi text, handles Devanagari danda, and generates cross-lingual keywords', () => {
      const hindiText = 'फ्रांस की राजधानी पेरिस है। भारत की राजधानी नई दिल्ली है।';
      const detection = languageDetector.detectLanguage(hindiText);

      expect(detection.language).toBe('hi');
      expect(detection.script).toBe('devanagari');
      expect(detection.isMultilingual).toBe(true);
      expect(detection.crossLingualQuery).toContain('France');
      expect(detection.crossLingualQuery).toContain('Paris');

      // Test danda sentence segmentation
      const sentences = languageDetector.splitMultilingualSentences(hindiText);
      expect(sentences.length).toBe(2);
      expect(sentences[0]).toContain('पेरिस');
      expect(sentences[1]).toContain('दिल्ली');
    });

    it('detects Marathi text and distinguishes it from Hindi', () => {
      const marathiText = 'फ्रान्सची राजधानी पॅरिस आहे. भारताची राजधानी नवी दिल्ली आहे.';
      const detection = languageDetector.detectLanguage(marathiText);

      expect(detection.language).toBe('mr');
      expect(detection.script).toBe('devanagari');
      expect(detection.isMultilingual).toBe(true);
      expect(detection.crossLingualQuery).toContain('Paris');
    });
  });

  // Feature 11: Temporal / As-Of Verification
  describe('Feature 11: Temporal Verification', () => {
    it('extracts as-of dates, historical years, and current temporal markers', () => {
      const asOf = temporalVerifier.extractTemporalContext('As of 2024, OpenAI released advanced reasoning models.');
      expect(asOf.type).toBe('AS_OF');
      expect(asOf.year).toBe(2024);

      const hist = temporalVerifier.extractTemporalContext('Australia became a federation in 1901.');
      expect(hist.type).toBe('HISTORICAL');
      expect(hist.year).toBe(1901);

      const curr = temporalVerifier.extractTemporalContext('Sundar Pichai is currently the CEO of Alphabet.');
      expect(curr.type).toBe('CURRENT');

      const future = temporalVerifier.extractTemporalContext('The mission will be launched to Mars by 2035.');
      expect(future.type).toBe('FUTURE');
    });

    it('flags stale or historical evidence when verifying a present-tense claim', () => {
      const currContext = temporalVerifier.extractTemporalContext('He is currently the active leader.');
      const alignment = temporalVerifier.evaluateTemporalAlignment(
        currContext,
        'He was the leader until 2018 when he stepped down.'
      );
      expect(alignment.isAligned).toBe(false);
      expect(alignment.warning).toContain('historical or superseded status');
    });
  });

  // Feature 12 & Feature 13: Source Categorization & Independence Clustering
  describe('Feature 12 & 13: Source Reliability & Independence Clustering', () => {
    it('classifies Wikipedia & Britannica as REFERENCE_ENCYCLOPEDIA, not Trusted News', () => {
      const sources = [
        { title: 'Britannica Article', url: 'https://britannica.com/topic/wall', snippet: 'Excerpt' },
        { title: 'Wikipedia Entry', url: 'https://en.wikipedia.org/wiki/Wall', snippet: 'Excerpt' },
      ];
      const filtered = sourceFilter.filterAndRankSources(sources);
      for (const item of filtered) {
        expect(item.tier).toBe('REFERENCE_ENCYCLOPEDIA');
        expect(item.tier).not.toBe('MAINSTREAM_NEWS');
        expect(item.credibilityScore).toBe(90);
      }
    });

    it('clusters syndicated wire stories into independent evidence groups', () => {
      const sources: EvidenceSource[] = [
        { title: 'AP News Report', snippet: 'Associated Press story on summit', url: 'https://apnews.com/article1' },
        { title: 'Local Paper Mirror', snippet: 'Associated Press wire coverage of summit', url: 'https://localpaper.com/article2' },
        { title: 'Official Gov Release', snippet: 'Government press statement', url: 'https://state.gov/release' },
      ];

      const clustered = sourceFilter.clusterIndependentEvidenceGroups(sources);
      expect(clustered.independentGroupsCount).toBe(2);
      expect(clustered.summary).toBe('3 sources found, 2 independent evidence groups.');
    });
  });

  // Feature 14: Claim Dependency Analysis
  describe('Feature 14: Claim Dependency Analysis', () => {
    it('maps premise-conclusion dependencies and flags conclusions relying on refuted premises', () => {
      const claims: ExtractedClaim[] = [
        {
          id: 'claim_1',
          original_text: 'Sydney is the capital of Australia.',
          normalized_claim: 'Sydney is the capital of Australia.',
          claim_type: 'political',
          check_worthy: true,
          reason: 'Premise',
        },
        {
          id: 'claim_2',
          original_text: 'Therefore, all federal government headquarters are located in Sydney.',
          normalized_claim: 'All federal government headquarters are located in Sydney.',
          claim_type: 'causal',
          check_worthy: true,
          reason: 'Conclusion',
        },
      ];

      const verifiedClaims = [
        { ...claims[0], verdict: 'REFUTED' as const, confidence: 95, explanation: 'Canberra is capital', sources: [] },
      ];

      const nodes = dependencyAnalyzer.analyzeDependencies(claims, verifiedClaims);
      expect(nodes.length).toBe(2);
      expect(nodes[1].isConclusion).toBe(true);
      expect(nodes[1].dependsOnClaimIds).toContain('claim_1');
      expect(nodes[1].issueWarning).toContain('Depends on Claim #1, which was REFUTED');
    });
  });

  // Feature 17: Audit Modes
  describe('Feature 17: Audit Modes Filtering', () => {
    it('prioritizes academic, official, and encyclopedia sources in Research Mode', () => {
      const sources: EvidenceSource[] = [
        { title: 'Blog Post', url: 'https://travelblog.com/tips', snippet: 'A', tier: 'GENERAL_WEB' },
        { title: 'Nature Study', url: 'https://nature.com/articles/123', snippet: 'B', tier: 'ACADEMIC' },
        { title: 'Gov Portal', url: 'https://whitehouse.gov/briefing', snippet: 'C', tier: 'GOVERNMENT' },
      ];

      const filtered = sourceFilter.filterAndRankSources(sources, 'research');
      expect(filtered[0].tier).toBe('GOVERNMENT');
      expect(filtered[1].tier).toBe('ACADEMIC');
      const blog = filtered.find((f) => f.domain.includes('travelblog.com'));
      expect(blog?.credibilityScore).toBeLessThan(50);
    });
  });
});
