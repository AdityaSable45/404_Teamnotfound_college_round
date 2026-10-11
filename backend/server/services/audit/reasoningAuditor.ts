import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import type { ExtractedClaim, VerifiedClaim } from '../contracts.js';
import type {
  ReasoningIssue,
  ReasoningIssueType,
  ReasoningSeverity,
  ReasoningAuditInput,
  ReasoningAuditSummary,
  ReasoningAuditResult,
  ReasoningProvider,
  ReasoningAssessment,
} from './reasoningTypes.js';
import {
  REASONING_AUDIT_SYSTEM_PROMPT,
  buildReasoningUserPrompt,
} from './reasoningPrompt.js';

// ============================================================================
// 1. Deterministic Rule-Based Reasoning Provider (Conservative Fallback)
// ============================================================================

export class RuleBasedReasoningProvider implements ReasoningProvider {
  readonly name = 'rule-based-fallback';

  async auditReasoning(input: ReasoningAuditInput): Promise<ReasoningIssue[]> {
    const issues: ReasoningIssue[] = [];
    const claims = input.claims || [];
    const answer = input.answer || claims.map((c) => c.original_text).join(' ');

    if (claims.length === 0) {
      return [];
    }

    // 1. Check for Internal Contradictions between claims
    const contradictionIssues = this.detectInternalContradictions(claims);
    issues.push(...contradictionIssues);

    // 2. Check for Unsupported Conclusions (Leaps from premises to absolute conclusions)
    const conclusionIssues = this.detectUnsupportedConclusions(claims, answer);
    issues.push(...conclusionIssues);

    // 3. Check for Unsupported Causality (Correlation -> Causation leap)
    const causalityIssues = this.detectUnsupportedCausality(claims, answer);
    issues.push(...causalityIssues);

    // 4. Check for Invalid Comparisons / False Equivalence
    const comparisonIssues = this.detectInvalidComparisons(claims, answer);
    issues.push(...comparisonIssues);

    return issues;
  }

