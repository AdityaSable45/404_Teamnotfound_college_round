import { describe, it, expect } from 'vitest';
import { ClaimExtractionService } from '../server/services/claimExtractor.js';
import { FallbackNLPProvider } from '../server/services/audit/llm/fallback.js';
import { LLMProvider } from '../server/services/audit/llm/types.js';

describe('Claim Extraction Service & NLP Engine', () => {
  const service = new ClaimExtractionService(new FallbackNLPProvider());

  // Test 1: A paragraph containing several factual claims
  it('Case 1: extracts multiple factual claims from a paragraph', async () => {
    const input =
      "India's population exceeds 1.4 billion. New Delhi is the capital of India. The Great Wall of China is visible from the Moon with the naked eye. This is an interesting fact.";
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBe(3);
    expect(result.total_claims).toBe(3);

    const claimsText = result.claims.map((c) => c.normalized_claim.toLowerCase());
    expect(claimsText.some((t) => t.includes('1.4 billion'))).toBe(true);
    expect(claimsText.some((t) => t.includes('new delhi'))).toBe(true);
    expect(claimsText.some((t) => t.includes('great wall of china'))).toBe(true);

    // Verify claim types
    const types = result.claims.map((c) => c.claim_type);
    expect(types).toContain('numerical');
    expect(types).toContain('political');
    expect(types).toContain('scientific');

    // Verify opinion was excluded
    expect(claimsText.some((t) => t.includes('interesting fact'))).toBe(false);
  });

  // Test 2: A sentence containing multiple factual assertions
  it('Case 2: separates multiple factual assertions from a compound sentence and resolves pronouns', async () => {
    const input =
      'Albert Einstein was born in 1879; he won the Nobel Prize in Physics in 1921.';
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBeGreaterThanOrEqual(2);
    const normalized = result.claims.map((c) => c.normalized_claim);

    expect(normalized.some((n) => n.includes('born in 1879'))).toBe(true);
    expect(
      normalized.some((n) => n.includes('Einstein') && n.includes('Nobel Prize in Physics'))
    ).toBe(true);
  });

  it('Case 2b: correctly resolves pronoun in coordinated clause without dropping subject', async () => {
    const input =
      "The capital of Australia is Sydney, and it is also the country's largest city.";
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBe(2);
    const normalized = result.claims.map((c) => c.normalized_claim);
    expect(normalized[0]).toBe('The capital of Australia is Sydney.');
    expect(normalized[1]).toBe("Sydney is also the country's largest city.");
  });

  it('Case 2c: extracts exactly 5 claims from the complete test paragraph', async () => {
    const input =
      "The capital of Australia is Sydney, and it is also the country's largest city. Australia became a federation in 1901, and Canberra was later established as the national capital. Sydney is located on the east coast of Australia and is famous for the Sydney Opera House and Harbour Bridge, while Canberra is located inland in the Australian Capital Territory.";
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBe(5);
    const claims = result.claims.map((c) => c.normalized_claim);
    expect(claims[0]).toBe('The capital of Australia is Sydney.');
    expect(claims[1]).toBe("Sydney is also the country's largest city.");
    expect(claims[2]).toBe('Australia became a federation in 1901.');
    expect(claims[3]).toBe('Canberra was later established as the national capital.');
    expect(claims[4]).toContain('Sydney is located on the east coast of Australia');
  });

  // Test 3: A mixture of factual statements and opinions
  it('Case 3: extracts factual statements while excluding pure opinions and subjective commentary', async () => {
    const input =
      'In my opinion, it is absurd that the treaty was signed in 1919. Paris is the capital of France. I think so.';
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBe(2);
    const claims = result.claims.map((c) => c.normalized_claim);

    // Opinion prefix removed, factual statement preserved
    expect(claims.some((c) => c.includes('The treaty was signed in 1919'))).toBe(true);
    expect(claims.some((c) => c.includes('Paris is the capital of France'))).toBe(true);

    // "I think so" must not be extracted
    expect(claims.some((c) => c.toLowerCase().includes('i think so'))).toBe(false);
  });

  // Test 4: A numerical claim containing dates or quantities
  it('Case 4: preserves numbers, dates, and quantities in numerical claims', async () => {
    const input =
      'The global human population reached 8 billion people on November 15, 2022.';
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBe(1);
    const claim = result.claims[0];
    expect(claim.claim_type).toBe('numerical');
    expect(claim.normalized_claim).toContain('8 billion');
    expect(claim.normalized_claim).toContain('November 15, 2022');
  });

  // Test 5: An uncertain assertion containing words such as "may", "allegedly", or "possibly"
  it('Case 5: preserves qualifying words and uncertainty markers without asserting them as absolute facts', async () => {
    const input =
      'Liquid water may possibly exist under the surface of Europa, and ancient organisms allegedly survived extreme conditions.';
    const result = await service.extractClaims(input);

    expect(result.claims.length).toBeGreaterThanOrEqual(1);
    const textCombined = result.claims.map((c) => c.normalized_claim).join(' ');

    expect(textCombined).toMatch(/may|possibly/i);
    expect(textCombined).toMatch(/allegedly/i);
  });

  // Test 6: Input containing no check-worthy claims
  it('Case 6: returns empty claims array when input contains no check-worthy factual assertions', async () => {
    const input =
      'Hello! Good morning. How can I help you today? I believe in kindness and hope you have a wonderful day.';
    const result = await service.extractClaims(input);

    expect(result.claims).toEqual([]);
    expect(result.total_claims).toBe(0);
  });

  // Test 7: Malformed LLM output handling
  it('Case 8a: handles malformed JSON from an LLM gracefully without fabricating claims', async () => {
    const mockMalformedProvider: LLMProvider = {
      name: 'mock-malformed',
      extractClaims: async () => 'Not a JSON response at all { broken',
    };

    const failingService = new ClaimExtractionService(mockMalformedProvider);

    await expect(
      failingService.extractClaims('Some test factual text.')
    ).rejects.toThrow(/Malformed model response/i);
  });

  // Test 8: LLM API failure / exception handling
  it('Case 8b: handles LLM service errors and rejects without fabricating claims', async () => {
    const mockFailingProvider: LLMProvider = {
      name: 'mock-failing',
      extractClaims: async () => {
        throw new Error('Upstream AI service unavailable');
      },
    };

    const failingService = new ClaimExtractionService(mockFailingProvider);

    await expect(
      failingService.extractClaims('Some test factual text.')
    ).rejects.toThrow(/Upstream AI service unavailable/i);
  });
});
