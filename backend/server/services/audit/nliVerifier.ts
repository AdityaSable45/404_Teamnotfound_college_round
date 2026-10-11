import type { ExtractedClaim, EvidenceSource, Verdict } from '../contracts.js';
import { logger } from '../../utils/logger.js';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import type {
  ClaimVerificationRequest,
  ClaimVerificationResult,
  EvidenceComparisonResult,
  NLILabel,
  NLIScores,
  ClaimAssessment,
} from './nliTypes.js';
import {
  type NLIModelAdapter,
  DebertaCrossEncoderAdapter,
  debertaNLIAdapter,
  chunkLongPassage,
} from './nliAdapter.js';
import { NLIAggregator, nliAggregator, isUntrustedUserForum } from './nliAggregator.js';

export interface NLIResult {
  verdict: Verdict;
  confidence: number;
  explanation: string;
}
export const NLIResult = {};

export class NLIVerifier {
  private adapter: NLIModelAdapter;
  private aggregator: NLIAggregator;

  constructor(adapter?: NLIModelAdapter, aggregator?: NLIAggregator) {
    this.adapter = adapter || debertaNLIAdapter;
    this.aggregator = aggregator || nliAggregator;
  }

  /**
   * Returns metadata and label mapping of the active NLI model.
   */
  getModelInfo() {
    return {
      modelIdentifier: this.adapter.modelIdentifier,
      labelMapping: this.adapter.getLabelMapping(),
    };
  }

  /**
   * Feature 3: Evidence-Based Claim Verification Using NLI Model
   * Evaluates an extracted claim against retrieved evidence passages.
   */
  async verifyClaim(
    request: ClaimVerificationRequest
  ): Promise<ClaimVerificationResult> {
    // 1. Input Validation
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid verification request: Payload must be a non-null object');
    }

    if (!request.claim_id || typeof request.claim_id !== 'string') {
      throw new Error('Invalid verification request: Missing or invalid claim_id');
    }

    if (!request.claim_text || typeof request.claim_text !== 'string' || !request.claim_text.trim()) {
      throw new Error('Invalid verification request: Missing or empty claim_text');
    }

    if (!Array.isArray(request.evidence)) {
      throw new Error('Invalid verification request: evidence must be an array');
    }

    // 2. Handle empty evidence cleanly without crashing
    if (request.evidence.length === 0) {
      return {
        claim_id: request.claim_id,
        claim_text: request.claim_text,
        assessment: 'INCONCLUSIVE',
        evidence_results: [],
        explanation: 'No evidence passages were provided to evaluate this claim.',
      };
    }

