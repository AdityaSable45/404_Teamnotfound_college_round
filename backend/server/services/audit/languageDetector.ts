/**
 * Language Detector & Cross-Lingual Normalization Service
 * Handles multilingual verification for English, Hindi, Marathi, and beyond.
 * Preserves user's original language while facilitating cross-lingual evidence retrieval.
 */

export interface LanguageDetectionResult {
  language: 'en' | 'hi' | 'mr' | 'other';
  languageName: string;
  isMultilingual: boolean;
  script: 'latin' | 'devanagari' | 'other';
  crossLingualQuery?: string;
}

// Common multilingual dictionary for relational terms & high-frequency global entities
const MULTILINGUAL_LEXICON: Record<string, string> = {
  // Hindi / Marathi relational nouns & verbs
  राजधानी: 'capital',
  शहर: 'city',
  देश: 'country',
  राज्य: 'state',
  भाषा: 'language',
  जनसंख्या: 'population',
  लोकसंख्या: 'population',
  चलन: 'currency',
  शोध: 'inventor discovery',
  संस्थापक: 'founder',
  अध्यक्ष: 'president',
  पंतप्रधान: 'prime minister',
  प्रधानमंत्री: 'prime minister',
  इतिहास: 'history',
  बांधले: 'built',
  बनवला: 'built',
  निर्मिती: 'built established',
  स्थापना: 'founded established',
  स्थित: 'located',
  आहे: 'is',
  आहेत: 'are',
  होता: 'was',
  होती: 'was',
  है: 'is',
  हैं: 'are',
  था: 'was',
  थी: 'was',
  मोठे: 'largest',
  सबसे: 'most largest',
  सर्वात: 'most largest',
  जगातील: 'in the world',
  दुनियेतील: 'in the world',
  विश्व: 'world',

  // Prominent countries & capitals
  भारत: 'India',
  फ्रान्स: 'France',
  फ्रांस: 'France',
  पॅरिस: 'Paris',
  पेरिस: 'Paris',
  चीन: 'China',
  जपान: 'Japan',
  जपानमध्ये: 'in Japan',
  जर्मनी: 'Germany',
  लंडन: 'London',
  लंदन: 'London',
  इंग्लंड: 'England',
  ब्रिटन: 'Britain',
  अमेरिका: 'United States America',
  ऑस्ट्रेलिया: 'Australia',
  कॅनबेरा: 'Canberra',
  कैनबरा: 'Canberra',
  सिडनी: 'Sydney',
  टोकियो: 'Tokyo',
  टोक्यो: 'Tokyo',
  दीवार: 'wall',
  भित्ती: 'wall',
  महाप्राचीर: 'Great Wall',
};

export class LanguageDetector {
  /**
   * Detects the language and script of a given text string.
   */
  detectLanguage(text: string): LanguageDetectionResult {
    if (!text || !text.trim()) {
      return {
        language: 'en',
        languageName: 'English',
        isMultilingual: false,
        script: 'latin',
      };
    }

    const clean = text.trim();

    // Check script
    const devanagariMatches = clean.match(/[\u0900-\u097F]/g) || [];
    const latinMatches = clean.match(/[a-zA-Z]/g) || [];

    const totalChars = devanagariMatches.length + latinMatches.length || 1;
    const devanagariRatio = devanagariMatches.length / totalChars;

    if (devanagariRatio > 0.25) {
      // Devanagari script: Distinguish Marathi vs Hindi
      const marathiWords =
        clean.match(
          /(?:^|[^\u0900-\u097F])(आहे|आहेत|होता|होती|होते|झाला|झाली|झाले|केला|केली|केले|आणि|पण|किंवा|नाही|नाहीत|मध्ये|कसे|काय|कधी|कुठे|त्यांच्या|त्याचे|त्याची|माझे|माझा|आपण|करणे|सर्वात|मोठे|लोकसंख्या)(?=[^\u0900-\u097F]|$)/gi
        ) || [];

      // Marathi distinctive genitive case suffixes (e.g., भारताची, फ्रान्सचे, पुण्याची)
      const marathiSuffixes =
        clean.match(/[\u0900-\u097F]+(ची|च्या|चे|चा)(?=[^\u0900-\u097F]|$)/gi) || [];

      const hindiWords =
        clean.match(
          /(?:^|[^\u0900-\u097F])(है|हैं|था|थी|थे|हुआ|हुई|हुए|किया|किए|और|लेकिन|या|नहीं|में|कैसे|क्या|कब|कहाँ|उनके|उसका|उसकी|मेरा|मेरी|हम|करना|सबसे|बड़ा|बड़ी|जनसंख्या)(?=[^\u0900-\u097F]|$)/gi
        ) || [];

      const marathiScore = marathiWords.length + marathiSuffixes.length;
      const hindiScore = hindiWords.length;

      const isMarathi = marathiScore > hindiScore;
      const langCode = isMarathi ? 'mr' : 'hi';
      const langName = isMarathi ? 'Marathi' : 'Hindi';

      const crossLingual = this.generateCrossLingualQuery(clean);

      return {
        language: langCode,
        languageName: langName,
        isMultilingual: true,
        script: 'devanagari',
        crossLingualQuery: crossLingual,
      };
    }

    return {
      language: 'en',
      languageName: 'English',
      isMultilingual: false,
      script: 'latin',
      crossLingualQuery: clean,
    };
  }

  /**
   * Generates cross-lingual search query keywords from non-English text
   */
  generateCrossLingualQuery(text: string): string {
    const tokens = text
      .replace(/[।॥,.!?;:'"()[\]{}]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const translatedWords: string[] = [];
    for (const token of tokens) {
      if (MULTILINGUAL_LEXICON[token]) {
        translatedWords.push(MULTILINGUAL_LEXICON[token]);
      } else {
        // Check partial word stems
        let matched = false;
        for (const [key, val] of Object.entries(MULTILINGUAL_LEXICON)) {
          if (token.startsWith(key) || token.endsWith(key)) {
            translatedWords.push(val);
            matched = true;
            break;
          }
        }
        if (!matched && token.length > 3) {
          translatedWords.push(token);
        }
      }
    }

    return translatedWords.join(' ').trim() || text;
  }

  /**
   * Splits text into sentences respecting both Latin punctuation and Devanagari danda (।)
   */
  splitMultilingualSentences(text: string): string[] {
    const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!clean) return [];

    // Split on standard punctuation (. ! ?) and Devanagari danda (। or ॥)
    const rawSegments = clean.split(/(?<=[.!?।॥])\s+|\n+/);
    return rawSegments.map((s) => s.trim()).filter((s) => s.length > 0);
  }
}

export const languageDetector = new LanguageDetector();
