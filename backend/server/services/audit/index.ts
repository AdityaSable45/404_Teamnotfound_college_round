import {
  claimExtractorService,
  ClaimExtractionService,
  ExtractionOptions,
} from './claimExtractor.js';
import { nliVerifier, NLIVerifier, NLIResult } from './nliVerifier.js';
import { auditReporter, AuditReporter } from './auditReporter.js';
import type {
  NLILabel,
  ClaimAssessment,
  NLIScores,
  EvidenceItem,
  ClaimVerificationRequest,
  EvidenceComparisonResult,
  ClaimVerificationResult,
  NLIModelConfig,
} from './nliTypes.js';
import {
  type NLIModelAdapter,
  type NLIPair,
  DebertaCrossEncoderAdapter,
  debertaNLIAdapter,
  DEBERTA_V3_LABEL_MAPPING,
  softmax,
  chunkLongPassage,
} from './nliAdapter.js';
import {
  NLIAggregator,
  nliAggregator,
  extractSourceKey,
  type AggregatorOptions,
  type AggregationResult,
} from './nliAggregator.js';
import {
  ReportGenerator,
  reportGenerator,
  normalizeAssessment,
  formatEvidenceItem,
} from './reportGenerator.js';
import type {
  OverallReportStatus,
  ReportEvidenceItem,
  ReportClaimItem,
  ReportStatistics,
  OverallAssessment,
  ReportMethodology,
  DetailedAuditReport,
  ReportGenerationInput,
} from './reportTypes.js';

import {
  reasoningAuditor,
  ReasoningAuditor,
  RuleBasedReasoningProvider,
  GeminiReasoningProvider,
  OpenAIReasoningProvider,
  type ReasoningAuditorOptions,
} from './reasoningAuditor.js';
import type {
  ReasoningIssue,
  ReasoningIssueType,
  ReasoningSeverity,
  ReasoningAuditInput,
  ReasoningAuditSummary,
  ReasoningAuditResult,
  ReasoningProvider,
  ReasoningAssessment,
} from './reasoningTypes.js';

export {
  claimExtractorService,
  ClaimExtractionService,
  ExtractionOptions,
  nliVerifier,
  NLIVerifier,
  NLIResult,
  auditReporter,
  AuditReporter,
  // Feature 3: NLI Verification exports
  type NLILabel,
  type ClaimAssessment,
  type NLIScores,
  type EvidenceItem,
  type ClaimVerificationRequest,
  type EvidenceComparisonResult,
  type ClaimVerificationResult,
  type NLIModelConfig,
  type NLIModelAdapter,
  type NLIPair,
  DebertaCrossEncoderAdapter,
  debertaNLIAdapter,
  DEBERTA_V3_LABEL_MAPPING,
  softmax,
  chunkLongPassage,
  NLIAggregator,
  nliAggregator,
  extractSourceKey,
  type AggregatorOptions,
  type AggregationResult,
  // Feature 4: Audit Report Generation exports
  ReportGenerator,
  reportGenerator,
  normalizeAssessment,
  formatEvidenceItem,
  type OverallReportStatus,
  type ReportEvidenceItem,
  type ReportClaimItem,
  type ReportStatistics,
  type OverallAssessment,
  type ReportMethodology,
  type DetailedAuditReport,
  type ReportGenerationInput,
  // Feature 5: Reasoning Consistency Audit exports
  reasoningAuditor,
  ReasoningAuditor,
  RuleBasedReasoningProvider,
  GeminiReasoningProvider,
  OpenAIReasoningProvider,
  type ReasoningAuditorOptions,
  type ReasoningIssue,
  type ReasoningIssueType,
  type ReasoningSeverity,
  type ReasoningAuditInput,
  type ReasoningAuditSummary,
  type ReasoningAuditResult,
  type ReasoningProvider,
  type ReasoningAssessment,
};

export { languageDetector, LanguageDetector } from './languageDetector.js';
export { uncertaintyAnalyzer, UncertaintyAnalyzer } from './uncertaintyAnalyzer.js';
export { confidenceCalibrator, ConfidenceCalibrator } from './confidenceCalibrator.js';
export { temporalVerifier, TemporalVerifier } from './temporalVerifier.js';
export { conflictDetector, ConflictDetector } from './conflictDetector.js';
export { whyWrongGenerator, WhyWrongGenerator } from './whyWrongGenerator.js';
export { dependencyAnalyzer, DependencyAnalyzer } from './dependencyAnalyzer.js';

import { languageDetector } from './languageDetector.js';
import { uncertaintyAnalyzer } from './uncertaintyAnalyzer.js';
import { confidenceCalibrator } from './confidenceCalibrator.js';
import { temporalVerifier } from './temporalVerifier.js';
import { conflictDetector } from './conflictDetector.js';
import { whyWrongGenerator } from './whyWrongGenerator.js';
import { dependencyAnalyzer } from './dependencyAnalyzer.js';

/**
 * Facade for Audit domain services
 */
export const auditEngine = {
  extractor: claimExtractorService,
  verifier: nliVerifier,
  reporter: auditReporter,
  reportGenerator: reportGenerator,
  reasoning: reasoningAuditor,
  adapter: debertaNLIAdapter,
  aggregator: nliAggregator,
  language: languageDetector,
  uncertainty: uncertaintyAnalyzer,
  confidence: confidenceCalibrator,
  temporal: temporalVerifier,
  conflict: conflictDetector,
  whyWrong: whyWrongGenerator,
  dependency: dependencyAnalyzer,
};
