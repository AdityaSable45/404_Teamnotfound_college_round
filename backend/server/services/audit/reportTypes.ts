import type { NLILabel, ClaimAssessment } from './nliTypes.js';
import type { ExtractedClaim, VerifiedClaim, EvidenceSource, Verdict } from '../contracts.js';
import type {
  ReasoningIssue,
  ReasoningAuditSummary,
  ReasoningIssueType,
  ReasoningSeverity,
  ReasoningAssessment,
} from './reasoningTypes.js';

export type {
  ReasoningIssue,
  ReasoningAuditSummary,
  ReasoningIssueType,
  ReasoningSeverity,
  ReasoningAssessment,
};

export type OverallReportStatus =
  | 'HIGH_RELIABILITY'
  | 'MODERATE_RELIABILITY'
  | 'LOW_RELIABILITY_WARNING'
  | 'PARTIALLY_ASSESSED'
  | 'INSUFFICIENT_EVIDENCE';

export interface ReportEvidenceItem {
  evidence_id: string;
  source_title: string;
  source_url: string;
  publisher?: string;
  published_at?: string;
  passage: string;
  nli_label: NLILabel;
  scores?: {
    entailment: number;
    contradiction: number;
    neutral: number;
  };
}

export interface ReportClaimItem {
  claim_id: string;
  claim_number: number;
  original_text: string;
  normalized_claim?: string;
  claim_type?: string;
  assessment: ClaimAssessment;
  explanation: string;
  evidence: ReportEvidenceItem[];
  supporting_evidence: ReportEvidenceItem[];
  contradicting_evidence: ReportEvidenceItem[];
  neutral_evidence: ReportEvidenceItem[];
  limitations: string[];
  confidence?: number;
  confidence_level?: string;
  confidence_rationale?: string;
  why_is_this_wrong?: any;
  conflict?: any;
  uncertainty?: any;
  temporal_context?: any;
}

export interface ReportStatistics {
  total_claims: number;
  assessed_claims: number;
  supported: number;
  contradicted: number;
  mixed: number;
  inconclusive: number;
  not_assessed: number;
  accuracy_score: number; // 0 - 100
}

export interface OverallAssessment {
  status: OverallReportStatus;
  summary: string;
  accuracy_score: number;
  key_findings: string[];
}

export interface ReportMethodology {
  claim_extraction: string;
  evidence_retrieval: string;
  verification_model: string;
  aggregation_approach: string;
  limitations: string[];
}

export interface DetailedAuditReport {
  report_id: string;
  title: string;
  created_at: string;
  original_answer: string;
  overall_assessment: OverallAssessment;
  statistics: ReportStatistics;
  claims: ReportClaimItem[];
  reasoning_issues?: ReasoningIssue[];
  reasoning_summary?: ReasoningAuditSummary;
  sources_summary: {
    total_distinct_sources: number;
    distinct_domains: string[];
  };
  methodology: ReportMethodology;
  export_metadata: {
    version: string;
    printable: boolean;
  };
}

export interface ReportGenerationInput {
  original_answer: string;
  claims?: ExtractedClaim[];
  verified_claims?: VerifiedClaim[];
  reasoning_issues?: ReasoningIssue[];
  reasoning_summary?: ReasoningAuditSummary;
  report_id?: string;
  custom_limitations?: string[];
  use_llm_summary?: boolean;
}