  /**
   * Detects mutually incompatible claims within the same answer.
   */
  private detectInternalContradictions(claims: ExtractedClaim[]): ReasoningIssue[] {
    const issues: ReasoningIssue[] = [];

    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const c1 = claims[i];
        const c2 = claims[j];

        // Check A: Numerical / Metric contradictions on the same entity
        const numConflict = this.checkNumericalContradiction(c1, c2);
        if (numConflict) {
          issues.push({
            id: `issue_contradiction_${i + 1}_${j + 1}`,
            type: 'INTERNAL_CONTRADICTION',
            severity: 'HIGH',
            claimIds: [c1.id, c2.id],
            premiseIds: [c1.id],
            conclusionId: c2.id,
            explanation: numConflict,
            confidence: 94,
          });
          continue;
        }

        // Check B: Direct polar affirmation vs negation on identical subject & predicate
        const polarConflict = this.checkPolarNegationContradiction(c1, c2);
        if (polarConflict) {
          issues.push({
            id: `issue_polar_${i + 1}_${j + 1}`,
            type: 'INTERNAL_CONTRADICTION',
            severity: 'HIGH',
            claimIds: [c1.id, c2.id],
            premiseIds: [c1.id],
            conclusionId: c2.id,
            explanation: polarConflict,
            confidence: 90,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Checks if two claims make contradictory numerical statements about the same entity.
   */
  private checkNumericalContradiction(c1: ExtractedClaim, c2: ExtractedClaim): string | null {
    const text1 = c1.normalized_claim || c1.original_text;
    const text2 = c2.normalized_claim || c2.original_text;

    // Detect shared subject entities (e.g., Earth, India, population, age, temperature)
    const subject1 = this.extractMainSubject(text1);
    const subject2 = this.extractMainSubject(text2);

    if (!subject1 || !subject2 || subject1 !== subject2) {
      return null;
    }

    // Parse numerical magnitudes with scales (billion, million, thousand)
    const parseNumber = (text: string) => {
      const match = text.match(/(\d+(?:\.\d+)?)\s*(billion|million|thousand|trillion)?/i);
      if (!match) return null;
      let val = parseFloat(match[1]);
      const scale = (match[2] || '').toLowerCase();
      if (scale === 'billion') val *= 1_000_000_000;
      else if (scale === 'million') val *= 1_000_000;
      else if (scale === 'thousand') val *= 1_000;
      else if (scale === 'trillion') val *= 1_000_000_000_000;
      return val;
    };

    const val1 = parseNumber(text1);
    const val2 = parseNumber(text2);

    if (val1 === null || val2 === null) {
      return null;
    }

    const isGreaterThan = (t: string) => /\b(more than|greater than|exceeds|over|above|at least)\b/i.test(t);
    const isLessThan = (t: string) => /\b(less than|fewer than|under|below|at most)\b/i.test(t);
    const isApproxOrEqual = (t: string) => /\b(is|was|approximately|about|reached|stands at)\b/i.test(t);

    // Case 1: val1 is approx/greater X, and val2 says < Y where X > Y
    // Example: "Earth is 4.5 billion years old" vs "Earth is less than 1 billion years old"
    if ((isApproxOrEqual(text1) || isGreaterThan(text1)) && isLessThan(text2) && val1 > val2) {
      return `The answer makes mutually inconsistent assertions regarding ${subject1}: one claim asserts approximately or more than ${this.formatVal(val1)}, while another asserts less than ${this.formatVal(val2)}.`;
    }

    if ((isApproxOrEqual(text2) || isGreaterThan(text2)) && isLessThan(text1) && val2 > val1) {
      return `The answer makes mutually inconsistent assertions regarding ${subject1}: one claim asserts less than ${this.formatVal(val1)}, while another asserts approximately or more than ${this.formatVal(val2)}.`;
    }

    // Case 2: > X vs < Y where X >= Y (e.g. > 1B vs < 500M)
    if (isGreaterThan(text1) && isLessThan(text2) && val1 >= val2) {
      return `The answer makes mutually inconsistent assertions regarding ${subject1}: one claim asserts more than ${this.formatVal(val1)}, while another asserts fewer than ${this.formatVal(val2)}.`;
    }
    if (isGreaterThan(text2) && isLessThan(text1) && val2 >= val1) {
      return `The answer makes mutually inconsistent assertions regarding ${subject1}: one claim asserts fewer than ${this.formatVal(val1)}, while another asserts more than ${this.formatVal(val2)}.`;
    }

    return null;
  }

  private formatVal(v: number): string {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} billion`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} million`;
    return v.toString();
  }

  private checkPolarNegationContradiction(c1: ExtractedClaim, c2: ExtractedClaim): string | null {
    const t1 = (c1.normalized_claim || c1.original_text).toLowerCase();
    const t2 = (c2.normalized_claim || c2.original_text).toLowerCase();

    const negRegex = /\b(not|never|no|cannot|neither|nor|fails to|impossible)\b/i;
    const hasNeg1 = negRegex.test(t1);
    const hasNeg2 = negRegex.test(t2);

    if (hasNeg1 === hasNeg2) return null; // Both affirmative or both negative

    const subj1 = this.extractMainSubject(t1);
    const subj2 = this.extractMainSubject(t2);
    if (!subj1 || !subj2 || subj1 !== subj2) return null;

    // Check overlap of content words
    const words1 = t1.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !negRegex.test(w));
    const words2 = t2.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !negRegex.test(w));

    const intersection = words1.filter((w) => words2.includes(w));
    if (intersection.length >= 3 && intersection.length / Math.min(words1.length, words2.length) >= 0.7) {
      return `Direct polar contradiction on ${subj1}: one claim asserts the affirmative while the other asserts a direct negation.`;
    }

    return null;
  }

  private extractMainSubject(text: string): string | null {
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const knownSubjects = ['earth', 'india', 'moon', 'sun', 'france', 'japan', 'population', 'paris', 'tokyo'];
    for (const subj of knownSubjects) {
      if (new RegExp(`\\b${subj}\\b`, 'i').test(clean)) {
        return subj;
      }
    }
    // Extract first significant noun phrase token
    const tokens = clean.split(/\s+/).filter((w) => w.length > 2 && !['the', 'this', 'that', 'with', 'from', 'have', 'were', 'when', 'what', 'approx', 'approximately'].includes(w));
    return tokens[0] || null;
  }

  /**
   * Detects cases where a conclusion leaps beyond premises to make absolute guarantees.
   */
  private detectUnsupportedConclusions(claims: ExtractedClaim[], rawAnswer: string): ReasoningIssue[] {
    const issues: ReasoningIssue[] = [];

    const conclusionRegex = /\b(therefore|thus|hence|consequently|as a result|so it follows that|guarantees that|which proves that)\b/i;
    const absoluteGuaranteeRegex = /\b(guarantees?|guaranteed|perfect health|will never|never develop|always prevents?|100%|completely eliminates?|impossible to fail)\b/i;
    const premiseBenefitRegex = /\b(improves?|helps?|reduces?|associated with|form of exercise|benefit|beneficial|can aid)\b/i;

    claims.forEach((claim, idx) => {
      const claimText = claim.original_text;
      const isConclusion = conclusionRegex.test(claimText) || (idx > 0 && idx === claims.length - 1 && absoluteGuaranteeRegex.test(claimText));
      const hasAbsoluteLeap = absoluteGuaranteeRegex.test(claimText);

      if (isConclusion && hasAbsoluteLeap) {
        // Collect preceding claims as premises
        const premiseClaims = claims.slice(0, idx).filter((c) => premiseBenefitRegex.test(c.original_text) || c.original_text.length > 5);

        if (premiseClaims.length > 0) {
          issues.push({
            id: `issue_unsupported_conclusion_${claim.id}`,
            type: 'UNSUPPORTED_CONCLUSION',
            severity: 'HIGH',
            claimIds: [...premiseClaims.map((p) => p.id), claim.id],
            premiseIds: premiseClaims.map((p) => p.id),
            conclusionId: claim.id,
            explanation:
              'The conclusion is stronger than what the preceding claims establish. The available premises establish benefits or classification, but do not logically guarantee this absolute conclusion.',
            confidence: 88,
          });
        }
      }
    });

    // Also check rawAnswer if claims were split without preserving conclusion marker
    if (issues.length === 0 && conclusionRegex.test(rawAnswer) && absoluteGuaranteeRegex.test(rawAnswer)) {
      const lastClaim = claims[claims.length - 1];
      const earlierClaims = claims.slice(0, -1);
      if (lastClaim && earlierClaims.length > 0 && (absoluteGuaranteeRegex.test(lastClaim.original_text) || conclusionRegex.test(lastClaim.original_text))) {
        issues.push({
          id: `issue_unsupported_conclusion_${lastClaim.id}`,
          type: 'UNSUPPORTED_CONCLUSION',
          severity: 'HIGH',
          claimIds: claims.map((c) => c.id),
          premiseIds: earlierClaims.map((c) => c.id),
          conclusionId: lastClaim.id,
          explanation:
            'The conclusion is stronger than what the preceding claims establish. The available premises establish benefits or classification, but do not logically guarantee this absolute conclusion.',
          confidence: 87,
        });
      }
    }

    return issues;
  }

  /**
   * Detects cases where correlation or association is elevated to direct causation.
   */
  private detectUnsupportedCausality(claims: ExtractedClaim[], rawAnswer: string): ReasoningIssue[] {
    const issues: ReasoningIssue[] = [];

    const correlationRegex = /\b(report(s|ed)? (higher|lower|more|less)|associated with|correlated with|linked to|linked with|tend to have|show (higher|lower) rates|co-occurs?)\b/i;
    const directCausationRegex = /\b(causes?|causing|is the cause of|directly causes|leads to the development of|results in)\b/i;

    claims.forEach((claim, idx) => {
      const claimText = claim.original_text;

      // Pattern 1: Separate claims where premise has correlation and subsequent claim asserts causation
      if (directCausationRegex.test(claimText)) {
        const precedingCorrelation = claims.slice(0, idx).find((p) => correlationRegex.test(p.original_text));
        if (precedingCorrelation) {
          issues.push({
            id: `issue_unsupported_causality_${claim.id}`,
            type: 'UNSUPPORTED_CAUSALITY',
            severity: 'HIGH',
            claimIds: [precedingCorrelation.id, claim.id],
            premiseIds: [precedingCorrelation.id],
            conclusionId: claim.id,
            explanation:
              'The answer asserts causation but the available premise/evidence only establishes correlation or observational association. Correlation does not imply direct causation.',
            confidence: 85,
          });
        }
      }

      // Pattern 2: Single claim with correlation followed immediately by causal leap ("...report higher stress, therefore coffee causes...")
      if (correlationRegex.test(claimText) && directCausationRegex.test(claimText)) {
        issues.push({
          id: `issue_unsupported_causality_${claim.id}`,
          type: 'UNSUPPORTED_CAUSALITY',
          severity: 'HIGH',
          claimIds: [claim.id],
          premiseIds: [claim.id],
          conclusionId: claim.id,
          explanation:
            'The statement asserts a causal relationship based merely on observational correlation. Correlation does not establish causation without controlled intervention or causal mechanism.',
          confidence: 85,
        });
      }
    });

    // Also check rawAnswer if prompt text was split differently
    if (issues.length === 0 && correlationRegex.test(rawAnswer) && directCausationRegex.test(rawAnswer) && /\b(therefore|thus|hence)\b/i.test(rawAnswer)) {
      const lastClaim = claims[claims.length - 1];
      const firstClaim = claims[0];
      if (lastClaim && firstClaim && lastClaim.id !== firstClaim.id) {
        issues.push({
          id: `issue_unsupported_causality_${lastClaim.id}`,
          type: 'UNSUPPORTED_CAUSALITY',
          severity: 'HIGH',
          claimIds: [firstClaim.id, lastClaim.id],
          premiseIds: [firstClaim.id],
          conclusionId: lastClaim.id,
          explanation:
            'The answer asserts causation but the available premise/evidence only establishes correlation or observational association.',
          confidence: 84,
        });
      }
    }

    return issues;
  }

  /**
   * Detects false equivalence or invalid comparisons.
   */
  private detectInvalidComparisons(claims: ExtractedClaim[], rawAnswer: string): ReasoningIssue[] {
    const issues: ReasoningIssue[] = [];

    const shareTraitRegex = /\b(share (one|a single) characteristic|have (one|a single) similarity|both share|have in common)\b/i;
    const equivalenceRegex = /\b(are equivalent|are identical|same cause|same outcome|are essentially the same)\b/i;

    claims.forEach((claim) => {
      const claimText = claim.original_text;
      if (shareTraitRegex.test(claimText) && equivalenceRegex.test(claimText)) {
        issues.push({
          id: `issue_invalid_comparison_${claim.id}`,
          type: 'INVALID_COMPARISON',
          severity: 'MEDIUM',
          claimIds: [claim.id],
          conclusionId: claim.id,
          explanation:
            'The statement concludes broad equivalence based solely on a single shared characteristic, which constitutes an invalid comparison or false equivalence.',
          confidence: 80,
        });
      }
    });

    if (issues.length === 0 && shareTraitRegex.test(rawAnswer) && equivalenceRegex.test(rawAnswer)) {
      issues.push({
        id: `issue_invalid_comparison_answer`,
        type: 'INVALID_COMPARISON',
        severity: 'MEDIUM',
        claimIds: claims.map((c) => c.id),
        explanation:
          'The answer asserts equivalence based solely on a single shared characteristic, which constitutes an invalid comparison.',
        confidence: 80,
      });
    }

    return issues;
  }
}

// ============================================================================
// 2. Gemini LLM Reasoning Provider
// ============================================================================

export class GeminiReasoningProvider implements ReasoningProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY is not configured');
    this.ai = new GoogleGenAI({ apiKey: key });
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  async auditReasoning(input: ReasoningAuditInput): Promise<ReasoningIssue[]> {
    const userPrompt = buildReasoningUserPrompt(input);
    logger.info('Calling Gemini API for reasoning consistency audit', { model: this.modelName });

    const timeoutMs = 25000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini reasoning audit timed out')), timeoutMs)
    );

