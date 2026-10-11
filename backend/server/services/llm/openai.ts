import OpenAI from 'openai';
import { LLMProvider } from './types.js';
import { CLAIM_EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from '../prompt.js';
import { logger } from '../../utils/logger.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName = 'gpt-4o-mini') {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    this.client = new OpenAI({ apiKey: key, timeout: 25000 });
    this.modelName = modelName;
  }

  async extractClaims(text: string): Promise<string> {
    const userPrompt = buildUserPrompt(text);
    logger.info('Calling OpenAI API for claim extraction', { model: this.modelName });

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: CLAIM_EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI API');
      }
      return content;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('OpenAI extraction failed', { error: errorMsg });
      throw err;
    }
  }
}
