# Developer 2 Domain: Audit Pipeline

This folder isolates all LLM prompting, NLI fact-checking, and report explanation logic so you can work independently without creating Git merge conflicts.

## Components Owned
1. **Component 1: Claim Extraction** (`claimExtractor.ts`)
   - Extracts check-worthy factual claims from AI-generated text using LLM prompts & sentence decomposition.
2. **Component 5: Evidence-Based Claim Verification using NLI** (`nliVerifier.ts`, `nliAdapter.ts`, `nliAggregator.ts`, `nliTypes.ts`)
   - Natural Language Inference (NLI) model integration (`cross-encoder/nli-deberta-v3-base`).
   - Verified output label order: `0: CONTRADICTION`, `1: ENTAILMENT`, `2: NEUTRAL`.
   - Premise–Hypothesis mapping:
     - Premise: Retrieved evidence passage (with safe sentence chunking for long texts).
     - Hypothesis: Extracted factual claim.
   - Conservative aggregation logic:
     - Aggregates evidence passages across distinct sources (preventing single-source duplication bias).
     - Normalized claim-level assessments: `SUPPORTED`, `CONTRADICTED`, `MIXED`, `INCONCLUSIVE`.
   - Backward-compatible grounding facade with `verifyWithEvidence`.
3. **Feature 4 / Component 6: Detailed Evidence-Based Audit Report Generation** (`auditReporter.ts`, `reportGenerator.ts`, `reportTypes.ts`)
   - Generates full, professional evidence-backed audit reports.
   - Transparent rule-based overall assessment: `HIGH_RELIABILITY`, `MODERATE_RELIABILITY`, `LOW_RELIABILITY_WARNING`, `PARTIALLY_ASSESSED`, `INSUFFICIENT_EVIDENCE`.
   - Detailed claim-by-claim analysis with supporting, contradicting, and neutral evidence sections.
   - Traceable, clickable source links with publisher metadata without fabricating citations.
   - Comprehensive methodology and limitations disclosure.
   - Dual export formats: structured JSON export (`exportToJson`) and responsive, print-ready HTML (`exportToHtml` with `@media print` for browser "Print / Save as PDF").
   - Retains legacy `generateAuditReport(verifiedClaims, summary)` for 100% backward compatibility.
4. **LLM Providers** (`llm/`)
   - Abstractions for Gemini, OpenAI, and fallback local NLP.

## Public Export
All logic is exposed cleanly through `index.ts`:
```typescript
import { auditEngine } from './index.js';

// Feature 1: Claim Extraction
const extraction = await auditEngine.extractor.extractClaims(text);

// Feature 3: Evidence-Based Verification using NLI
const verificationResult = await auditEngine.verifier.verifyClaim({
  claim_id: 'claim_1',
  claim_text: 'The population is 1.5 million.',
  evidence: [
    {
      evidence_id: 'ev_1',
      text: 'The official report states that the population is 1.2 million.',
      source_title: 'Population Report',
      source_url: 'https://example.com/report',
    },
  ],
});

// Feature 4: Generate Detailed Evidence-Based Audit Report
const detailedReport = await auditEngine.reporter.generateDetailedReport({
  original_answer: 'Full AI text...',
  verified_claims: verifiedClaims,
  use_llm_summary: true, // Optional grounded executive summary synthesis
});

// Export to JSON or print-ready HTML
const jsonString = auditEngine.reporter.exportToJson(detailedReport);
const printHtml = auditEngine.reporter.exportToHtml(detailedReport);

// Backward-compatible methods
const legacyReport = auditEngine.reporter.generateAuditReport(verifiedClaims, summary);
const verification = await auditEngine.verifier.verifyWithEvidence(claim, sources);
```
