import { LLMProvider } from './types.js';
import { ClaimType } from '../../types.js';

interface RawClaim {
  id: string;
  original_text: string;
  normalized_claim: string;
  claim_type: ClaimType;
  check_worthy: boolean;
  reason: string;
}

export class FallbackNLPProvider implements LLMProvider {
  readonly name = 'fallback';

  async extractClaims(text: string): Promise<string> {
    const claims = this.processText(text);
    return JSON.stringify({ claims });
  }

  processText(text: string): RawClaim[] {
    const sentences = this.splitIntoSentences(text);
    const results: RawClaim[] = [];
    let claimCounter = 1;
    let lastIdentifiedSubject: string | null = null;

    for (const rawSentence of sentences) {
      const trimmed = rawSentence.trim();
      if (!trimmed) continue;

      // Check if it's purely conversational or greeting or meta-instruction
      if (this.isGreetingOrInstruction(trimmed)) {
        continue;
      }

      // Check if purely subjective opinion/commentary
      if (this.isPureOpinion(trimmed)) {
        continue;
      }

      // Extract factual assertions (handling mixed opinion+fact or compound sentences)
      const assertions = this.extractAssertions(trimmed);

      for (const assertion of assertions) {
        if (this.isGreetingOrInstruction(assertion.text) || this.isPureOpinion(assertion.text)) {
          continue;
        }

        // Identify subject context for pronoun resolution
        const detectedSubject = this.detectSubject(assertion.text);
        if (detectedSubject && !this.isPronoun(detectedSubject)) {
          lastIdentifiedSubject = detectedSubject;
        }

        const normalized = this.normalizeClaim(assertion.text, lastIdentifiedSubject);
        const claimType = this.classifyClaimType(normalized);
        const reason = this.generateReason(normalized, claimType);

        results.push({
          id: `claim_${claimCounter++}`,
          original_text: assertion.original,
          normalized_claim: normalized,
          claim_type: claimType,
          check_worthy: true,
          reason,
        });
      }
    }

    return results;
  }

  private splitIntoSentences(text: string): string[] {
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!cleanText) return [];

    // Support Devanagari danda (।) and multilingual sentences
    if (/[\u0900-\u097F]/.test(cleanText)) {
      const parts = cleanText.split(/(?<=[.!?।॥])\s+|\n+/);
      return parts.map((p) => p.trim()).filter(Boolean);
    }

