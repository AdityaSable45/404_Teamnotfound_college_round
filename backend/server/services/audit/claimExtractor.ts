import dotenv from 'dotenv';
import { ClaimExtractionResponse, ExtractedClaim } from '../contracts.js';
import { LLMProvider } from './llm/types.js';
import { GeminiProvider } from './llm/gemini.js';
import { OpenAIProvider } from './llm/openai.js';
import { FallbackNLPProvider } from './llm/fallback.js';
import { llmOutputSchema } from '../../validators/claimValidator.js';
import { logger } from '../../utils/logger.js';
import { languageDetector } from './languageDetector.js';
import { uncertaintyAnalyzer } from './uncertaintyAnalyzer.js';
import { temporalVerifier } from './temporalVerifier.js';
import { dependencyAnalyzer } from './dependencyAnalyzer.js';

export interface ExtractionOptions {
  provider?: LLMProvider;
  providerName?: 'gemini' | 'openai' | 'fallback';
}
export const ExtractionOptions = {};

export class ClaimExtractionService {
  private defaultProvider: LLMProvider | null = null;

  constructor(customProvider?: LLMProvider) {
    if (customProvider) {
      this.defaultProvider = customProvider;
    }
  }

  getProvider(options?: ExtractionOptions): LLMProvider {
    dotenv.config({ override: true });

    if (options?.provider) {
      return options.provider;
    }

    if (this.defaultProvider) {
      return this.defaultProvider;
    }

    const preferred = (options?.providerName || process.env.LLM_PROVIDER || '').trim().toLowerCase();

    if (preferred === 'fallback') {
      return new FallbackNLPProvider();
    }

    if (preferred === 'openai') {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured in environment variables');
      }
      return new OpenAIProvider();
    }

    if (preferred === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured in environment variables');
      }
      return new GeminiProvider();
    }

    // Auto-detect based on available keys
    if (process.env.GEMINI_API_KEY) {
      return new GeminiProvider();
    }

    if (process.env.OPENAI_API_KEY) {
      return new OpenAIProvider();
    }

    logger.info('No LLM API keys configured. Using Fallback NLP Claim Extractor.');
    return new FallbackNLPProvider();
  }

  async extractClaims(
    text: string,
    options?: ExtractionOptions
  ): Promise<ClaimExtractionResponse> {
    const startTime = Date.now();
    const provider = this.getProvider(options);

    logger.info('Starting claim extraction', {
      provider: provider.name,
      inputLength: text.length,
    });

    let rawResponse: string;
    let effectiveProviderName = provider.name;

    try {
      rawResponse = await provider.extractClaims(text);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      const isUpstreamAvailabilityIssue =
        provider.name !== 'fallback' &&
        !this.defaultProvider &&
        (errMsg.includes('503') ||
          errMsg.includes('high demand') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('timed out') ||
          errMsg.includes('429') ||
          errMsg.includes('404') ||
          errMsg.includes('NOT_FOUND'));

      if (isUpstreamAvailabilityIssue) {
        logger.warn(
          `Upstream AI model '${provider.name}' is unavailable (${errMsg}). Automatically switching to Fallback NLP Engine.`
        );
        const fallbackProvider = new FallbackNLPProvider();
        rawResponse = await fallbackProvider.extractClaims(text);
        effectiveProviderName = `fallback (auto-switched: ${provider.name} temporarily busy)`;
      } else {
        throw err;
      }
    }

    const cleaned = this.cleanJsonString(rawResponse);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (parseError) {
      logger.error('Failed to parse JSON response from extraction model', {
        provider: effectiveProviderName,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      throw new Error('Malformed model response: Failed to parse extraction output as valid JSON');
    }

    const validationResult = llmOutputSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      logger.error('Model response failed schema validation', {
        errors: validationResult.error.issues,
      });
      throw new Error(
        `Invalid model response format: ${validationResult.error.issues.map((e) => e.message).join(', ')}`
      );
    }

    const langResult = languageDetector.detectLanguage(text);
    let searchCursor = 0;

    const enrichedClaims: ExtractedClaim[] = validationResult.data.claims.map((claim, index) => {
      const id = claim.id || `claim_${index + 1}`;
      const needle = claim.original_text.trim();

      // Feature 3: Error localization offsets
      let offset_start: number | undefined = undefined;
      let offset_end: number | undefined = undefined;

      const pos = text.indexOf(needle, searchCursor);
      if (pos !== -1) {
        offset_start = pos;
        offset_end = pos + needle.length;
        searchCursor = offset_end;
      } else {
        const fallbackPos = text.indexOf(needle);
        if (fallbackPos !== -1) {
          offset_start = fallbackPos;
          offset_end = fallbackPos + needle.length;
        }
      }

      // Feature 5: Uncertainty analysis
      const uncertainty = uncertaintyAnalyzer.analyzeClaim(claim.original_text);

      // Feature 11: Temporal verification context
      const temporalContext = temporalVerifier.extractTemporalContext(claim.original_text);

      // Feature 1: Entities & Relations extraction (generalized)
      const entities: string[] = [];
      const entityMatches = claim.normalized_claim.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*|\d+(?:[\.,]\d+)?)\b/g);
      if (entityMatches) {
        entities.push(...Array.from(new Set(entityMatches)).slice(0, 4));
      }

      const relations: string[] = [];
      const relationMatches = claim.normalized_claim.match(/\b(is|was|are|were|has|have|had|became|founded|built|located\s+in|capital\s+of|largest\s+city)\b/gi);
      if (relationMatches) {
        relations.push(...Array.from(new Set(relationMatches)).slice(0, 3));
      }

      return {
        id,
        original_text: claim.original_text,
        normalized_claim: claim.normalized_claim,
        claim_type: claim.claim_type,
        check_worthy: claim.check_worthy,
        reason: claim.reason,
        offset_start,
        offset_end,
        language: langResult.language,
        entities,
        relations,
        temporal_context: temporalContext,
        uncertainty,
      };
    });

    // Feature 14: Dependency analysis
    const dependencyNodes = dependencyAnalyzer.analyzeDependencies(enrichedClaims);
    const validatedClaims = enrichedClaims.map((c) => {
      const dep = dependencyNodes.find((d) => d.claimId === c.id);
      return {
        ...c,
        depends_on: dep?.dependsOnClaimIds || [],
      };
    });

    const elapsed = Date.now() - startTime;

    logger.info('Claim extraction completed successfully', {
      totalClaims: validatedClaims.length,
      elapsedMs: elapsed,
      provider: effectiveProviderName,
    });

    return {
      claims: validatedClaims,
      total_claims: validatedClaims.length,
      detected_language: langResult.language,
      metadata: {
        processing_time_ms: elapsed,
        provider: effectiveProviderName,
      },
    };
  }

  private cleanJsonString(str: string): string {
    let result = str.trim();
    if (result.startsWith('```')) {
      result = result.replace(/^```(?:json)?\s*/i, '');
      result = result.replace(/\s*```$/, '');
    }
    return result.trim();
  }
}

export const claimExtractorService = new ClaimExtractionService();
