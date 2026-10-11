import { Router, Request, Response } from 'express';
import { claimExtractionRequestSchema } from '../validators/claimValidator.js';
import { claimExtractorService } from '../services/claimExtractor.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/extract', async (req: Request, res: Response): Promise<void> => {
  // Validate request body
  const validation = claimExtractionRequestSchema.safeParse(req.body);

  if (!validation.success) {
    const errorMessages = validation.error.issues.map((e) => e.message).join('; ');
    logger.warn('Validation failure on /api/claims/extract', { error: errorMessages });
    res.status(400).json({
      error: 'Invalid request',
      details: errorMessages,
    });
    return;
  }

  const { text } = validation.data;

  try {
    const result = await claimExtractorService.extractClaims(text);
    res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error during extraction';
    logger.error('Claim extraction error in route handler', { error: message });

    let userFriendlyDetails = message;
    try {
      const parsed = JSON.parse(message);
      if (parsed.error?.message) {
        userFriendlyDetails = parsed.error.message;
      }
    } catch {
      // not JSON, keep as is
    }

    if (message.includes('not configured')) {
      res.status(503).json({
        error: 'AI service configuration missing',
        details: userFriendlyDetails,
      });
      return;
    }

    if (message.includes('timed out')) {
      res.status(504).json({
        error: 'Extraction request timed out',
        details: 'The AI model took too long to respond. You can retry, or set LLM_PROVIDER=fallback in .env for instant local extraction.',
      });
      return;
    }

    if (message.includes('rate limit') || message.includes('429')) {
      res.status(429).json({
        error: 'AI service rate limit exceeded',
        details: 'Please wait a moment before submitting another request.',
      });
      return;
    }

    if (message.includes('Malformed') || message.includes('Invalid model response')) {
      res.status(502).json({
        error: 'Invalid response from AI model',
        details: userFriendlyDetails,
      });
      return;
    }

    res.status(500).json({
      error: 'Claim extraction failed',
      details: userFriendlyDetails,
    });
  }
});

router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  const { claims, mode, evidence_text, file_metadata, original_answer, answer } = req.body;

  if (!claims || !Array.isArray(claims) || claims.length === 0) {
    res.status(400).json({
      error: 'Invalid request',
      details: 'Claims must be a non-empty array of extracted claims to verify',
    });
    return;
  }

  try {
    const { claimVerifierService } = await import('../services/claimVerifier.js');
    const result = await claimVerifierService.verifyClaims(claims, {
      mode,
      evidence_text,
      file_metadata,
      original_answer: original_answer || answer,
    });
    res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown verification error';
    logger.error('Claim verification error in route handler', { error: message });
    res.status(500).json({
      error: 'Claim verification failed',
      details: message,
    });
  }
});

// Feature 4: Generate Detailed Evidence-Based Audit Report
router.post('/report', async (req: Request, res: Response): Promise<void> => {
  try {
    const { auditEngine } = await import('../services/audit/index.js');
    const response = await auditEngine.reporter.handleApiReportGeneration(req.body);
    res.status(response.status).json(response.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown report generation error';
    logger.error('Report generation error in route handler', { error: message });
    res.status(500).json({
      error: 'Report generation failed',
      details: message,
    });
  }
});

// Feature 4: Export Report to Printable HTML
router.post('/report/export-html', async (req: Request, res: Response): Promise<void> => {
  try {
    const { report } = req.body;
    if (!report || typeof report !== 'object') {
      res.status(400).json({ error: 'Valid report object required' });
      return;
    }
    const { auditEngine } = await import('../services/audit/index.js');
    const html = auditEngine.reporter.exportToHtml(report);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to export report HTML' });
  }
});

export default router;
