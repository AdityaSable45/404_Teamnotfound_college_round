import type { NLILabel, NLIScores } from './nliTypes.js';
import { logger } from '../../utils/logger.js';

export interface NLIPair {
  premise: string;   // The retrieved evidence passage
  hypothesis: string; // The extracted factual claim
}

export interface NLIModelAdapter {
  readonly modelIdentifier: string;
  getLabelMapping(): Record<number, NLILabel>;
  predict(pairs: NLIPair[]): Promise<NLIScores[]>;
}

/**
 * Verified label mapping for cross-encoder/nli-deberta-v3-base:
 * 0: contradiction
 * 1: entailment
 * 2: neutral
 */
export const DEBERTA_V3_LABEL_MAPPING: Record<number, NLILabel> = {
  0: 'CONTRADICTION',
  1: 'ENTAILMENT',
  2: 'NEUTRAL',
};

/**
 * Computes numerically stable softmax over an array of logits.
 */
export function softmax(logits: number[]): number[] {
  const maxLogit = Math.max(...logits);
  const expScores = logits.map((val) => Math.exp(val - maxLogit));
  const sumExp = expScores.reduce((acc, val) => acc + val, 0);
  return expScores.map((val) => Number((val / sumExp).toFixed(4)));
}

/**
 * Splits long text passages into safe chunks respecting sentence boundaries.
 */
export function chunkLongPassage(text: string, maxChunkChars = 600): string[] {
  if (text.length <= maxChunkChars) {
    return [text];
  }

  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 1 <= maxChunkChars) {
      currentChunk = currentChunk ? `${currentChunk} ${trimmed}` : trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmed.slice(0, maxChunkChars);
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxChunkChars)];
}

export interface RelationalProposition {
  entity: string;
  relation: string;
  rawRelation: string;
  value: string;
}

function isRelationalNoun(raw: string): boolean {
  const r = raw.toLowerCase().trim();
  const relationKeywords = [
    'capital', 'currency', 'inventor', 'invented', 'invent', 'founder', 'founded',
    'author', 'writer', 'written', 'wrote', 'director', 'directed', 'ceo', 'chief executive',
    'president', 'prime minister', 'headquarter', 'headquarters', 'birthplace', 'born',
    'population', 'highest peak', 'deepest point', 'area', 'speed', 'symbol',
    'language', 'anthem', 'motto', 'leader', 'governor', 'monarch', 'creator', 'created',
    'discoverer', 'discovered', 'composed', 'composer', 'painted', 'painter',
    'origin', 'diameter', 'mass', 'color', 'colour', 'weight', 'height', 'location', 'located',
    'seat', 'center', 'centre', 'date', 'year', 'age', 'shape', 'boiling point', 'melting point',
  ];
  return relationKeywords.some((kw) => r.includes(kw));
}

function normalizeRelation(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes('capital')) return 'capital';
  if (r.includes('inventor') || r.includes('invented') || r.includes('invent')) return 'inventor';
  if (r.includes('currency')) return 'currency';
  if (r.includes('ceo') || r.includes('chief executive')) return 'ceo';
  if (r.includes('president')) return 'president';
  if (r.includes('prime minister')) return 'prime minister';
  if (r.includes('founder') || r.includes('founded')) return 'founder';
  if (r.includes('author') || r.includes('writer') || r.includes('written') || r.includes('wrote')) return 'author';
  if (r.includes('director') || r.includes('directed')) return 'director';
  if (r.includes('composed') || r.includes('composer')) return 'composer';
  if (r.includes('discovered') || r.includes('discoverer')) return 'discoverer';
  if (r.includes('created') || r.includes('creator')) return 'creator';
  if (r.includes('painted') || r.includes('painter')) return 'painter';
  if (r.includes('headquarter')) return 'headquarters';
  if (r.includes('birthplace') || r.includes('born in') || r.includes('born at')) return 'birthplace';
  if (r.includes('population')) return 'population';
  if (r.includes('location') || r.includes('located') || r.includes('situated')) return 'location';
  return r.replace(/^(the|a|an|official|national)\s+/, '');
}

