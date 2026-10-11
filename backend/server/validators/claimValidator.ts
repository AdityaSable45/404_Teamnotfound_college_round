import { z } from 'zod';
import { ClaimType } from '../types.js';

export const MAX_INPUT_LENGTH = 10000;

export const claimExtractionRequestSchema = z.object({
  text: z
    .string({
      required_error: 'Text input is required',
      invalid_type_error: 'Text input must be a string',
    })
    .trim()
    .min(1, 'Text input cannot be empty')
    .max(
      MAX_INPUT_LENGTH,
      `Text input exceeds maximum allowed length of ${MAX_INPUT_LENGTH} characters`
    ),
});

const VALID_CLAIM_TYPES: [ClaimType, ...ClaimType[]] = [
  'numerical',
  'scientific',
  'historical',
  'political',
  'causal',
  'comparative',
  'general factual',
];

export const normalizeClaimType = (type: string): ClaimType => {
  const normalized = type.toLowerCase().trim();
  if (normalized.includes('numeric') || normalized.includes('number') || normalized.includes('statistic')) {
    return 'numerical';
  }
  if (normalized.includes('scien') || normalized.includes('medical') || normalized.includes('astronom') || normalized.includes('physic')) {
    return 'scientific';
  }
  if (normalized.includes('histor')) {
    return 'historical';
  }
  if (normalized.includes('politic') || normalized.includes('govern') || normalized.includes('law')) {
    return 'political';
  }
  if (normalized.includes('caus')) {
    return 'causal';
  }
  if (normalized.includes('compar')) {
    return 'comparative';
  }
  return 'general factual';
};

export const singleClaimSchema = z.object({
  id: z.string().default(() => `claim_${Math.random().toString(36).substring(2, 9)}`),
  original_text: z.string().min(1, 'Original text cannot be empty'),
  normalized_claim: z.string().min(1, 'Normalized claim cannot be empty'),
  claim_type: z.string().transform(normalizeClaimType),
  check_worthy: z.boolean().default(true),
  reason: z.string().default('Factual assertion that can potentially be verified.'),
});

export const llmOutputSchema = z.object({
  claims: z.array(singleClaimSchema),
});