    const callPromise = this.ai.models.generateContent({
      model: this.modelName,
      contents: userPrompt,
      config: {
        systemInstruction: REASONING_AUDIT_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const text = response.text;
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.issues)) {
        return parsed.issues;
      }
      return [];
    } catch {
      return [];
    }
  }
}

// ============================================================================
// 3. OpenAI LLM Reasoning Provider
// ============================================================================

export class OpenAIReasoningProvider implements ReasoningProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName = 'gpt-4o-mini') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not configured');
    this.client = new OpenAI({ apiKey: key, timeout: 20000 });
    this.modelName = modelName;
  }

  async auditReasoning(input: ReasoningAuditInput): Promise<ReasoningIssue[]> {
    const userPrompt = buildReasoningUserPrompt(input);
    logger.info('Calling OpenAI API for reasoning consistency audit', { model: this.modelName });

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: [
        { role: 'system', content: REASONING_AUDIT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.issues)) {
        return parsed.issues;
      }
      return [];
    } catch {
      return [];
    }
  }
}

// ============================================================================
// 4. Main Reasoning Auditor Service
// ============================================================================

export interface ReasoningAuditorOptions {
  provider?: ReasoningProvider;
  providerName?: 'gemini' | 'openai' | 'fallback';
}

export class ReasoningAuditor {
  private defaultProvider: ReasoningProvider | null = null;
  private fallbackProvider: RuleBasedReasoningProvider;
  private failedProviders = new Set<string>();

