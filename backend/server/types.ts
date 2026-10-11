export type ClaimType =
  | 'numerical'
  | 'scientific'
  | 'historical'
  | 'political'
  | 'causal'
  | 'comparative'
  | 'general factual';

export interface ExtractedClaim {
  id: string;
  original_text: string;
  normalized_claim: string;
  claim_type: ClaimType;
  check_worthy: boolean;
  reason: string;
  offset_start?: number;
  offset_end?: number;
  language?: string;
  entities?: string[];
  relations?: string[];
  temporal_context?: {
    type: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'FUTURE' | 'TIMELESS';
    marker?: string;
    year?: number;
  };
  uncertainty?: {
    isUncertain: boolean;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    reasons: string[];
    flags: string[];
    explanation?: string;
  };
  depends_on?: string[];
}

export type Verdict = 'SUPPORTED' | 'REFUTED' | 'MISLEADING' | 'UNVERIFIABLE';

export interface EvidenceSource {
  title: string;
  url?: string;
  snippet: string;
  publisher?: string;
  tier?: string;
  domain?: string;
  credibilityScore?: number;
  similarityScore?: number;
  isIndependentGroupHead?: boolean;
  evidenceGroupId?: string;
}

export interface VerifiedClaim extends ExtractedClaim {
  verdict: Verdict;
  confidence: number; // 0 - 100
  confidence_level?: 'HIGH' | 'MODERATE' | 'LOW';
  confidence_rationale?: string;
  explanation: string;
  sources: EvidenceSource[];
  why_is_this_wrong?: {
    summary: string;
    contradicting_evidence: string;
    key_counter_source: string;
    counter_confidence: number;
  };
  conflict?: {
    hasConflict: boolean;
    supportingCount: number;
    contradictingCount: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  };
  evidence_groups_count?: number;
  total_sources_count?: number;
}

export interface VerificationSummary {
  total: number;
  supported: number;
  refuted: number;
  misleading: number;
  unverifiable: number;
  accuracy_score: number; // 0 - 100%
  average_confidence?: number;
  total_conflicts?: number;
}

export interface ClaimVerificationResponse {
  verified_claims: VerifiedClaim[];
  summary: VerificationSummary;
  detected_language?: string;
  audit_mode?: 'quick' | 'deep' | 'research' | 'manual' | 'web';
  reasoning_issues?: Array<{
    id: string;
    type: string;
    severity: string;
    claimIds: string[];
    explanation: string;
    confidence: number;
  }>;
  reasoning_summary?: {
    totalIssues: number;
    hasContradictions: boolean;
    hasUnsupportedConclusions: boolean;
    hasUnsupportedCausality: boolean;
    hasInvalidComparisons: boolean;
    reasoningScore: number;
    assessment: string;
  };
  metadata?: {
    processing_time_ms: number;
    provider?: string;
  };
}

export interface ClaimExtractionResponse {
  claims: ExtractedClaim[];
  total_claims: number;
  detected_language?: string;
  metadata?: {
    processing_time_ms: number;
    provider?: string;
  };
}

export interface ClaimExtractionRequest {
  text: string;
}

export interface ClaimVerificationRequest {
  claims: ExtractedClaim[];
}
