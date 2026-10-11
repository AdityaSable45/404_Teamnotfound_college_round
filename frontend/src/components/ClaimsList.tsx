import React, { useState } from 'react';
import { ClaimCard } from './ClaimCard.js';
import { InteractiveHeatmap } from './InteractiveHeatmap.js';
import {
  ExtractedClaim,
  VerifiedClaim,
  VerificationSummary,
  ReasoningIssue,
  ReasoningAuditSummary,
} from '../types.js';
import {
  CheckCircle2,
  ShieldCheck,
  XCircle,
  AlertTriangle,
  FileText,
  Brain,
  LayoutGrid,
  Columns,
  HelpCircle,
  Check,
} from 'lucide-react';

interface ClaimsListProps {
  claims: (ExtractedClaim | VerifiedClaim)[];
  originalAnswer?: string;
  processingTimeMs?: number;
  providerName?: string;
  onVerify?: () => void;
  isVerifying?: boolean;
  onGenerateReport?: () => void;
  isGeneratingReport?: boolean;
  summary?: VerificationSummary;
  reasoningIssues?: ReasoningIssue[];
  reasoningSummary?: ReasoningAuditSummary;
}

export type ClaimFilterType = 'ALL' | 'SUPPORTED' | 'REFUTED' | 'MISLEADING' | 'UNVERIFIABLE' | 'REASONING';