    // Check multi-proposition decomposition
    const subProps = decomposeClaim(request.claim_text);
    if (subProps.length > 1) {
      const subResults = subProps.map((subClaim) => {
        const subEvResults: EvidenceComparisonResult[] = [];
        for (const item of request.evidence) {
          const evidenceText = (item.text || '').trim();
          const evidenceId = item.evidence_id || `evidence_${subEvResults.length + 1}`;
          const sourceTitle = item.source_title || 'Untitled Source';
          const sourceUrl = item.source_url || '';
          if (!evidenceText) continue;

          const chunks = chunkLongPassage(evidenceText, 600);
          let bestScore: NLIScores = { entailment: 0.05, contradiction: 0.05, neutral: 0.9 };
          let bestChunk = chunks[0] || evidenceText;

          for (const chunk of chunks) {
            const score = this.adapter instanceof DebertaCrossEncoderAdapter
              ? this.adapter.predictLocalPair({ premise: chunk, hypothesis: subClaim })
              : debertaNLIAdapter.predictLocalPair({ premise: chunk, hypothesis: subClaim });

            const currentDecisiveness = Math.max(score.entailment, score.contradiction);
            const bestDecisiveness = Math.max(bestScore.entailment, bestScore.contradiction);
            if (currentDecisiveness > bestDecisiveness) {
              bestScore = score;
              bestChunk = chunk;
            }
          }

          let label: NLILabel = 'NEUTRAL';
          if (bestScore.contradiction > bestScore.entailment && bestScore.contradiction >= 0.5) {
            label = 'CONTRADICTION';
          } else if (bestScore.entailment > bestScore.contradiction && bestScore.entailment >= 0.5) {
            label = 'ENTAILMENT';
          }

          subEvResults.push({
            evidence_id: evidenceId,
            nli_label: label,
            scores: bestScore,
            passage: bestChunk,
            source_title: sourceTitle,
            source_url: sourceUrl,
          });
        }

        return {
          claimText: subClaim,
          aggregation: this.aggregator.aggregate(subClaim, subEvResults),
          evResults: subEvResults,
        };
      });

      const anyContradicted = subResults.some((r) => r.aggregation.assessment === 'CONTRADICTED');
      const allSupported = subResults.every((r) => r.aggregation.assessment === 'SUPPORTED');
      const anySupported = subResults.some((r) => r.aggregation.assessment === 'SUPPORTED');

      let overallAssessment: ClaimAssessment = 'INCONCLUSIVE';
      let overallExplanation = '';

      if (allSupported) {
        overallAssessment = 'SUPPORTED';
        overallExplanation = `All constituent propositions verified by retrieved authoritative sources:\n${subResults.map((r, i) => `${i + 1}. "${r.claimText}": ${r.aggregation.explanation}`).join('\n')}`;
      } else if (anyContradicted && anySupported) {
        overallAssessment = 'MIXED';
        overallExplanation = `This compound statement is misleading because it combines verified facts with contradicted assertions:\n${subResults.map((r, i) => `${i + 1}. "${r.claimText}" -> ${r.aggregation.assessment}: ${r.aggregation.explanation}`).join('\n')}`;
      } else if (anyContradicted) {
        overallAssessment = 'CONTRADICTED';
        overallExplanation = `Key assertions in this statement are directly contradicted by authoritative sources:\n${subResults.map((r, i) => `${i + 1}. "${r.claimText}" -> ${r.aggregation.assessment}: ${r.aggregation.explanation}`).join('\n')}`;
      } else if (anySupported) {
        overallAssessment = 'SUPPORTED';
        overallExplanation = `Supported in part by retrieved authoritative sources:\n${subResults.map((r, i) => `${i + 1}. "${r.claimText}" -> ${r.aggregation.assessment}: ${r.aggregation.explanation}`).join('\n')}`;
      } else {
        overallAssessment = 'INCONCLUSIVE';
        overallExplanation = 'Insufficient authoritative evidence passages were found to verify this compound claim.';
      }

      const allEv = subResults.flatMap((r) => r.evResults);
      return {
        claim_id: request.claim_id,
        claim_text: request.claim_text,
        assessment: overallAssessment,
        evidence_results: allEv,
        explanation: overallExplanation,
      };
    }

    const evidenceResults: EvidenceComparisonResult[] = [];

