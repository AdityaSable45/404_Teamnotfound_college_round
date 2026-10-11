/**
 * Feature 3: Evidence-Based Claim Verification Using an NLI Model
 * Type definitions and contracts.
 */

export type NLILabel = 'ENTAILMENT' | 'CONTRADICTION' | 'NEUTRAL';

export type ClaimAssessment = 'SUPPORTED' | 'CONTRADICTED' | 'MIXED' | 'INCONCLUSIVE';

export interface NLIScores {
  entailment: number;
  contradiction: number;
  neutral: number;
}

export interface EvidenceItem {
  evidence_id: string;
  text: string;
  source_title: string;
  source_url: string;
  published_at?: string;
}

export interface ClaimVerificationRequest {
  claim_id: string;
  claim_text: string;
  evidence: EvidenceItem[];
}

export interface EvidenceComparisonResult {
  evidence_id: string;
  nli_label: NLILabel;
  scores: NLIScores;
  passage: string;
  source_title: string;
  source_url: string;
  published_at?: string;
}

export interface ClaimVerificationResult {
  claim_id: string;
  claim_text: string;
  assessment: ClaimAssessment;
  evidence_results: EvidenceComparisonResult[];
  explanation: string;
}

export interface NLIModelConfig {
  modelIdentifier: string;
  entailmentThreshold: number;
  contradictionThreshold: number;
  maxChunkLength: number;
  inferenceTimeoutMs: number;
}
