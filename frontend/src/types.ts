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
  tier?:
    | 'OFFICIAL_SOURCE'
    | 'GOVERNMENT'
    | 'ACADEMIC'
    | 'RESEARCH_JOURNAL'
    | 'FACT_CHECKER'
    | 'REFERENCE_ENCYCLOPEDIA'
    | 'MAINSTREAM_NEWS'
    | 'ORGANIZATION'
    | 'GENERAL_WEB'
    | 'SOCIAL_MEDIA'
    | 'UNTRUSTED'
    | string;
  domain?: string;
  credibilityScore?: number;
  similarityScore?: number;
  isIndependentGroupHead?: boolean;
  evidenceGroupId?: string;
}

export interface VerifiedClaim extends ExtractedClaim {
  verdict: Verdict;
  confidence: number;
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
  accuracy_score: number;
  average_confidence?: number;
  total_conflicts?: number;
}

export type ReasoningIssueType =
  | 'INTERNAL_CONTRADICTION'
  | 'UNSUPPORTED_CONCLUSION'
  | 'UNSUPPORTED_CAUSALITY'
  | 'INVALID_COMPARISON';

export type ReasoningSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ReasoningIssue {
  id: string;
  type: ReasoningIssueType;
  severity: ReasoningSeverity;
  claimIds: string[];
  premiseIds?: string[];
  conclusionId?: string;
  explanation: string;
  confidence: number;
}

export interface ReasoningAuditSummary {
  totalIssues: number;
  hasContradictions: boolean;
  hasUnsupportedConclusions: boolean;
  hasUnsupportedCausality: boolean;
  hasInvalidComparisons: boolean;
  reasoningScore: number;
  assessment: string;
}

export interface ClaimVerificationResponse {
  verified_claims: VerifiedClaim[];
  summary: VerificationSummary;
  reasoning_issues?: ReasoningIssue[];
  reasoning_summary?: ReasoningAuditSummary;
  metadata?: {
    processing_time_ms: number;
    provider?: string;
  };
}

export interface ClaimExtractionResponse {
  claims: ExtractedClaim[];
  total_claims: number;
  metadata?: {
    processing_time_ms: number;
    provider?: string;
  };
}

export interface ApiErrorResponse {
  error: string;
  details?: string;
}
