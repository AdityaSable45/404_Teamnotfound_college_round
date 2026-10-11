import { GoogleGenAI } from '@google/genai';
import { LLMProvider } from './types.js';
import { CLAIM_EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '../prompt.js';
import { logger } from '../../utils/logger.js';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  }

  async extractClaims(text: string): Promise<string> {
    const prompt = buildUserPrompt(text);
    logger.info('Calling Gemini API for claim extraction', { model: this.modelName });

    const timeoutMs = 35000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out')), timeoutMs)
    );

    const callPromise = this.ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        systemInstruction: CLAIM_EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    try {
      const response = await Promise.race([callPromise, timeoutPromise]);
      const resultText = response.text;
      if (!resultText) {
        throw new Error('Empty response from Gemini API');
      }
      return resultText;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Gemini extraction failed', { error: errorMsg });
      throw err;
    }
  }
}
