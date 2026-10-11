/**
 * Temporal & As-Of Verification Service (Feature 11)
 * Analyzes temporal markers, distinguishing current, historical, as-of, and future claims.
 * Ensures evidence scope aligns with the claim's time context.
 */

export interface TemporalContext {
  type: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'FUTURE' | 'TIMELESS';
  marker?: string;
  year?: number;
  explanation: string;
}

export class TemporalVerifier {
  extractTemporalContext(text: string): TemporalContext {
    const clean = text.trim();

    // 1. As-of specific date: e.g. "as of 2024", "as of January 2023"
    const asOfMatch = clean.match(/\bas\s+of\s+(?:[a-z]+\s+)?(\d{4})\b/i);
    if (asOfMatch) {
      const year = parseInt(asOfMatch[1], 10);
      return {
        type: 'AS_OF',
        marker: asOfMatch[0],
        year,
        explanation: `Claim is bounded to the temporal window as of ${year}.`,
      };
    }

    // 2. Explicit past year: e.g. "in 1901", "in 1999", "during 1945"
    const pastYearMatch = clean.match(/\b(?:in|during|by|around|before|after)\s+(\d{4})\b/i);
    if (pastYearMatch) {
      const year = parseInt(pastYearMatch[1], 10);
      const currentYear = new Date().getFullYear();
      if (year < currentYear) {
        return {
          type: 'HISTORICAL',
          marker: pastYearMatch[0],
          year,
          explanation: `Historical claim situated in year ${year}. Requires historical corroboration.`,
        };
      } else if (year > currentYear) {
        return {
          type: 'FUTURE',
          marker: pastYearMatch[0],
          year,
          explanation: `Future projection situated in year ${year}. Cannot be empirically verified as settled fact.`,
        };
      }
    }

    // 3. Current / present-day indicators: "currently", "now", "presently", "today", "is the current"
    const currentMatch = clean.match(/\b(currently|presently|today|now|as of now|is\s+the\s+current)\b/i);
    if (currentMatch) {
      return {
        type: 'CURRENT',
        marker: currentMatch[0],
        explanation: 'Present-tense assertion requiring up-to-date, current evidence.',
      };
    }

    // 4. Historical verb phrases without explicit year: "was established", "formerly", "originally", "former"
    const histVerbsMatch = clean.match(/\b(was\s+established|became|formerly|originally|in\s+ancient\s+times|in\s+the\s+\d+(?:th|st|nd|rd)\s+century)\b/i);
    if (histVerbsMatch) {
      return {
        type: 'HISTORICAL',
        marker: histVerbsMatch[0],
        explanation: 'Historical event or origin assertion.',
      };
    }

    // 5. Future indicators: "will", "is projected to", "is expected to"
    const futureMatch = clean.match(/\b(will\s+be|is\s+projected\s+to|is\s+expected\s+to|predicted\s+to)\b/i);
    if (futureMatch) {
      return {
        type: 'FUTURE',
        marker: futureMatch[0],
        explanation: 'Forward-looking forecast or projection.',
      };
    }

    return {
      type: 'TIMELESS',
      explanation: 'General factual or timeless assertion without explicit temporal boundaries.',
    };
  }

  /**
   * Assesses whether evidence matches the required temporal context.
   */
  evaluateTemporalAlignment(
    claimContext: TemporalContext,
    evidenceSnippet: string
  ): { isAligned: boolean; warning?: string } {
    const sLower = evidenceSnippet.toLowerCase();

    if (claimContext.type === 'CURRENT') {
      // If evidence discusses a former or past state, flag potential staleness
      if (/\b(former|formerly|was\s+the|stepped\s+down|resigned|no\s+longer|until\s+\d{4})\b/i.test(sLower)) {
        return {
          isAligned: false,
          warning: 'Evidence passage references a historical or superseded status rather than current state.',
        };
      }
    }

    if (claimContext.type === 'HISTORICAL' && claimContext.year) {
      // Check if evidence mentions contradictory dates
      const yearsInSnippet = evidenceSnippet.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/g);
      if (yearsInSnippet && yearsInSnippet.length > 0) {
        const hasYear = yearsInSnippet.some((y) => Math.abs(parseInt(y, 10) - claimContext.year!) <= 1);
        if (!hasYear && sLower.includes('founded') && !sLower.includes(String(claimContext.year))) {
          return {
            isAligned: false,
            warning: `Claim specifies year ${claimContext.year}, but evidence references alternative historical chronology.`,
          };
        }
      }
    }

    return { isAligned: true };
  }
}

export const temporalVerifier = new TemporalVerifier();
