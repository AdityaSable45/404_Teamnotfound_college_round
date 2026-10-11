# Second Opinion – Project Context

## Overview
Second Opinion is an AI-powered fact-auditing tool built to take a generated answer or paragraph, extract factual claims, and then verify those claims against real-world evidence before presenting a verdict. The project combines a React frontend, an Express API, and a claim extraction / evidence-verification pipeline.

This repo is currently in a feature-complete MVP state for the core workflow:
- extract check-worthy claims from input text
- verify each claim with live evidence retrieval
- classify claim status as SUPPORTED, REFUTED, MISLEADING, or UNVERIFIABLE
- show summaries, confidence scores, sources, and an overall audit score

## Work completed so far

### 1) Claim extraction feature
Implemented the core detection pipeline for identifying factual claims from natural-language text.

Key pieces:
- `server/services/claimExtractor.ts` — main extraction workflow
- `server/services/llm/*` — LLM provider abstraction for Gemini, OpenAI, and fallback logic
- `server/validators/claimValidator.ts` — request validation and structured output contract
- `server/routes/claims.ts` — `/api/claims/extract` API route

What it does:
- accepts raw text input
- strips unrelated opinion text and non-check-worthy statements
- normalizes claims
- assigns claim types such as numerical, political, scientific, and other factual categories
- validates model output to prevent malformed or fabricated responses
- falls back to a local NLP engine if upstream AI services are unavailable, rate-limited, or timing out

### 2) Claim verification feature
Built the verification pipeline to assess extracted claims against evidence.

Key pieces:
- `server/services/claimVerifier.ts` — main verification orchestration
- `server/services/retrieval/searchEngine.ts` — live web evidence search
- `server/services/verification/nliVerifier.ts` — evidence-grounded verdicting logic
- `server/types.ts` — typed claim and verification response structure

What it does:
- searches for current evidence using live retrieval sources
- evaluates each claim against the retrieved evidence
- assigns verdicts:
  - SUPPORTED
  - REFUTED
  - MISLEADING
  - UNVERIFIABLE
- includes confidence, explanations, source links, and summary stats
- calculates an audit accuracy score across the full set of claims

### 3) Live evidence + resilience improvements
Recent work specifically improves reliability and production-readiness:
- environment variables are reloaded dynamically so `.env` changes take effect without restarting the server
- the app automatically falls back to the local NLP engine when external model services are unavailable
- the verification layer moved away from mock/test-only outputs and now performs real web-based evidence lookup and NLI evaluation

### 4) Frontend audit UI
The browser app is implemented in React and lets a user:
- paste an answer or paragraph
- trigger extraction
- review claim cards
- verify claims with evidence-backed results
- view verdict badges and summary statistics

Key files:
- `src/App.tsx`
- `src/components/ClaimsList.tsx`
- `src/components/ClaimCard.tsx`
- `src/components/Header.tsx`
- `src/components/ClaimInputArea.tsx`

### 5) Testing and validation
The project includes automated test coverage for the major behaviors:
- `tests/claimExtractor.test.ts` — claim extraction quality and edge cases
- `tests/api.test.ts` — API endpoint validation and verification flow

These tests cover:
- valid extraction behavior
- whitespace / empty input validation
- malformed LLM responses
- empty claims and no-check-worthy text
- verdicting flow for supported vs refuted claims

## Recent commit history
The repo reflects these core feature milestones:

1. `c33f85e` — feat: replace mock verification with live web evidence search and real NLI evaluation
2. `84c843b` — feat: complete Claim Verification feature with verdicts, sources, and audit scoring
3. `ee71c27` — fix: add dynamic env reloading and automatic fallback resilience
4. `cae4371` — feat: implement Claim Extraction feature

## Current repository status
- Git working tree is clean
- The project is on the `main` branch tracking `origin/main`
- The main feature flow is implemented and testable

## Current architecture at a glance
```text
frontend/
  src/              -> React UI and components
  index.html        -> Vite entry page

backend/
  server/
    services/
      contracts.ts     -> Shared data contracts & types
      retrieval/       -> [Domain 1 - Data & Evidence]
        ├── searchEngine.ts        (2. Search API / web retrieval)
        ├── sourceFilter.ts        (3. Gov / edu / news source filtering)
        ├── vectorRetrieval.ts     (4. Embeddings & vector similarity)
        └── index.ts               (Public retrievalEngine facade)
      audit/           -> [Domain 2 - LLM & Reasoning]
        ├── claimExtractor.ts      (1. Claim extraction + sentence split)
        ├── nliVerifier.ts         (5. Grounded NLI verification)
        ├── auditReporter.ts       (6. Executive audit report generator)
        ├── llm/                   (Gemini, OpenAI, Fallback NLP)
        └── index.ts               (Public auditEngine facade)
  tests/            -> Vitest test suites
```

## Run the project
From the repo root:

```bash
npm install
npm run dev
```

This starts the backend and frontend together using the split folder structure.

## Main endpoints
- `GET /api/health`
- `POST /api/claims/extract`
- `POST /api/claims/verify`

## Notes for future work
The project currently has the core functionality in place. Likely next improvements would be:
- improve claim extraction precision for edge-case language
- add richer UI polish and filtering for claim verdicts
- expand evidence sources and ranking logic
- add persisted history / saved audits
- harden verification for ambiguous or controversial claims

## Summary
The repo is well past the initial prototype stage and is now functioning as a working AI fact-checking MVP with live evidence-based verification, structured claim extraction, resilience for provider failures, and a usable React interface.