  constructor(customProvider?: ReasoningProvider) {
    this.fallbackProvider = new RuleBasedReasoningProvider();
    if (customProvider) {
      this.defaultProvider = customProvider;
    }
  }

  getProvider(options?: ReasoningAuditorOptions): ReasoningProvider {
    dotenv.config({ override: true });

    if (options?.provider) return options.provider;
    if (this.defaultProvider) return this.defaultProvider;

    const preferred = (options?.providerName || process.env.LLM_PROVIDER || '').trim().toLowerCase();

    if (preferred === 'fallback') {
      return this.fallbackProvider;
    }

    if (preferred === 'openai' && process.env.OPENAI_API_KEY && !this.failedProviders.has('openai')) {
      return new OpenAIReasoningProvider();
    }

    if (preferred === 'gemini' && process.env.GEMINI_API_KEY && !this.failedProviders.has('gemini')) {
      return new GeminiReasoningProvider();
    }

    if (process.env.GEMINI_API_KEY && !this.failedProviders.has('gemini')) {
      return new GeminiReasoningProvider();
    }

    if (process.env.OPENAI_API_KEY && !this.failedProviders.has('openai')) {
      return new OpenAIReasoningProvider();
    }

    return this.fallbackProvider;
  }

  /**
   * Performs reasoning consistency audit across claims and original answer.
   */
  async audit(
    input: ReasoningAuditInput,
    options?: ReasoningAuditorOptions
  ): Promise<ReasoningAuditResult> {
    const claims = input.claims || [];
    const answer = input.answer || claims.map((c) => c.original_text).join(' ');
    const activeProvider = this.getProvider(options);

    logger.info(`ReasoningAuditor: Auditing reasoning consistency across ${claims.length} claims using provider '${activeProvider.name}'`);

    let issues: ReasoningIssue[] = [];

    try {
      issues = await activeProvider.auditReasoning({
        answer,
        claims,
        verifiedClaims: input.verifiedClaims,
      });

      // If active provider is LLM and returned 0 issues, run conservative fallback check to ensure high-confidence issues are not missed
      if (issues.length === 0 && activeProvider.name !== this.fallbackProvider.name) {
        const fallbackIssues = await this.fallbackProvider.auditReasoning({
          answer,
          claims,
          verifiedClaims: input.verifiedClaims,
        });
        if (fallbackIssues.length > 0) {
          issues = fallbackIssues;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('API key') || msg.includes('unauthorized')) {
        this.failedProviders.add(activeProvider.name);
      }
      logger.warn(`ReasoningAuditor: Provider '${activeProvider.name}' failed: ${msg}. Falling back to deterministic rule analyzer.`);
      issues = await this.fallbackProvider.auditReasoning({
        answer,
        claims,
        verifiedClaims: input.verifiedClaims,
      });
    }

    // Synthesize summary
    const totalIssues = issues.length;
    const byType: Record<ReasoningIssueType, number> = {
      INTERNAL_CONTRADICTION: 0,
      UNSUPPORTED_CONCLUSION: 0,
      UNSUPPORTED_CAUSALITY: 0,
      INVALID_COMPARISON: 0,
    };

    let penalty = 0;
    for (const issue of issues) {
      if (byType[issue.type] !== undefined) {
        byType[issue.type]++;
      }
      if (issue.severity === 'HIGH') penalty += 25;
      else if (issue.severity === 'MEDIUM') penalty += 15;
      else penalty += 8;
    }

    const reasoningScore = Math.max(0, 100 - penalty);
    let assessment: ReasoningAssessment = 'CONSISTENT';
    if (reasoningScore < 60 || byType.INTERNAL_CONTRADICTION > 0) {
      assessment = 'INCONSISTENT';
    } else if (reasoningScore < 90 || totalIssues > 0) {
      assessment = 'NEEDS_REVIEW';
    }

    let explanation = 'No internal contradictions, deductive leaps, or invalid causal claims were detected.';
    if (totalIssues > 0) {
      explanation = `Detected ${totalIssues} reasoning consistency issue(s): ${issues.map((i) => i.type.replace(/_/g, ' ')).join(', ')}.`;
    }

    const summary: ReasoningAuditSummary = {
      totalIssues,
      byType,
      hasContradictions: byType.INTERNAL_CONTRADICTION > 0,
      hasUnsupportedConclusions: byType.UNSUPPORTED_CONCLUSION > 0,
      hasUnsupportedCausality: byType.UNSUPPORTED_CAUSALITY > 0,
      hasInvalidComparisons: byType.INVALID_COMPARISON > 0,
      reasoningScore,
      assessment,
    };

    return {
      issues,
      summary,
      explanation,
    };
  }
}

export const reasoningAuditor = new ReasoningAuditor();
