import {
  ClaimType,
  ExtractedClaim,
  Verdict,
  EvidenceSource,
  VerifiedClaim,
  VerificationSummary,
  ClaimExtractionResponse,
  ClaimVerificationResponse,
} from '../types.js';

export type {
  ClaimType,
  ExtractedClaim,
  Verdict,
  EvidenceSource,
  VerifiedClaim,
  VerificationSummary,
  ClaimExtractionResponse,
  ClaimVerificationResponse,
};

// ==========================================
// Component 3: Source Filtering Contracts
// ==========================================
export type SourceTier =
  | 'OFFICIAL_SOURCE'
  | 'GOVERNMENT'        // .gov, .mil, official international bodies (WHO, UN)
  | 'ACADEMIC'          // .edu, scientific publishers (Nature, Science, arXiv)
  | 'RESEARCH_JOURNAL'  // Peer-reviewed publications
  | 'FACT_CHECKER'      // Reuters Fact Check, AP Fact Check, Snopes, PolitiFact
  | 'REFERENCE_ENCYCLOPEDIA' // Britannica, Wikipedia, Stanford Encyclopedia
  | 'MAINSTREAM_NEWS'   // BBC, NYT, WSJ, Bloomberg, etc.
  | 'ORGANIZATION'      // IEEE, W3C, ISO, Red Cross, NGOs
  | 'GENERAL_WEB'       // Other general web sources
  | 'SOCIAL_MEDIA'      // Reddit, Twitter, Quora, Zhihu
  | 'UNTRUSTED';        // Discredited blogs, content farms, spam domains

export interface FilteredSource extends EvidenceSource {
  tier: SourceTier;
  domain: string;
  isWhitelisted: boolean;
  credibilityScore: number; // 0 - 100
}

// ==========================================
// Component 4: Evidence Retrieval & Vectors
// ==========================================
export interface EvidenceChunk {
  id: string;
  claimId: string;
  sourceUrl?: string;
  sourceTitle: string;
  publisher?: string;
  text: string;
  similarityScore: number; // 0 - 1 (Cosine similarity)
  tier: SourceTier;
}

// ==========================================
// Component 5: Verification Contracts
// ==========================================
export interface GroundedVerificationResult {
  claimId: string;
  verdict: Verdict;
  confidence: number; // 0 - 100
  explanation: string;
  groundedChunks: EvidenceChunk[];
}

// ==========================================
// Component 6: Explanation & Audit Report
// ==========================================
export interface AuditReport {
  title: string;
  generatedAt: string;
  overallAccuracyScore: number; // 0 - 100%
  executiveSummary: string;
  verdictBreakdown: {
    supported: number;
    refuted: number;
    misleading: number;
    unverifiable: number;
    total: number;
  };
  claimsAudit: VerifiedClaim[];
  keyRiskFactors: string[];
  reasoningIssues?: any[];
  reasoningSummary?: any;
}
