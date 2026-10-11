import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import claimsRouter from './routes/claims.js';

import fs from 'node:fs';
import path from 'node:path';

dotenv.config();
const parentEnv = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(parentEnv)) {
  dotenv.config({ path: parentEnv });
}

export const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Root route explaining service and pointing to frontend UI
app.get('/', (_req, res) => {
  res.json({
    service: 'Second Opinion API',
    status: 'online',
    message: 'This is the backend API server. To use the interactive UI, open the frontend in your browser.',
    frontend_url: 'http://localhost:5174 or http://localhost:5173',
    endpoints: {
      health: 'GET /api/health',
      extract_claims: 'POST /api/claims/extract',
      verify_claims: 'POST /api/claims/verify',
    },
  });
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Second Opinion Claim Extraction API',
    timestamp: new Date().toISOString(),
  });
});

// Claims extraction routes
app.use('/api/claims', claimsRouter);

// Fallback 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