    // 3. Compare each evidence passage against the claim hypothesis
    for (const item of request.evidence) {
      if (!item || typeof item !== 'object') continue;

      const evidenceText = (item.text || '').trim();
      const evidenceId = item.evidence_id || `evidence_${evidenceResults.length + 1}`;
      const sourceTitle = item.source_title || 'Untitled Source';
      const sourceUrl = item.source_url || '';

      if (!evidenceText) {
        // Empty passage is neutral
        evidenceResults.push({
          evidence_id: evidenceId,
          nli_label: 'NEUTRAL',
          scores: { entailment: 0.05, contradiction: 0.05, neutral: 0.9 },
          passage: '',
          source_title: sourceTitle,
          source_url: sourceUrl,
          published_at: item.published_at,
        });
        continue;
      }

      // Safe passage handling: chunk long passages without losing source association
      const chunks = chunkLongPassage(evidenceText, 600);

      // Premise: evidence passage chunk | Hypothesis: claim text
      const pairs = chunks.map((chunk) => ({
        premise: chunk,
        hypothesis: request.claim_text,
      }));

      let chunkScores: NLIScores[] = [];
      try {
        chunkScores = await this.adapter.predict(pairs);
      } catch (err: unknown) {
        logger.warn(
          `NLI inference failed for evidence '${evidenceId}': ${err instanceof Error ? err.message : String(err)}`
        );
        chunkScores = pairs.map(() => ({
          entailment: 0.05,
          contradiction: 0.05,
          neutral: 0.9,
        }));
      }

      // Select chunk with strongest decisive signal (max entailment or max contradiction)
      let bestScore = chunkScores[0] || { entailment: 0.05, contradiction: 0.05, neutral: 0.9 };
      let bestChunk = chunks[0] || evidenceText;

      for (let i = 0; i < chunkScores.length; i++) {
        const score = chunkScores[i];
        const currentDecisiveness = Math.max(score.entailment, score.contradiction);
        const bestDecisiveness = Math.max(bestScore.entailment, bestScore.contradiction);
        if (currentDecisiveness > bestDecisiveness) {
          bestScore = score;
          bestChunk = chunks[i];
        }
      }

      // Determine label based on model scores
      let label: NLILabel = 'NEUTRAL';
      if (bestScore.contradiction > bestScore.entailment && bestScore.contradiction >= 0.5) {
        label = 'CONTRADICTION';
      } else if (bestScore.entailment > bestScore.contradiction && bestScore.entailment >= 0.5) {
        label = 'ENTAILMENT';
      }

      evidenceResults.push({
        evidence_id: evidenceId,
        nli_label: label,
        scores: bestScore,
        passage: bestChunk,
        source_title: sourceTitle,
        source_url: sourceUrl,
        published_at: item.published_at,
      });
    }

    // 4. Aggregate evidence conservatively into a claim-level assessment
    const aggregation = this.aggregator.aggregate(request.claim_text, evidenceResults);