    // Use Intl.Segmenter if supported by runtime
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
      const segments = Array.from(segmenter.segment(cleanText))
        .map((s) => s.segment.trim())
        .filter(Boolean);
      return segments;
    }

    // Fallback regex with negative lookbehind/lookahead for decimals and abbreviations
    const parts = cleanText.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/g);
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  private isGreetingOrInstruction(sentence: string): boolean {
    const s = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const greetings = [
      'hello',
      'hello there',
      'hi',
      'hi there',
      'hey',
      'good morning',
      'good afternoon',
      'good evening',
      'greetings',
      'how can i help you',
      'how can i help you today',
      'let me know if you need anything else',
      'hope this helps',
      'here is what you asked for',
      'sure thing',
      'certainly',
      'as an ai model',
      'as an ai assistant',
      'have a wonderful day',
      'have a great day',
      'hope you have a wonderful day',
      'hope you have a great day',
      'wishing you a wonderful day',
    ];
    if (greetings.some((g) => s === g || s.startsWith(g + ' ') || s.endsWith(' ' + g))) {
      return true;
    }

    if (/^(hope you|wishing you|have a)\s+(have\s+)?(a\s+)?(wonderful|great|good|nice)\s+day/i.test(s)) {
      return true;
    }

    return false;
  }

  private isPureOpinion(sentence: string): boolean {
    const s = sentence.toLowerCase().replace(/[.!?]/g, '').trim();
    const pureOpinions = [
      'this is an interesting fact',
      'this is a fascinating fact',
      'that is an interesting point',
      'in my opinion',
      'i think so',
      'i like this',
      'this is great',
      'it is wonderful',
      'this sounds great',
      'i believe in kindness',
      'i believe in love',
      'i believe in peace',
      'beauty is in the eye of the beholder',
    ];
    if (pureOpinions.includes(s)) return true;

    // Matches standalone expressions of taste or commentary without facts
    if (
      /^(this|that|it)\s+is\s+(an?\s+)?(interesting|fascinating|cool|great|wonderful|boring|amazing|pleasing)\s*(fact|point|note|thing)?$/i.test(
        s
      )
    ) {
      return true;
    }

    if (/^i\s+(?:strongly\s+)?believe\s+in\s+[a-z\s]+$/i.test(s)) {
      return true;
    }

    // Belief in abstract virtues combined with well-wishing
    if (/^i\s+(?:strongly\s+)?believe\s+in\s+.*(?:hope|wish|have a).*day$/i.test(s)) {
      return true;
    }

    if (/^(in my (humble )?opinion|personally|i believe|i feel|i think)\s*$/i.test(s)) {
      return true;
    }

    return false;
  }

  private extractAssertions(sentence: string): { original: string; text: string }[] {
    let clean = sentence.trim();
    const original = clean;

    // Iteratively strip opinion prefixes:
    // "In my opinion, it is absurd that the treaty was signed in 1919."
    let changed = true;
    while (changed) {
      changed = false;
      const opinionPrefixRegex =
        /^(?:in my (?:humble )?opinion,?\s*|personally,?\s*|i (?:strongly )?(?:think|feel|believe) (?:that )?|it is (?:absurd|surprising|shocking|wonderful|great) that\s*)/i;
      const match = clean.match(opinionPrefixRegex);
      if (match) {
        clean = clean.slice(match[0].length).trim();
        if (clean.length > 0) {
          clean = clean.charAt(0).toUpperCase() + clean.slice(1);
        }
        changed = true;
      }
    }

    // Check if sentence contains multiple factual assertions joined by ";"
    if (clean.includes(';')) {
      const parts = clean.split(';').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map((part) => ({
          original: part,
          text: part.endsWith('.') ? part : part + '.',
        }));
      }
    }

    // Check compound and coordinate clauses with ", and [Subject] [Verb]" or series "Clause 1, Clause 2, and Clause 3"
    const andParts = clean.split(/,\s+and\s+/i);
    if (andParts.length > 1) {
      const lastPart = andParts[andParts.length - 1].trim();
      const initialText = andParts.slice(0, andParts.length - 1).join(', and ').trim();

      // Split initialText on coordinate clause boundaries: comma followed by a clause with a subject and verb
      const initialClauses = initialText.split(
        /,\s+(?=[a-z0-9\s'-]+?\s+(?:is|was|were|are|has|have|had|existed|exceeds|became|won|built|joined|consolidated|developed|invented|discovered|leads|borders)\b)/i
      );

      const allParts = [...initialClauses, lastPart];
      const results: { original: string; text: string }[] = [];
      const baseSubject = this.detectSubject(allParts[0]);

      for (let i = 0; i < allParts.length; i++) {
        const rawPart = allParts[i].trim();
        let partText = rawPart;

        if (i > 0) {
          // Resolve leading pronoun in coordinated clause using baseSubject
          const pronounMatch = partText.match(/^(?:it|this|that|he|she|they)\s+/i);
          if (pronounMatch && baseSubject && !this.isPronoun(baseSubject)) {
            partText = `${baseSubject} ${partText.slice(pronounMatch[0].length).trim()}`;
          }
        }

        if (partText.length > 0) {
          partText = partText.charAt(0).toUpperCase() + partText.slice(1);
        }

        results.push({
          original: rawPart,
          text: partText.endsWith('.') ? partText : partText + '.',
        });
      }

      return results;
    }

    return [{ original, text: clean }];
  }

  private detectSubject(text: string): string | null {
    const clean = text.trim();

    // 1. Relational attribute nouns where predicate nominative is the focal subject:
    // E.g. "The capital of Australia is Sydney" -> focal entity is "Sydney"
    const relationalAttrNoun = /^(?:capital|currency|inventor|founder|author|director|ceo|president|prime minister|leader|headquarters|birthplace|population|highest peak|deepest point|area|speed|symbol|anthem|motto|largest city|most populous city)\b/i;
    const copulaOfMatch = clean.match(
      /^(?:The\s+([a-z0-9\s-]+?)\s+of\s+([A-Z][a-z0-9\s-]+?)\s+(?:is|was|are|were)\s+(?:the\s+|an?\s+)?([A-Z][a-z0-9\s-]+))/i
    );
    if (copulaOfMatch && relationalAttrNoun.test(copulaOfMatch[1])) {
      const value = copulaOfMatch[3].replace(/[.!?]+$/, '').trim();
      const entity = copulaOfMatch[2].trim();
      if (value && !this.isPronoun(value) && !/^(?:located|situated|found|built|based)\b/i.test(value)) return value;
      if (entity && !this.isPronoun(entity)) return entity;
    }

    // 2. Structure: "The <ProperName> of <Country>" -> "The Great Wall of China"
    const properOfMatch = clean.match(/^(The\s+[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*\s+of\s+[A-Z][a-z0-9]+)/);
    if (properOfMatch) {
      return properOfMatch[1].trim();
    }

    // 3. Structure: "<Entity>'s <noun> is <Value>"
    // E.g. "Australia's capital is Sydney" -> focal entity is "Sydney"
    const possMatch = clean.match(
      /^([A-Z][a-z0-9\s-]+?)'s\s+([a-z0-9\s-]+?)\s+(?:is|was|are|were)\s+(?:the\s+|an?\s+)?([A-Z][a-z0-9\s-]+)/i
    );
    if (possMatch && relationalAttrNoun.test(possMatch[2])) {
      const value = possMatch[3].replace(/[.!?]+$/, '').trim();
      if (value && !this.isPronoun(value) && !/^(?:located|situated|found|built|based)\b/i.test(value)) return value;
      return possMatch[1].trim();
    }

    // 4. Leading copular complement: "The country's largest city is Sydney" -> Sydney
    const compMatch = clean.match(
      /^(?:The|A|An)\s+[a-z0-9\s'-]+?\s+(?:is|was|are|were)\s+(?:the\s+|an?\s+)?([A-Z][a-z0-9\s-]+)/i
    );
    if (compMatch && !/^(?:located|situated|found|built|based)\b/i.test(compMatch[1])) {
      const value = compMatch[1].replace(/[.!?]+$/, '').trim();
      if (value && !this.isPronoun(value)) return value;
    }

    // 5. Leading proper noun phrase (excluding determiners like The, A, An)
    const leadingEntityMatch = clean.match(/^(?:(?:The|A|An)\s+)?([A-Z][a-z0-9]+(?:\s+(?:of\s+)?[A-Z][a-z0-9]+)*)/);
    if (leadingEntityMatch) {
      const candidate = leadingEntityMatch[1].replace(/'s$/, '').trim();
      if (candidate && !this.isPronoun(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private isPronoun(word: string): boolean {
    const w = word.trim().toLowerCase();
    return /^(he|she|it|they|this|that|these|those|the|a|an|there|here|some|many|all|such)$/i.test(w);
  }

  private normalizeClaim(text: string, subjectContext: string | null): string {
    let normalized = text.trim();

    // Ensure ending with period if not punctuated
    if (!/[.!?]$/.test(normalized)) {
      normalized += '.';
    }

    // Capitalize first letter
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);

    // Resolve ambiguous pronouns at beginning of sentence if subjectContext is known
    if (subjectContext && !this.isPronoun(subjectContext)) {
      const pronounRegex = /^(It|He|She|They|This|That)\s+/i;
      const match = normalized.match(pronounRegex);
      if (match) {
        normalized = `${subjectContext} ${normalized.slice(match[0].length)}`;
      }
    }

    return normalized;
  }

  private classifyClaimType(claim: string): ClaimType {
    const lower = claim.toLowerCase();

    // Numerical checks (numbers, dates, quantities, percentages, billions)
    if (
      /\b\d+(\.\d+)?\b/.test(lower) ||
      /\b(billion|million|trillion|thousand|percent|percentage|\$|€|£|first|second)\b/.test(lower)
    ) {
      if (/\b(born in|died in|in \d{4}|century|war|treaty|founded in)\b/.test(lower)) {
        return 'historical';
      }
      return 'numerical';
    }

    // Comparative
    if (
      /\b(exceeds|larger than|smaller than|faster than|highest|lowest|tallest|deepest|more than|less than)\b/.test(
        lower
      )
    ) {
      return 'comparative';
    }

    // Scientific
    if (
      /\b(moon|sun|earth|planet|europa|gravity|physics|chemistry|biology|atoms?|molecules?|species|naked eye|visible from|organism|organisms|cell|cells|dna|disease|vaccine|energy)\b/.test(
        lower
      )
    ) {
      return 'scientific';
    }

    // Political & Geopolitical
    if (
      /\b(capital|president|prime minister|government|parliament|election|treaty|borders|country|nation|state|policy|democracy|constitution)\b/.test(
        lower
      )
    ) {
      return 'political';
    }

    // Historical
    if (
      /\b(history|historical|ancient|century|dynasty|founded|invented|discovered|revolution|war|empire)\b/.test(
        lower
      )
    ) {
      return 'historical';
    }

    // Causal
    if (/\b(causes|caused|leads to|led to|results in|resulted in|because of|due to)\b/.test(lower)) {
      return 'causal';
    }

    return 'general factual';
  }

  private generateReason(claim: string, type: ClaimType): string {
    switch (type) {
      case 'numerical':
        return 'This is a quantitative assertion involving numerical figures or measurements that can be verified against demographic, statistical, or factual databases.';
      case 'scientific':
        return 'This is a scientific or empirical assertion that can be investigated and verified using observational data or scientific consensus.';
      case 'historical':
        return 'This is a historical assertion regarding past events, dates, or figures that can be verified using historical records.';
      case 'political':
        return 'This is a political or geopolitical claim that can be verified using official administrative or governmental records.';
      case 'comparative':
        return 'This is a comparative assertion evaluating two or more entities that can be verified through comparative measurements or data.';
      case 'causal':
        return 'This is a causal assertion claiming a cause-and-effect relationship that can be evaluated against empirical research.';
      default:
        return 'This is an empirical factual assertion that can potentially be verified using external evidence.';
    }
  }
}
