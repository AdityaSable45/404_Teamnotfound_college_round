import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../server/app.js';
import { MAX_INPUT_LENGTH } from '../server/validators/claimValidator.js';

describe('API Route: POST /api/claims/extract', () => {
  beforeAll(() => {
    process.env.LLM_PROVIDER = 'fallback';
  });
  it('returns 200 and structured claims for valid factual input', async () => {
    const res = await request(app)
      .post('/api/claims/extract')
      .send({
        text: "India's population exceeds 1.4 billion. New Delhi is the capital of India.",
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('claims');
    expect(res.body).toHaveProperty('total_claims');
    expect(Array.isArray(res.body.claims)).toBe(true);
    expect(res.body.total_claims).toBe(2);

    const firstClaim = res.body.claims[0];
    expect(firstClaim).toHaveProperty('id');
    expect(firstClaim).toHaveProperty('original_text');
    expect(firstClaim).toHaveProperty('normalized_claim');
    expect(firstClaim).toHaveProperty('claim_type');
    expect(firstClaim).toHaveProperty('check_worthy');
    expect(firstClaim).toHaveProperty('reason');
  });

  it('Case 7a: returns 400 when text input is empty or only whitespace', async () => {
    const res = await request(app)
      .post('/api/claims/extract')
      .send({ text: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.details).toContain('cannot be empty');
  });

  it('Case 7b: returns 400 when text input is missing', async () => {
    const res = await request(app)
      .post('/api/claims/extract')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('Case 7c: returns 400 when text exceeds maximum allowed length', async () => {
    const excessivelyLongText = 'A'.repeat(MAX_INPUT_LENGTH + 100);
    const res = await request(app)
      .post('/api/claims/extract')
      .send({ text: excessivelyLongText });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.details).toContain('exceeds maximum allowed length');
  });

  it('Case 6: returns 200 with 0 claims when text has no check-worthy assertions', async () => {
    const res = await request(app)
      .post('/api/claims/extract')
      .send({ text: 'Hello! Good morning. Hope you have a wonderful day.' });

    expect(res.status).toBe(200);
    expect(res.body.claims).toEqual([]);
    expect(res.body.total_claims).toBe(0);
  });

  it('returns health check status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  describe('API Route: POST /api/claims/verify', () => {
    it(
      'verifies extracted claims and returns verdicts, explanations, and sources',
      async () => {
        const claimsToVerify = [
          {
            id: 'claim_1',
            original_text: 'The Great Wall of China is visible from the Moon with the naked eye.',
            normalized_claim: 'The Great Wall of China is visible from the Moon with the naked eye.',
            claim_type: 'scientific',
          check_worthy: true,
          reason: 'Scientific assertion.',
        },
        {
          id: 'claim_2',
          original_text: 'New Delhi is the capital of India.',
          normalized_claim: 'New Delhi is the capital of India.',
          claim_type: 'political',
          check_worthy: true,
          reason: 'Geopolitical assertion.',
        },
      ];

      const res = await request(app)
        .post('/api/claims/verify')
        .send({ claims: claimsToVerify });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('verified_claims');
      expect(res.body).toHaveProperty('summary');
      expect(res.body.verified_claims.length).toBe(2);

      const greatWall = res.body.verified_claims.find((c: any) =>
        c.normalized_claim.includes('Great Wall')
      );
      expect(greatWall).toBeDefined();
      expect(greatWall.verdict).toBe('REFUTED');
      expect(greatWall.confidence).toBeGreaterThan(90);
      expect(greatWall.sources.length).toBeGreaterThan(0);

      const delhi = res.body.verified_claims.find((c: any) =>
        c.normalized_claim.includes('New Delhi')
      );
      expect(delhi).toBeDefined();
      expect(delhi.verdict).toBe('SUPPORTED');

      expect(res.body.summary.total).toBe(2);
      expect(res.body.summary.supported).toBe(1);
      expect(res.body.summary.refuted).toBe(1);
    }, 25000);

    it('returns 400 when claims array is empty or missing', async () => {
      const res = await request(app).post('/api/claims/verify').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid request');
    });
  });
});
