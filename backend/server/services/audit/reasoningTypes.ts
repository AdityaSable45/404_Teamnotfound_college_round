import type { ExtractedClaim, VerifiedClaim } from '../contracts.js';

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
  confidence: number; // 0 - 100 percentage
}

export interface ReasoningAuditInput {
  answer: string;
  claims: ExtractedClaim[];
  verifiedClaims?: VerifiedClaim[];
}

export type ReasoningAssessment = 'CONSISTENT' | 'NEEDS_REVIEW' | 'INCONSISTENT';

export interface ReasoningAuditSummary {
  totalIssues: number;
  byType: Record<ReasoningIssueType, number>;
  hasContradictions: boolean;
  hasUnsupportedConclusions: boolean;
  hasUnsupportedCausality: boolean;
  hasInvalidComparisons: boolean;
  reasoningScore: number; // 0 - 100
  assessment: ReasoningAssessment;
}

export interface ReasoningAuditResult {
  issues: ReasoningIssue[];
  summary: ReasoningAuditSummary;
  explanation: string;
}

export interface ReasoningProvider {
  readonly name: string;
  auditReasoning(input: ReasoningAuditInput): Promise<ReasoningIssue[]>;
}