export const ClaimsList: React.FC<ClaimsListProps> = ({
  claims,
  originalAnswer,
  processingTimeMs,
  providerName,
  onVerify,
  isVerifying,
  onGenerateReport,
  isGeneratingReport,
  summary,
  reasoningIssues,
  reasoningSummary,
}) => {
  const isVerified = Boolean(summary);
  const [activeFilter, setActiveFilter] = useState<ClaimFilterType>('ALL');
  const [viewMode, setViewMode] = useState<'SIDE_BY_SIDE' | 'CARDS'>('SIDE_BY_SIDE');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  // Filtered claims computation
  const filteredClaims = claims.filter((claim) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'REASONING') {
      const issueClaimIds = new Set((reasoningIssues || []).flatMap((i) => i.claimIds));
      return issueClaimIds.has(claim.id);
    }
    if ('verdict' in claim) {
      return (claim as VerifiedClaim).verdict === activeFilter;
    }
    return true;
  });

  const needsReviewCount = summary ? (summary.misleading || 0) + (summary.unverifiable || 0) : 0;
  const confidenceDisplay = summary
    ? summary.average_confidence !== undefined
      ? `${summary.average_confidence}%`
      : `${summary.accuracy_score}%`
    : '—';

  return (
    <section className="results-section" aria-label="Audit Results">
      {/* Feature 6: Compact Audit Summary Cards */}
      {summary && (
        <div className="audit-summary-panel">
          <div className="summary-header">
            <div>
              <h3 className="summary-title">Audit Summary</h3>
              <p className="summary-subtitle">Empirical verification against authoritative evidence and logical consistency</p>
            </div>

            {onGenerateReport && (
              <button
                type="button"
                className="btn-report"
                onClick={onGenerateReport}
                disabled={isGeneratingReport}
              >
                {isGeneratingReport ? (
                  <>
                    <div className="btn-spinner" />
                    <span>Synthesizing Report...</span>
                  </>
                ) : (
                  <>
                    <FileText size={14} />
                    <span>Full Audit Report</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="metric-cards-grid">
            <div className="metric-card">
              <span className="metric-label">Claims</span>
              <span className="metric-value">{summary.total}</span>
              <span className="metric-sub">Isolated propositions</span>
            </div>

            <div className="metric-card metric-supported">
              <span className="metric-label">Supported</span>
              <div className="metric-value-row">
                <span className="metric-value">{summary.supported}</span>
                <CheckCircle2 size={16} className="metric-icon" />
              </div>
              <span className="metric-sub">Empirically entailed</span>
            </div>

            <div className="metric-card metric-refuted">
              <span className="metric-label">Refuted</span>
              <div className="metric-value-row">
                <span className="metric-value">{summary.refuted}</span>
                <XCircle size={16} className="metric-icon" />
              </div>
              <span className="metric-sub">Contradicted by evidence</span>
            </div>

            <div className="metric-card metric-review">
              <span className="metric-label">Needs Review</span>
              <div className="metric-value-row">
                <span className="metric-value">{needsReviewCount}</span>
                <AlertTriangle size={16} className="metric-icon" />
              </div>
              <span className="metric-sub">{summary.misleading} misleading, {summary.unverifiable} unverified</span>
            </div>

            <div className="metric-card metric-confidence">
              <span className="metric-label">Overall Confidence</span>
              <span className="metric-value">{confidenceDisplay}</span>
              <span className="metric-sub">{summary.accuracy_score}% factual accuracy</span>
            </div>
          </div>
        </div>
      )}

      {/* Reasoning Consistency Checks Banner */}
      {isVerified && reasoningIssues && reasoningIssues.length > 0 && (
        <div className="reasoning-alert-card">
          <div className="reasoning-alert-header">
            <div className="reasoning-title-group">
              <Brain size={18} className="reasoning-icon" />
              <h4>Reasoning Consistency Issues</h4>
            </div>
            <span className="reasoning-count-badge">
              {reasoningIssues.length} {reasoningIssues.length === 1 ? 'logical flaw' : 'logical flaws'} detected
            </span>
          </div>

          <div className="reasoning-issues-list">
            {reasoningIssues.map((issue, idx) => {
              const typeLabel = issue.type.replace(/_/g, ' ');
              return (
                <div key={issue.id || idx} className="reasoning-issue-item">
                  <div className="issue-meta">
                    <span className="issue-type">{typeLabel}</span>
                    <span className="issue-confidence">Confidence: {issue.confidence}%</span>
                  </div>
                  <p className="issue-desc">{issue.explanation}</p>
                  <div className="issue-claims">
                    <span className="issue-claims-label">Involved Claims:</span>
                    <span className="issue-claims-chips">
                      {issue.claimIds.map((cId) => (
                        <code key={cId}>{cId}</code>
                      ))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isVerified && (!reasoningIssues || reasoningIssues.length === 0) && (
        <div className="reasoning-valid-card">
          <Check size={16} className="valid-icon" />
          <span>
            <strong>Reasoning Consistency:</strong> Internal deductive logic is valid; no logical leaps or contradictions detected.
          </span>
        </div>
      )}

      {/* Filter Pills Toolbar & View Mode Toggle */}
      <div className="results-toolbar">
        <div className="filter-pills-group">
          <span className="filter-group-label">Filter:</span>

          <button
            type="button"
            className={`filter-pill ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            <span>All</span>
            <span className="pill-count">{claims.length}</span>
          </button>

          {isVerified && (
            <>
              <button
                type="button"
                className={`filter-pill pill-supported ${activeFilter === 'SUPPORTED' ? 'active' : ''}`}
                onClick={() => setActiveFilter('SUPPORTED')}
              >
                <CheckCircle2 size={12} />
                <span>Supported</span>
                <span className="pill-count">{summary?.supported || 0}</span>
              </button>

              <button
                type="button"
                className={`filter-pill pill-refuted ${activeFilter === 'REFUTED' ? 'active' : ''}`}
                onClick={() => setActiveFilter('REFUTED')}
              >
                <XCircle size={12} />
                <span>Refuted</span>
                <span className="pill-count">{summary?.refuted || 0}</span>
              </button>

              {(summary?.misleading || 0) > 0 && (
                <button
                  type="button"
                  className={`filter-pill pill-misleading ${activeFilter === 'MISLEADING' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('MISLEADING')}
                >
                  <AlertTriangle size={12} />
                  <span>Misleading</span>
                  <span className="pill-count">{summary?.misleading || 0}</span>
                </button>
              )}

              <button
                type="button"
                className={`filter-pill pill-unverifiable ${activeFilter === 'UNVERIFIABLE' ? 'active' : ''}`}
                onClick={() => setActiveFilter('UNVERIFIABLE')}
              >
                <HelpCircle size={12} />
                <span>Unverifiable</span>
                <span className="pill-count">{summary?.unverifiable || 0}</span>
              </button>

              {(reasoningIssues?.length || 0) > 0 && (
                <button
                  type="button"
                  className={`filter-pill pill-reasoning ${activeFilter === 'REASONING' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('REASONING')}
                >
                  <Brain size={12} />
                  <span>Reasoning</span>
                  <span className="pill-count">{reasoningIssues?.length || 0}</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* View Mode Switch */}
        {originalAnswer && (
          <div className="view-toggle-group">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'SIDE_BY_SIDE' ? 'active' : ''}`}
              onClick={() => setViewMode('SIDE_BY_SIDE')}
              title="Side-by-Side: Answer heatmap alongside claim cards"
            >
              <Columns size={13} />
              <span>Side-by-Side</span>
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'CARDS' ? 'active' : ''}`}
              onClick={() => setViewMode('CARDS')}
              title="Cards Only view"
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
          </div>
        )}
      </div>

      {/* Subheading with Count & Meta */}
      <div className="claims-meta-header">
        <div className="claims-heading">
          <h4>{isVerified ? 'Evidence-Audited Claims' : 'Extracted Claims'}</h4>
          <span className="claims-count-sub">
            Showing {filteredClaims.length} of {claims.length} claims
          </span>
        </div>

        <div className="claims-engine-info">
          {onVerify && !isVerified && (
            <button
              type="button"
              className="btn-verify-primary"
              onClick={onVerify}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <div className="btn-spinner" />
                  <span>Verifying Sources...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>Verify All Claims</span>
                </>
              )}
            </button>
          )}

          {providerName && (
            <span className="engine-tag">Engine: {providerName}</span>
          )}
          {processingTimeMs !== undefined && (
            <span className="engine-time">{processingTimeMs}ms</span>
          )}
        </div>
      </div>

      {/* Layout Grid */}
      {viewMode === 'SIDE_BY_SIDE' && originalAnswer ? (
        <div className="side-by-side-layout">
          <div className="side-by-side-heatmap-col">
            <InteractiveHeatmap
              originalAnswer={originalAnswer}
              claims={claims}
              onSelectClaim={(id) => setSelectedClaimId(id)}
              selectedClaimId={selectedClaimId}
            />
          </div>

          <div className="side-by-side-cards-col">
            {filteredClaims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                index={claims.findIndex((c) => c.id === claim.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="cards-stack-layout">
          {originalAnswer && (
            <div className="standalone-heatmap-wrapper">
              <InteractiveHeatmap
                originalAnswer={originalAnswer}
                claims={claims}
                onSelectClaim={(id) => setSelectedClaimId(id)}
                selectedClaimId={selectedClaimId}
              />
            </div>
          )}
          <div className="claims-grid">
            {filteredClaims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                index={claims.findIndex((c) => c.id === claim.id)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