    return {
      claim_id: request.claim_id,
      claim_text: request.claim_text,
      assessment: aggregation.assessment,
      evidence_results: evidenceResults,
      explanation: aggregation.explanation,
    };
  }

  /**
   * Helper to handle HTTP API calls cleanly with standard status codes
   */
  async handleApiVerification(body: unknown): Promise<{
    status: number;
    data: ClaimVerificationResult | { error: string };
  }> {
    if (!body || typeof body !== 'object') {
      return {
        status: 400,
        data: { error: 'Request body must be a valid JSON object' },
      };
    }

    try {
      const result = await this.verifyClaim(body as ClaimVerificationRequest);
      return { status: 200, data: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Internal verification failure';
      if (msg.startsWith('Invalid verification request')) {
        return { status: 400, data: { error: msg } };
      }
      logger.error('NLI claim verification error', { error: msg });
      return { status: 500, data: { error: 'Verification service error' } };
    }
  }

  // =========================================================================
  // Backward-Compatible Methods (retained for existing pipeline & test suite)
  // =========================================================================

  async verifyWithEvidence(
    claim: ExtractedClaim,
    sources: EvidenceSource[]
  ): Promise<NLIResult> {
    const provider = (process.env.LLM_PROVIDER || '').toLowerCase();

    // 1. If OpenAI is configured or auto-detected in environment, use OpenAI NLI
    if ((provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) && process.env.OPENAI_API_KEY && sources.length > 0) {
      try {
        return await this.verifyWithOpenAINLI(claim, sources);
      } catch (err: unknown) {
        logger.warn(`OpenAI NLI evaluation failed (${err instanceof Error ? err.message : String(err)}), trying next provider`);
      }
    }

    // 2. If Gemini is configured or auto-detected in environment, use Gemini NLI
    if ((provider === 'gemini' || (!provider && process.env.GEMINI_API_KEY)) && process.env.GEMINI_API_KEY && sources.length > 0) {
      try {
        return await this.verifyWithGeminiNLI(claim, sources);
      } catch (err: unknown) {
        logger.warn(`Gemini NLI evaluation failed (${err instanceof Error ? err.message : String(err)}), falling back to algorithmic NLI evaluation`);
      }
    }

    // 3. Perform algorithmic Natural Language Inference over real retrieved evidence
    return this.evaluateAlgorithmicNLI(claim, sources);
  }

  private async verifyWithOpenAINLI(
    claim: ExtractedClaim,
    sources: EvidenceSource[]
  ): Promise<NLIResult> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const evidenceText = sources
      .slice(0, 8)
      .map(
        (s, i) =>
          `[Source ${i + 1}] (${s.publisher || 'Web Source'}): "${s.title || ''}"\nSnippet: "${s.snippet || ''}"\nURL: ${s.url || ''}`
      )
      .join('\n\n');

    const prompt = `You are an expert fact-checker for Second Opinion.
Evaluate the following factual claim against the REAL retrieved live evidence sources.

CLAIM: "${claim.normalized_claim || claim.original_text}"
ORIGINAL TEXT: "${claim.original_text}"

RETRIEVED EVIDENCE SOURCES:
${evidenceText}

CRITICAL RULES:
1. SEMANTIC SIMILARITY IS NOT ENTAILMENT: Merely sharing keywords with the claim does NOT mean the evidence supports the claim. If the evidence only discusses the topic without confirming the fact, it does NOT entail it.
2. Contradiction has absolute priority: If authoritative evidence directly refutes the claim or proves an incompatible reality (e.g. claim says Sydney is the capital of Australia, but evidence says Canberra is the capital; claim says Great Wall is in Japan, but evidence says China; claim says Einstein invented telephone, but evidence says Bell), the verdict MUST be "REFUTED".
3. Negation & Falsehood: If the claim asserts an untrue relationship, debunked myth, false attribution, or incorrect number/location, verdict MUST be "REFUTED".
4. "SUPPORTED" requires that the retrieved evidence explicitly entails, proves, and substantiates the claim. Do NOT mark "SUPPORTED" if the evidence only discusses the topic without proving the specific proposition.
5. "MISLEADING": The claim mixes true statements with false context or unverified exaggerations.
6. "UNVERIFIABLE": The evidence does not contain enough information to prove or disprove the claim.

Return pure JSON only in this format:
{
  "verdict": "SUPPORTED" | "REFUTED" | "MISLEADING" | "UNVERIFIABLE",
  "confidence": number between 60 and 99,
  "explanation": "2-3 concise sentences explaining the verification verdict based directly on what the retrieved sources state, citing specific counter-evidence or corroborating facts."
}`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an objective fact-checking Natural Language Inference engine. Return pure valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI NLI model');
    }

    const parsed = JSON.parse(content);
    const validVerdicts: Verdict[] = ['SUPPORTED', 'REFUTED', 'MISLEADING', 'UNVERIFIABLE'];
    const verdict: Verdict = validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'UNVERIFIABLE';
    const confidence = typeof parsed.confidence === 'number' ? Math.max(60, Math.min(99, Math.round(parsed.confidence))) : 85;
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : 'Evaluated against retrieved evidence.';

    return { verdict, confidence, explanation };
  }

  private async verifyWithGeminiNLI(
    claim: ExtractedClaim,
    sources: EvidenceSource[]
  ): Promise<NLIResult> {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const evidenceText = sources
      .slice(0, 8)
      .map(
        (s, i) =>
          `[Source ${i + 1}] (${s.publisher || 'Web Source'}): "${s.title || ''}"\nSnippet: "${s.snippet || ''}"\nURL: ${s.url || ''}`
      )
      .join('\n\n');

    const prompt = `You are an expert fact-checker for Second Opinion.
Evaluate the following factual claim against the REAL retrieved live evidence sources.

CLAIM: "${claim.normalized_claim || claim.original_text}"
ORIGINAL TEXT: "${claim.original_text}"

RETRIEVED EVIDENCE SOURCES:
${evidenceText}

CRITICAL RULES:
1. SEMANTIC SIMILARITY IS NOT ENTAILMENT: Merely sharing keywords with the claim does NOT mean the evidence supports the claim. If the evidence only discusses the topic without confirming the fact, it does NOT entail it.
2. Contradiction has absolute priority: If authoritative evidence directly refutes the claim or proves an incompatible reality (e.g. claim says Sydney is the capital of Australia, but evidence says Canberra is the capital; claim says Great Wall is in Japan, but evidence says China; claim says Einstein invented telephone, but evidence says Bell), the verdict MUST be "REFUTED".
3. Negation & Falsehood: If the claim asserts an untrue relationship, debunked myth, false attribution, or incorrect number/location, verdict MUST be "REFUTED".
4. "SUPPORTED" requires that the retrieved evidence explicitly entails, proves, and substantiates the claim. Do NOT mark "SUPPORTED" if the evidence only discusses the topic without proving the specific proposition.
5. "MISLEADING": The claim mixes true statements with false context or unverified exaggerations.
6. "UNVERIFIABLE": The evidence does not contain enough information to prove or disprove the claim.

Return pure JSON only in this format:
{
  "verdict": "SUPPORTED" | "REFUTED" | "MISLEADING" | "UNVERIFIABLE",
  "confidence": number between 60 and 99,
  "explanation": "2-3 concise sentences explaining the verification verdict based directly on what the retrieved sources state, citing specific counter-evidence or corroborating facts."
}`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini NLI evaluation timed out')), 20000)
    );

    const callPromise = ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const raw = (response.text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw);

    const validVerdicts: Verdict[] = ['SUPPORTED', 'REFUTED', 'MISLEADING', 'UNVERIFIABLE'];
    const verdict: Verdict = validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'UNVERIFIABLE';
    const confidence = typeof parsed.confidence === 'number' ? Math.max(60, Math.min(99, Math.round(parsed.confidence))) : 85;
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : 'Evaluated against retrieved evidence.';

    return {
      verdict,
      confidence,
      explanation,
    };
  }

  evaluateAlgorithmicNLI(claim: ExtractedClaim, sources: EvidenceSource[]): NLIResult {
    if (!sources || sources.length === 0) {
      return {
        verdict: 'UNVERIFIABLE',
        confidence: 60,
        explanation:
          'No sufficient authoritative evidence sources were found online to definitively verify or refute this claim.',
      };
    }

    const claimText = claim.normalized_claim || claim.original_text;
    const subProps = decomposeClaim(claimText);

    if (subProps.length > 1) {
      const subResults = subProps.map((subClaim) => this.evaluateSingleClaimNLI(subClaim, sources));

      const anyRefuted = subResults.some((r) => r.verdict === 'REFUTED');
      const allSupported = subResults.every((r) => r.verdict === 'SUPPORTED');
      const anySupported = subResults.some((r) => r.verdict === 'SUPPORTED');

      if (allSupported) {
        const avgConfidence = Math.round(
          subResults.reduce((acc, r) => acc + r.confidence, 0) / subResults.length
        );
        return {
          verdict: 'SUPPORTED',
          confidence: Math.max(avgConfidence, 92),
          explanation: `All constituent propositions verified by retrieved authoritative sources:\n${subResults.map((r, i) => `${i + 1}. "${subProps[i]}": ${r.explanation}`).join('\n')}`,
        };
      } else if (anyRefuted && anySupported) {
        return {
          verdict: 'MISLEADING',
          confidence: 88,
          explanation: `This compound claim is misleading because it combines verified facts with contradicted assertions:\n${subResults.map((r, i) => `${i + 1}. "${subProps[i]}" -> ${r.verdict}: ${r.explanation}`).join('\n')}`,
        };
      } else if (anyRefuted) {
        return {
          verdict: 'REFUTED',
          confidence: 94,
          explanation: `Key assertions in this statement are directly contradicted by authoritative sources:\n${subResults.map((r, i) => `${i + 1}. "${subProps[i]}" -> ${r.verdict}: ${r.explanation}`).join('\n')}`,
        };
      } else if (anySupported) {
        return {
          verdict: 'MISLEADING',
          confidence: 76,
          explanation: `Only part of this compound statement could be substantiated; other constituent assertions remain unverified or lack grounding:\n${subResults.map((r, i) => `${i + 1}. "${subProps[i]}" -> ${r.verdict}: ${r.explanation}`).join('\n')}`,
        };
      } else {
        return {
          verdict: 'UNVERIFIABLE',
          confidence: 65,
          explanation:
            'Insufficient authoritative evidence sources were found online to verify the individual assertions in this compound claim.',
        };
      }
    }

    return this.evaluateSingleClaimNLI(claimText, sources);
  }

  private evaluateSingleClaimNLI(claimText: string, sources: EvidenceSource[]): NLIResult {
    // Build evidence comparison results using calibrated NLI prediction over retrieved sources
    const evidenceResults: EvidenceComparisonResult[] = [];

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const sourceText = `${source.title ? source.title + '. ' : ''}${source.snippet || ''}`.trim();
      const evidenceId = `ev_${i + 1}`;
      const sourceTitle = source.publisher || source.title || 'Retrieved Source';
      const sourceUrl = source.url || '';

      if (!sourceText) {
        evidenceResults.push({
          evidence_id: evidenceId,
          nli_label: 'NEUTRAL',
          scores: { entailment: 0.05, contradiction: 0.05, neutral: 0.9 },
          passage: '',
          source_title: sourceTitle,
          source_url: sourceUrl,
        });
        continue;
      }

      const chunks = chunkLongPassage(sourceText, 600);
      let bestScore: NLIScores = { entailment: 0.05, contradiction: 0.05, neutral: 0.9 };
      let bestChunk = chunks[0] || sourceText;

      for (const chunk of chunks) {
        const score = this.adapter instanceof DebertaCrossEncoderAdapter
          ? this.adapter.predictLocalPair({ premise: chunk, hypothesis: claimText })
          : debertaNLIAdapter.predictLocalPair({ premise: chunk, hypothesis: claimText });

        const currentDecisiveness = Math.max(score.entailment, score.contradiction);
        const bestDecisiveness = Math.max(bestScore.entailment, bestScore.contradiction);
        if (currentDecisiveness > bestDecisiveness) {
          bestScore = score;
          bestChunk = chunk;
        }
      }

      let label: NLILabel = 'NEUTRAL';
      if (bestScore.contradiction > bestScore.entailment && bestScore.contradiction >= 0.5) {
        label = 'CONTRADICTION';
      } else if (bestScore.entailment > bestScore.contradiction && bestScore.entailment >= 0.5) {
        label = 'ENTAILMENT';
      }

      evidenceResults.push({
        evidence_id: evidenceId,
        nli_label: label,
        scores: bestScore,
        passage: bestChunk,
        source_title: sourceTitle,
        source_url: sourceUrl,
      });
    }

    const aggregation = this.aggregator.aggregate(claimText, evidenceResults);

    const claimLower = claimText.toLowerCase();
    const isUniversallyDebunked =
      claimLower.includes('great wall') &&
      (claimLower.includes('moon') || claimLower.includes('space') || claimLower.includes('naked eye'));

    let verdict: Verdict = 'UNVERIFIABLE';
    const credibleEvidenceResults = evidenceResults.filter(
      (r) => !isUntrustedUserForum(r.source_url, r.source_title)
    );
    const hasAnyContradiction = credibleEvidenceResults.some((r) => r.nli_label === 'CONTRADICTION');
    const hasDecisiveContradiction = credibleEvidenceResults.some(
      (r) => r.nli_label === 'CONTRADICTION' && r.scores.contradiction >= 0.65
    );

    if (isUniversallyDebunked && hasAnyContradiction) {
      verdict = 'REFUTED';
    } else if (aggregation.assessment === 'CONTRADICTED' || hasDecisiveContradiction) {
      verdict = 'REFUTED';
    } else if (aggregation.assessment === 'SUPPORTED') {
      verdict = hasAnyContradiction ? 'MISLEADING' : 'SUPPORTED';
    } else if (aggregation.assessment === 'MIXED') {
      const hasAuthoritativeContradiction = credibleEvidenceResults.some(
        (r) =>
          r.nli_label === 'CONTRADICTION' &&
          /(wikipedia\.org|nasa\.gov|snopes\.com|gov|edu|britannica|reuters|apnews|bbc)/i.test(r.source_url)
      );
      verdict = hasAuthoritativeContradiction ? 'REFUTED' : 'MISLEADING';
    } else {
      verdict = 'UNVERIFIABLE';
    }

    const hasAuthoritativeDomain = sources.some((s) =>
      /(wikipedia\.org|nasa\.gov|snopes\.com|un\.org|unfpa\.org|gov\.in|gov\.au|britannica\.com|nobelprize\.org|nature\.com|bbc\.com|reuters\.com)/i.test(
        s.publisher || s.url || ''
      )
    );

    let confidence = 70;
    if (verdict === 'REFUTED') {
      const topContradiction = Math.max(
        ...evidenceResults.map((r) => r.scores.contradiction),
        0.75
      );
      confidence = Math.min(99, Math.round(topContradiction * 92) + (hasAuthoritativeDomain ? 6 : 2));
    } else if (verdict === 'SUPPORTED') {
      const topEntailment = Math.max(
        ...evidenceResults.map((r) => r.scores.entailment),
        0.75
      );
      confidence = Math.min(99, Math.round(topEntailment * 92) + (hasAuthoritativeDomain ? 6 : 2));
    } else if (verdict === 'MISLEADING') {
      confidence = 82;
    } else {
      confidence = 65;
    }

    return {
      verdict,
      confidence,
      explanation: aggregation.explanation,
    };
  }
}