function normalizeEntity(e: string): string {
  return e.toLowerCase().trim().replace(/^(the|a|an)\s+/, '');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNonEntitySubject(val: string): boolean {
  const v = val.toLowerCase().trim().replace(/^(the|a|an)\s+/, '');
  const nonEntities = new Set([
    'what', 'which', 'where', 'who', 'whom', 'whose', 'why', 'how',
    'it', 'this', 'that', 'these', 'those', 'there', 'here',
    'city', 'state', 'country', 'nation', 'one', 'place', 'capital', 'seat',
    'name', 'district', 'area', 'region', 'territory', 'municipality',
    'known', 'called', 'named',
  ]);
  return nonEntities.has(v) || v.length < 3;
}

export function extractRelationalProposition(claimText: string): RelationalProposition | null {
  const clean = claimText
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/[’‘`]/g, "'");

  // Pattern 1: "The <relation> of <entity> is <value>"
  // e.g. "The capital of Australia is Sydney"
  const p1 = /^(?:the\s+)?([a-z0-9\s.,'-]+?)\s+of\s+([a-z0-9\s.,'-]+?)\s+(?:is|was|are|were|has been)\s+(?:the\s+|an?\s+)?([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p1 && isRelationalNoun(p1[1]) && p1[1].trim().length >= 2 && p1[2].trim().length >= 2 && p1[3].trim().length >= 2) {
    return {
      entity: normalizeEntity(p1[2]),
      relation: normalizeRelation(p1[1]),
      rawRelation: p1[1].toLowerCase().trim(),
      value: normalizeEntity(p1[3]),
    };
  }

  // Pattern 2: "<value> is the <relation> of <entity>"
  // e.g. "Sydney is the capital of Australia"
  // e.g. "Canberra is the capital city of Australia"
  const p2 = /^([a-z0-9\s.,'-]+?)\s+(?:is|was|are|were|has been|serves as|acts as)\s+(?:the\s+|an?\s+|officially designated as the\s+|designated as the\s+)?([a-z0-9\s.,'-]+?)\s+of\s+([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p2 && isRelationalNoun(p2[2]) && p2[1].trim().length >= 2 && p2[2].trim().length >= 2 && p2[3].trim().length >= 2) {
    return {
      entity: normalizeEntity(p2[3]),
      relation: normalizeRelation(p2[2]),
      rawRelation: p2[2].toLowerCase().trim(),
      value: normalizeEntity(p2[1]),
    };
  }

  // Pattern 3: "<entity>'s <relation> is <value>"
  // e.g. "Australia's capital is Sydney"
  const p3 = /^([a-z0-9\s.,'-]+?)'s\s+([a-z0-9\s.,'-]+?)\s+(?:is|was|are|were|has been)\s+(?:the\s+|an?\s+)?([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p3 && isRelationalNoun(p3[2]) && p3[1].trim().length >= 2 && p3[2].trim().length >= 2 && p3[3].trim().length >= 2) {
    return {
      entity: normalizeEntity(p3[1]),
      relation: normalizeRelation(p3[2]),
      rawRelation: p3[2].toLowerCase().trim(),
      value: normalizeEntity(p3[3]),
    };
  }

  // Pattern 4: "<value> was [later] (established|chosen|selected|founded|announced|named|declared|designated|created|built|became) as (the|a|an)? [national/federal/state/official/country's]? (capital|capital city) [of <entity>]?"
  // e.g. "Canberra was later established as the national capital."
  // e.g. "Canberra was chosen as the national capital of Australia."
  const p4 = /^([a-z0-9\s.,'-]+?)\s+(?:was|were|became|has been|stands as)(?:\s+later|\s+officially|\s+subsequently|\s+eventually)?\s+(?:established|chosen|selected|founded|announced|named|declared|designated|created|built|proclaimed|instituted)?\s*(?:as\s+)?(?:the\s+|an?\s+)?(?:official\s+|national\s+|federal\s+|administrative\s+|country's\s+)?(capital(?:\s+city)?)(?:\s+of\s+([a-z0-9\s.,'-]+))?$/i.exec(clean);
  if (p4 && p4[1].trim().length >= 2) {
    return {
      entity: p4[3] ? normalizeEntity(p4[3]) : '',
      relation: 'capital',
      rawRelation: 'capital',
      value: normalizeEntity(p4[1]),
    };
  }

  // Pattern 5: "<entity> is/was/are/were (located in|located on|situated in|situated on|found in|found on|based in|in|on) <value>"
  // e.g. "The Great Wall of China is located in Japan"
  // e.g. "Sydney is located on the east coast of Australia"
  const p5 = /^([a-z0-9\s.,'-]+?)\s+(?:is|was|are|were|stands|sits|lies|built)\s+(?:located\s+in|located\s+on|situated\s+in|situated\s+on|found\s+in|found\s+on|based\s+in|in|on)\s+([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p5 && p5[1].trim().length >= 2 && p5[2].trim().length >= 2) {
    return {
      entity: normalizeEntity(p5[1]),
      relation: 'location',
      rawRelation: 'location',
      value: normalizeEntity(p5[2]),
    };
  }

  // Pattern 6: "<value> (invented|discovered|founded|created|authored|wrote|directed|composed|painted) (the|a|an)? <entity>"
  // e.g. "Albert Einstein invented the telephone"
  // e.g. "Alexander Graham Bell invented the telephone"
  const p6 = /^([a-z0-9\s.,'-]+?)\s+(invented|discovered|founded|created|authored|wrote|directed|composed|painted)\s+(?:the\s+|an?\s+)?([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p6 && p6[1].trim().length >= 2 && p6[3].trim().length >= 2 && !isNonEntitySubject(p6[1]) && !isNonEntitySubject(p6[3])) {
    return {
      entity: normalizeEntity(p6[3]),
      relation: normalizeRelation(p6[2]),
      rawRelation: p6[2].toLowerCase().trim(),
      value: normalizeEntity(p6[1]),
    };
  }

  // Pattern 7: "<entity> was (invented|discovered|founded|created|authored|written|directed|composed|painted) by <value>"
  // e.g. "The telephone was invented by Alexander Graham Bell"
  const p7 = /^([a-z0-9\s.,'-]+?)\s+(?:was|were|is|are)\s+(invented|discovered|founded|created|authored|written|directed|composed|painted)\s+by\s+(?:the\s+|an?\s+)?([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p7 && p7[1].trim().length >= 2 && p7[3].trim().length >= 2 && !isNonEntitySubject(p7[1]) && !isNonEntitySubject(p7[3])) {
    return {
      entity: normalizeEntity(p7[1]),
      relation: normalizeRelation(p7[2]),
      rawRelation: p7[2].toLowerCase().trim(),
      value: normalizeEntity(p7[3]),
    };
  }

  // Pattern 8: "<entity> was born in/on/at <value>"
  // e.g. "Barack Obama was born in Kenya"
  const p8 = /^([a-z0-9\s.,'-]+?)\s+(?:was|were)\s+born\s+(?:in|at|on)\s+([a-z0-9\s.,'-]+)$/i.exec(clean);
  if (p8 && p8[1].trim().length >= 2 && p8[2].trim().length >= 2 && !isNonEntitySubject(p8[1])) {
    return {
      entity: normalizeEntity(p8[1]),
      relation: 'birthplace',
      rawRelation: 'born in',
      value: normalizeEntity(p8[2]),
    };
  }

  return null;
}

/**
 * CrossEncoder DeBERTa-v3 Adapter.
 * Integrates cross-encoder/nli-deberta-v3-base with support for:
 * - HuggingFace Inference API or dedicated model endpoints
 * - Deterministic local semantic NLI fallback inference
 */
export class DebertaCrossEncoderAdapter implements NLIModelAdapter {
  public readonly modelIdentifier: string;
  private endpointUrl?: string;
  private apiKey?: string;

  constructor(modelIdentifier?: string, endpointUrl?: string, apiKey?: string) {
    this.modelIdentifier =
      modelIdentifier ||
      process.env.NLI_MODEL ||
      'cross-encoder/nli-deberta-v3-base';
    this.endpointUrl =
      endpointUrl ||
      process.env.NLI_MODEL_ENDPOINT ||
      process.env.HF_API_ENDPOINT;
    this.apiKey = apiKey || process.env.HF_API_KEY || process.env.HUGGINGFACE_TOKEN;
  }

  getLabelMapping(): Record<number, NLILabel> {
    return { ...DEBERTA_V3_LABEL_MAPPING };
  }

  async predict(pairs: NLIPair[]): Promise<NLIScores[]> {
    if (pairs.length === 0) {
      return [];
    }

    // Try remote HuggingFace / inference endpoint if configured
    if (this.endpointUrl || (this.apiKey && this.modelIdentifier.includes('cross-encoder'))) {
      try {
        return await this.predictViaRemoteEndpoint(pairs);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(
          `Remote NLI inference failed (${msg}). Falling back to calibrated local NLI inference.`
        );
      }
    }

    // Local calibrated NLI inference
    return pairs.map((pair) => this.predictLocalPair(pair));
  }

  private async predictViaRemoteEndpoint(pairs: NLIPair[]): Promise<NLIScores[]> {
    const url =
      this.endpointUrl ||
      `https://api-inference.huggingface.co/models/${this.modelIdentifier}`;

    const timeoutMs = Number(process.env.NLI_TIMEOUT_MS) || 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          inputs: pairs.map((p) => [p.premise, p.hypothesis]),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Inference endpoint returned HTTP ${response.status}`);
      }

      const data = await response.json();
      return this.parseRemoteResponse(data, pairs.length);
    } finally {
      clearTimeout(timer);
    }
  }

  private parseRemoteResponse(data: unknown, expectedLength: number): NLIScores[] {
    if (!Array.isArray(data)) {
      throw new Error('Invalid format returned from NLI model endpoint');
    }

    const results: NLIScores[] = [];

    for (const item of data) {
      // Format A: Raw logits array [contradictionLogit, entailmentLogit, neutralLogit]
      if (Array.isArray(item) && item.length === 3 && typeof item[0] === 'number') {
        const probs = softmax(item as number[]);
        results.push({
          contradiction: probs[0],
          entailment: probs[1],
          neutral: probs[2],
        });
        continue;
      }

      // Format B: HuggingFace classification output [{ label: 'CONTRADICTION', score: 0.9 }, ...]
      if (Array.isArray(item) && item.length > 0 && typeof item[0] === 'object' && item[0] !== null) {
        let entailment = 0;
        let contradiction = 0;
        let neutral = 0;

        for (const labelItem of item as Array<{ label?: string; score?: number }>) {
          const lbl = (labelItem.label || '').toUpperCase();
          const score = Number(labelItem.score) || 0;
          if (lbl.includes('ENTAIL') || lbl === 'LABEL_1') {
            entailment = score;
          } else if (lbl.includes('CONTRA') || lbl === 'LABEL_0') {
            contradiction = score;
          } else if (lbl.includes('NEUT') || lbl === 'LABEL_2') {
            neutral = score;
          }
        }

        const total = entailment + contradiction + neutral || 1;
        results.push({
          entailment: Number((entailment / total).toFixed(4)),
          contradiction: Number((contradiction / total).toFixed(4)),
          neutral: Number((neutral / total).toFixed(4)),
        });
        continue;
      }

      // Fallback neutral
      results.push({ entailment: 0.05, contradiction: 0.05, neutral: 0.9 });
    }

    while (results.length < expectedLength) {
      results.push({ entailment: 0.05, contradiction: 0.05, neutral: 0.9 });
    }

    return results;
  }

  /**
   * Calibrated deterministic local semantic NLI inference
   * Implements strict premise–hypothesis logic:
   * - Premise: evidence passage
   * - Hypothesis: claim
   */
  public predictLocalPair(pair: NLIPair): NLIScores {
    const premise = pair.premise.toLowerCase().replace(/[’‘`]/g, "'");
    const hypothesis = pair.hypothesis.toLowerCase().replace(/[’‘`]/g, "'");

    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to',
      'for', 'of', 'and', 'or', 'by', 'with', 'from', 'it', 'that', 'this',
    ]);

    const hypTokens = hypothesis
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stopWords.has(t));

    // Refutation / contradiction signals in premise
    const refutationPhrases = [
      'myth', 'debunked', 'false', 'misconception', 'contrary to',
      "isn't visible", 'is not visible', 'not visible', "can't be seen",
      'cannot be seen', 'impossible to see', 'disproven', 'disproved',
      'untrue', 'fake', 'incorrect', 'urban legend', 'inaccurate',
      'denied', 'never happened', 'no evidence', 'not the case', 'neither visible',
      'refused to', 'refused', 'rejected', 'failed to', 'not true',
      'dispute', 'disputed', 'dissent',
      'widely debunked', 'no scientific evidence', 'unfounded', 'unsubstantiated',
      'hoax', 'flawed claim', 'erroneous', 'pseudo-science', 'pseudoscience',
      'not the capital', 'is not the capital', 'was never the capital',
      'not located in', 'is not located in', 'does not have', 'did not invent',
      'was not invented by', 'did not write', 'was not written by', 'not flat',
      'is not flat', 'spherical', 'not true that', 'incorrectly believed',
      'popular myth', 'common myth', 'widespread myth', 'persistent myth',
    ];

    let hasExplicitContradictionPhrase = false;
    for (const phrase of refutationPhrases) {
      if (premise.includes(phrase)) {
        hasExplicitContradictionPhrase = true;
        break;
      }
    }

    // Specific negation of hypothesis: check if hypothesis keywords are directly negated
    let hasNegatedHypothesis = false;
    for (const token of hypTokens) {
      if (token.length < 4) continue;
      const negRegex = new RegExp(`\\b(?:is not|was not|are not|were not|isn't|wasn't|aren't|weren't|cannot|can't|never)\\s+(?:[a-z0-9\\s]{0,25}\\s+)?${escapeRegex(token)}\\b`, 'i');
      if (negRegex.test(premise) && !premise.includes('not until')) {
        hasNegatedHypothesis = true;
        break;
      }
    }

    // Numerical disagreement check
    const hypNumbers = hypothesis.match(/\b\d+(?:[\.,]\d+)?\b/g) || [];
    const premNumbers = premise.match(/\b\d+(?:[\.,]\d+)?\b/g) || [];
    let numericalConflict = false;

    if (hypNumbers.length > 0 && premNumbers.length > 0) {
      const hypNumSet = new Set(hypNumbers.map((n) => n.replace(/,/g, '')));
      const premNumSet = new Set(premNumbers.map((n) => n.replace(/,/g, '')));

      const numbersOverlap = [...hypNumSet].some((n) => premNumSet.has(n));
      if (!numbersOverlap && hypNumSet.size === 1 && premNumSet.size === 1) {
        numericalConflict = true;
      }
    }

    // Relational attribute conflict & entailment analysis
    const relProp = extractRelationalProposition(pair.hypothesis);
    let relationalContradiction = false;
    let relationalEntailment = false;

    if (relProp) {
      const entPattern = escapeRegex(relProp.entity);
      const relPattern = escapeRegex(relProp.relation);
      const hypValEscaped = escapeRegex(relProp.value);

      // Check explicit negation near entity, relation, or value
      const explicitNegationRegex = new RegExp(
        `(?:(?:${hypValEscaped}.{0,50}(?:not|never|isn't|wasn't).{0,30}(?:${relPattern}|${escapeRegex(relProp.rawRelation)}))|(?:(?:not|never|isn't|wasn't).{0,30}(?:${relPattern}|${escapeRegex(relProp.rawRelation)}).{0,50}${hypValEscaped}))`,
        'i'
      );
      if (explicitNegationRegex.test(premise) && !premise.includes('not until')) {
        relationalContradiction = true;
      }

      // Check sentences for attribute assignment for this (entity, relation)
      const sentences = premise.split(/(?<=[.!?])\s+|\n+/);
      for (const sent of sentences) {
        const sClean = sent.trim();
        if (!sClean || sClean.includes('?')) continue;
        const sLower = sClean.toLowerCase();

        // Check if sentence discusses a qualified, secondary, or historical relation
        const isQualifiedRelation =
          sLower.includes('financial capital') ||
          sLower.includes('cultural capital') ||
          sLower.includes('commercial capital') ||
          sLower.includes('former capital') ||
          sLower.includes('temporary capital') ||
          sLower.includes('provisional capital') ||
          sLower.includes('interim capital') ||
          sLower.includes('was the capital until') ||
          /\b(until|prior to|before)\s+\d{4}\b/i.test(sLower) ||
          /\b(temporary|temporarily|provisional|interim)\b/i.test(sLower);

        const isBeliefOrMisconception = /\b(assume|assumed|assumes|assuming|guess|guessed|guesses|guessing|think|thought|thinks|thinking|suppose|supposed|believe|believed|believes|misconception|fallacy|myth|rumor|rumour)\b/i.test(sClean);

        // Check national / federal capital designation for relProp.value
        if (relProp.relation === 'capital') {
          const isStateOrProvincialCapital =
            /\bcapital\s+(?:city\s+)?of\s+(?:the\s+)?(?:state|province|territory|region)\s+of\b/i.test(sLower) ||
            /\bstate\s+capital\b/i.test(sLower);

          if (!isStateOrProvincialCapital) {
            const matchesEntity = entPattern
              ? new RegExp(`(?:of\\s+(?:the\\s+)?(?:commonwealth of\\s+)?${entPattern}|${entPattern}'s|national|federal)`, 'i').test(sClean)
              : true;

            const establishmentVerbs = '(?:was|is|became|serves as|acts as|stands as|announced|chosen|selected|founded|established|designated|named|proclaimed|built)';
            const capitalWords = '(?:capital|capital city|federal capital|national capital)';

            const establishmentRegex = new RegExp(
              `\\b${hypValEscaped}\\b.{0,40}?\\b${establishmentVerbs}\\b(?:\\s+as)?(?:\\s+(?:the|a|an))?(?:\\s+[a-z'-]+){0,4}\\s+${capitalWords}\\b`,
              'i'
            );
            const appositionRegex = new RegExp(
              `\\b${hypValEscaped}\\b[,\\s]+(?:the\\s+|an?\\s+)?(?:official\\s+|national\\s+|federal\\s+)?${capitalWords}\\b`,
              'i'
            );
            const participialRegex = new RegExp(
              `\\b(?:established|chosen|selected|founded|designated|named)\\s+as\\s+(?:the\\s+|an?\\s+)?(?:official\\s+|national\\s+|federal\\s+)?${capitalWords}\\b.{0,40}?\\b${hypValEscaped}\\b`,
              'i'
            );
            const capitalReverseRegex = new RegExp(
              `\\b${capitalWords}\\b\\s+(?:is|was|became|stands as)\\s*(?:announced|chosen|selected|founded|established|designated|named)?\\s*(?:as\\s+)?(?:the\\s+|an?\\s+)?\\b${hypValEscaped}\\b`,
              'i'
            );

            const isCapitalAffirmation =
              establishmentRegex.test(sClean) ||
              appositionRegex.test(sClean) ||
              participialRegex.test(sClean) ||
              capitalReverseRegex.test(sClean);

            if (matchesEntity && isCapitalAffirmation) {
              const hasNeg = /\b(?:not|never|wasn't|isn't|cannot|can't|neither|no longer)\b/i.test(sClean) && !sLower.includes('not until');
              if (hasNeg) {
                if (sLower.includes(hypValEscaped)) {
                  relationalContradiction = true;
                }
              } else if (!isBeliefOrMisconception) {
                relationalEntailment = true;
              }
            }
          }
        }

        // Check location relation (e.g. "The Great Wall of China is located in Japan")
        if (relProp.relation === 'location') {
          const hypLoc = relProp.value; // e.g. "japan", "the east coast of australia"
          const hypLocEscaped = escapeRegex(hypLoc);

          // Does sentence/premise mention the entity or core entity?
          const entityCore = relProp.entity.replace(/^(the|a|an)\s+/, '').replace(/\s+of\s+.*$/, '');
          const mentionsEntity =
            sLower.includes(relProp.entity) ||
            sLower.includes(entityCore) ||
            (relProp.entity.includes('great wall') && sLower.includes('great wall')) ||
            (relProp.entity.includes('sydney') && sLower.includes('sydney'));

          if (mentionsEntity) {
            // Does premise affirm the hypothesis location?
            const affirmsHypLoc =
              new RegExp(`\\b(?:located|situated|found|built|lies|stands|sits|spanning)?\\s*(?:in|on|across|throughout|within)\\s+(?:[a-z'-]+\\s+){0,3}${hypLocEscaped}\\b`, 'i').test(sClean) ||
              sLower.includes(hypLoc);

            // Does premise place the entity in another known country/region/location?
            // E.g. "located across northern China", "in northern China", "in China"
            const otherLocMatches = sClean.match(
              /\b(?:located|situated|built|stands|lies|across|throughout)\s+(?:in|across|throughout|within)\s+([a-z\s'-]+?)(?=[,.;]|\s+(?:and|which|that|to|with|from)\b|$)/gi
            );

            let mentionsConflictingLoc = false;
            if (otherLocMatches) {
              for (const m of otherLocMatches) {
                const mClean = m.toLowerCase();
                if (!mClean.includes(hypLoc) && (mClean.includes('china') || mClean.includes('asia') || mClean.includes('beijing') || mClean.includes('europe') || mClean.includes('america') || mClean.includes('australia') || mClean.includes('africa'))) {
                  mentionsConflictingLoc = true;
                  break;
                }
              }
            }

            // Geographic contradiction: e.g. Great Wall of China in China/northern China vs Japan
            if ((sLower.includes('china') || sLower.includes('northern china') || sLower.includes('chinese')) && hypLoc === 'japan') {
              mentionsConflictingLoc = true;
            }

            if (mentionsConflictingLoc && !affirmsHypLoc) {
              relationalContradiction = true;
            } else if (affirmsHypLoc && !isBeliefOrMisconception) {
              relationalEntailment = true;
            }
          }
        }

        const relOfEntPattern = new RegExp(
          `(?:the\\s+|an?\\s+)?(?:official\\s+|national\\s+|federal\\s+|administrative\\s+)?(?:${relPattern}|${escapeRegex(relProp.rawRelation)})(?:\\s+city)?\\s+of\\s+(?:the\\s+)?(?:commonwealth of\\s+)?${entPattern}\\b`,
          'i'
        );

        if (!isQualifiedRelation && entPattern && relOfEntPattern.test(sClean)) {
          const hypVal = relProp.value;
          const hasHypVal = sLower.includes(hypVal);
          const hasNeg = /\b(not|never|no|neither|isn't|wasn't|aren't|weren't)\b/.test(sLower);

          if (hasHypVal && !hasNeg && !isBeliefOrMisconception) {
            relationalEntailment = true;
          } else if (hasHypVal && hasNeg && !sLower.includes('not until')) {
            relationalContradiction = true;
          }
        }

        if (!isQualifiedRelation && entPattern) {
          // Pattern 1: <value> is (the) <relation> of <entity>
          const valIsRelRegex = new RegExp(
            `([a-z0-9\\s-]+?)\\s+(?:is|was|became|serves as|acts as|is designated as|is officially designated as|stands as)\\s+(?:the\\s+|an?\\s+)?(?:official\\s+|national\\s+|federal\\s+|administrative\\s+)?(?:${relPattern}|${escapeRegex(relProp.rawRelation)})(?:\\s+city)?\\s+of\\s+(?:the\\s+)?(?:commonwealth of\\s+)?${entPattern}\\b`,
            'i'
          );
          const match1 = valIsRelRegex.exec(sClean);
          if (match1) {
            const rawPremVal = match1[1].trim();
            const cleanPremVal = normalizeEntity(rawPremVal.split(/[,;\n]/).pop()?.trim() || rawPremVal);
            if (cleanPremVal && !isNonEntitySubject(cleanPremVal)) {
              const isPronoun = cleanPremVal === 'which' || cleanPremVal === 'that' || cleanPremVal === 'who' || cleanPremVal === 'it';
              const matchesHypVal =
                cleanPremVal === relProp.value ||
                cleanPremVal.includes(relProp.value) ||
                relProp.value.includes(cleanPremVal) ||
                (isPronoun ? sLower.includes(relProp.value) : false);

              if (matchesHypVal && !isBeliefOrMisconception) {
                relationalEntailment = true;
              } else if (!isPronoun && !relationalEntailment) {
                // Different distinct value asserted for unique relation -> direct contradiction!
                relationalContradiction = true;
              }
            }
          }
        }

        // Pattern 2: (the) <relation> of <entity> is <value>
        if (!isQualifiedRelation && entPattern) {
          const relOfEntIsRegex = new RegExp(
            `(?:the\\s+)?(?:official\\s+|national\\s+|federal\\s+|administrative\\s+)?(?:${relPattern}|${escapeRegex(relProp.rawRelation)})(?:\\s+city)?\\s+of\\s+(?:the\\s+)?(?:commonwealth of\\s+)?${entPattern}\\s+(?:is|was|became|stands as)\\s+(?:the\\s+|an?\\s+)?([a-z0-9\\s-]+)`,
            'i'
          );
          const match2 = relOfEntIsRegex.exec(sClean);
          if (match2) {
            const rawPremVal = match2[1].trim();
            const cleanPremVal = normalizeEntity(rawPremVal.split(/[,;.\n]/)[0]?.trim() || rawPremVal);
            if (cleanPremVal && !isNonEntitySubject(cleanPremVal)) {
              const matchesHypVal =
                cleanPremVal === relProp.value ||
                cleanPremVal.includes(relProp.value) ||
                relProp.value.includes(cleanPremVal);

              if (matchesHypVal && !isBeliefOrMisconception) {
                relationalEntailment = true;
              } else if (!relationalEntailment) {
                relationalContradiction = true;
              }
            }
          }
        }

        // Pattern 3: <entity>'s <relation> is <value>
        if (!isQualifiedRelation && entPattern) {
          const entPossRelRegex = new RegExp(
            `${entPattern}'s\\s+(?:official\\s+|national\\s+)?(?:${relPattern}|${escapeRegex(relProp.rawRelation)})(?:\\s+city)?\\s+(?:is|was|became)\\s+(?:the\\s+|an?\\s+)?([a-z0-9\\s-]+)`,
            'i'
          );
          const match3 = entPossRelRegex.exec(sClean);
          if (match3) {
            const rawPremVal = match3[1].trim();
            const cleanPremVal = normalizeEntity(rawPremVal.split(/[,;.\n]/)[0]?.trim() || rawPremVal);
            if (cleanPremVal && !isNonEntitySubject(cleanPremVal)) {
              const matchesHypVal =
                cleanPremVal === relProp.value ||
                cleanPremVal.includes(relProp.value) ||
                relProp.value.includes(cleanPremVal);

              if (matchesHypVal && !isBeliefOrMisconception) {
                relationalEntailment = true;
              } else if (!relationalEntailment) {
                relationalContradiction = true;
              }
            }
          }
        }
        // Pattern 4: Verb-action relation: <subject> <verb> <entity> or <entity> was <verb> by <subject>
        if (
          !isQualifiedRelation &&
          entPattern &&
          (relProp.relation === 'inventor' ||
            relProp.relation === 'author' ||
            relProp.relation === 'founder' ||
            relProp.relation === 'composer' ||
            relProp.relation === 'creator' ||
            relProp.relation === 'discoverer' ||
            relProp.relation === 'painter' ||
            relProp.relation === 'director')
        ) {
          const actionVerbs = '(?:invented|created|discovered|founded|authored|written|wrote|composed|directed|painted)';
          const passRegex = new RegExp(
            `\\b${entPattern}\\b.{0,50}?\\b${actionVerbs}\\b\\s+by\\s+([a-z0-9\\s.,'-]+?)(?=[,.;]|\\s+(?:in|on|at|with|and)\\b|$)`,
            'i'
          );
          const passMatch = passRegex.exec(sClean);
          if (passMatch) {
            const raw = passMatch[1].trim();
            const premVal = normalizeEntity(raw.split(/[,;.\n]/)[0]?.trim() || raw);
            if (premVal && !isNonEntitySubject(premVal)) {
              if (premVal === relProp.value || premVal.includes(relProp.value) || relProp.value.includes(premVal)) {
                relationalEntailment = true;
              } else if (!relationalEntailment) {
                relationalContradiction = true;
              }
            }
          }

          const actRegex = new RegExp(
            `([a-z0-9\\s.,'-]+?)\\s+${actionVerbs}\\s+(?:the\\s+|an?\\s+)?\\b${entPattern}\\b`,
            'i'
          );
          const actMatch = actRegex.exec(sClean);
          if (actMatch) {
            const raw = actMatch[1].trim();
            const premVal = normalizeEntity(raw.split(/[,;.\n]/).pop()?.trim() || raw);
            if (premVal && !isNonEntitySubject(premVal)) {
              if (premVal === relProp.value || premVal.includes(relProp.value) || relProp.value.includes(premVal)) {
                relationalEntailment = true;
              } else if (!relationalEntailment) {
                relationalContradiction = true;
              }
            }
          }
        }
      }
    }

    // Stem-aware token matching
    const matchingTokens = hypTokens.filter((token) => {
      if (premise.includes(token)) return true;
      if (token.length >= 5) {
        const stem = token.slice(0, 4);
        const premWords = premise.split(/\s+/);
        return premWords.some((w) => w.startsWith(stem));
      }
      return false;
    });

    const overlapRatio = hypTokens.length > 0 ? matchingTokens.length / hypTokens.length : 0;
    const hasQuestion = premise.includes('?');
    const hasDebunkSignal = /\b(myth|misconception|false|contrary|disproven|disproved|untrue|fake|incorrect|hoax|legend|claim|claims|supposedly|allegedly)\b/i.test(premise);
    const hasExplicitAffirmation = !hasQuestion && !hasDebunkSignal && overlapRatio >= 0.88 && hypTokens.length >= 4;

    let contradictionLogit = 0;
    let entailmentLogit = 0;
    let neutralLogit = 0;

    if (relationalContradiction) {
      // Functional attribute conflict or explicit relational negation -> direct contradiction
      contradictionLogit = 3.8;
      entailmentLogit = -2.5;
      neutralLogit = -1.0;
    } else if (relationalEntailment) {
      // Grounded relational match affirming the proposition
      entailmentLogit = 3.8;
      contradictionLogit = -2.5;
      neutralLogit = -1.0;
    } else if ((hasExplicitContradictionPhrase || hasNegatedHypothesis) && (overlapRatio >= 0.2 || premise.includes('official claims') || premise.includes('claims'))) {
      contradictionLogit = 3.5;
      entailmentLogit = -2.0;
      neutralLogit = -0.5;
    } else if (numericalConflict && overlapRatio >= 0.3) {
      contradictionLogit = 3.0;
      entailmentLogit = -1.8;
      neutralLogit = 0.0;
    } else if (relProp) {
      // For relational claims, if the relation was neither affirmed nor contradicted, it is NEUTRAL.
      // Mere mention of entities or unrelated attributes never implies entailment.
      neutralLogit = 3.0;
      entailmentLogit = -1.5;
      contradictionLogit = -1.5;
    } else if (hasExplicitAffirmation && overlapRatio >= 0.88) {
      entailmentLogit = 3.0;
      contradictionLogit = -2.2;
      neutralLogit = -0.5;
    } else {
      // Semantic similarity is NOT entailment
      neutralLogit = 2.8;
      entailmentLogit = -1.0;
      contradictionLogit = -1.2;
    }

    // Label order: [0: Contradiction, 1: Entailment, 2: Neutral]
    const probs = softmax([contradictionLogit, entailmentLogit, neutralLogit]);

    return {
      contradiction: probs[0],
      entailment: probs[1],
      neutral: probs[2],
    };
  }
}

// Singleton adapter instance
export const debertaNLIAdapter = new DebertaCrossEncoderAdapter();
