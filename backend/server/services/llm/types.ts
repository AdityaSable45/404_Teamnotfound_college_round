export interface LLMProvider {
  readonly name: string;
  extractClaims(text: string): Promise<string>;
}