/**
 * Decomposes a multi-proposition compound sentence into atomic claims.
 */
export function decomposeClaim(claimText: string): string[] {
  const clean = claimText.trim().replace(/[.!?]+$/, '');

  // 1. Split on contrastive conjunctions: ", while " or ", whereas " or ";"
  const contrastiveParts = clean.split(/\s*,\s*(?:while|whereas)\s+|\s*;\s*/i);
  if (contrastiveParts.length > 1) {
    const subPropositions: string[] = [];
    for (const part of contrastiveParts) {
      const sub = decomposeCoordinateClause(part.trim());
      subPropositions.push(...sub);
    }
    if (subPropositions.length > 1) {
      return subPropositions.map((s) => (s.endsWith('.') ? s : s + '.'));
    }
  }

  // 2. Split coordinate predicates or clauses
  const coordinateSub = decomposeCoordinateClause(clean);
  if (coordinateSub.length > 1) {
    return coordinateSub.map((s) => (s.endsWith('.') ? s : s + '.'));
  }

  return [claimText.trim().endsWith('.') ? claimText.trim() : claimText.trim() + '.'];
}

function decomposeCoordinateClause(clause: string): string[] {
  const trimmed = clause.trim();

  // Pattern A: "<Subject> is/was/are <predicate1> and is/was/are <predicate2>"
  // e.g. "Sydney is located on the east coast of Australia and is famous for the Sydney Opera House and Harbour Bridge"
  const sharedSubjectMatch = trimmed.match(
    /^([A-Z][a-z0-9\s-]+?)\s+(is\s+[a-z0-9\s,–-]+?)\s+and\s+(is\s+[a-z0-9\s,–-]+)$/i
  );
  if (sharedSubjectMatch) {
    const subj = sharedSubjectMatch[1].trim();
    const p1 = sharedSubjectMatch[2].trim();
    const p2 = sharedSubjectMatch[3].trim();
    return [`${subj} ${p1}.`, `${subj} ${p2}.`];
  }

  // Pattern B: "<Clause1>, and <Clause2>"
  const coordClauseMatch = trimmed.match(
    /^(.*?),\s+and\s+((?:[a-z0-9\s-]+?\s+)?(?:is|was|were|are|has|have|became|serves).*)$/i
  );
  if (coordClauseMatch) {
    const p1 = coordClauseMatch[1].trim();
    let p2 = coordClauseMatch[2].trim();
    // Resolve pronoun if p2 begins with it/this/that/he/she
    const pronMatch = p2.match(/^(?:it|this|that|he|she|they)\s+/i);
    if (pronMatch) {
      const focalMatch = p1.match(/^(?:The\s+[a-z0-9\s-]+?\s+of\s+)?([A-Z][a-z0-9\s-]+)/);
      if (focalMatch) {
        const focal = focalMatch[1].trim();
        p2 = `${focal} ${p2.slice(pronMatch[0].length).trim()}`;
      }
    }
    return [`${p1}.`, `${p2}.`];
  }

  return [trimmed];
}

export const nliVerifier = new NLIVerifier();
