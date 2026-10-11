import React from 'react';
import {
  Binary,
  Atom,
  Landmark,
  Scale,
  GitBranch,
  Layers,
  FileCheck2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  Shield,
  Clock,
  Globe,
  BookOpen,
} from 'lucide-react';
import { ExtractedClaim, VerifiedClaim, ClaimType, Verdict, EvidenceSource } from '../types.js';

interface ClaimCardProps {
  claim: ExtractedClaim | VerifiedClaim;
  index: number;
}

export const ClaimCard: React.FC<ClaimCardProps> = ({ claim, index }) => {
  const verified = 'verdict' in claim ? (claim as VerifiedClaim) : null;

  const formatIndex = (idx: number) => {
    return (idx + 1).toString().padStart(2, '0');
  };

  const getVerdictBadge = (verdict: Verdict) => {
    switch (verdict) {
      case 'SUPPORTED':
        return (
          <span className="verdict-tag supported">
            <CheckCircle2 size={13} />
            <span>SUPPORTED</span>
          </span>
        );
      case 'REFUTED':
        return (
          <span className="verdict-tag refuted">
            <XCircle size={13} />
            <span>REFUTED</span>
          </span>
        );
      case 'MISLEADING':
        return (
          <span className="verdict-tag misleading">
            <AlertTriangle size={13} />
            <span>MISLEADING</span>
          </span>
        );
      default:
        return (
          <span className="verdict-tag unverifiable">
            <HelpCircle size={13} />
            <span>UNVERIFIABLE</span>
          </span>
        );
    }
  };

  const renderSourceTypeBadge = (src: EvidenceSource) => {
    const domain = (src.domain || '').toLowerCase();
    const url = (src.url || '').toLowerCase();
    const pub = (src.publisher || '').toLowerCase();

    // 1. Reference / Encyclopedia
    if (
      domain.includes('wikipedia.org') ||
      url.includes('wikipedia.org') ||
      domain.includes('britannica.com') ||
      url.includes('britannica.com') ||
      pub.includes('encyclopedia') ||
      src.tier === 'REFERENCE_ENCYCLOPEDIA'
    ) {
      return <span className="source-type-pill encyclopedia">Reference / Encyclopedia</span>;
    }

    // 2. Government / Official
    if (
      /\.(gov|mil)(\.[a-z]{2})?$/.test(domain) ||
      url.includes('.gov') ||
      domain.includes('parliament') ||
      domain.includes('museum') ||
      src.tier === 'GOVERNMENT' ||
      src.tier === 'OFFICIAL_SOURCE'
    ) {
      return <span className="source-type-pill government">Government</span>;
    }

    // 3. Academic
    if (
      src.tier === 'ACADEMIC' ||
      src.tier === 'RESEARCH_JOURNAL' ||
      /\.(edu|ac)(\.[a-z]{2})?$/.test(domain) ||
      url.includes('.edu') ||
      url.includes('nature.com') ||
      url.includes('science.org')
    ) {
      return <span className="source-type-pill academic">Academic</span>;
    }

    // 4. News
    if (
      src.tier === 'MAINSTREAM_NEWS' ||
      /^(?:www\.)?(?:reuters|bbc|nytimes|wsj|theguardian|bloomberg|apnews|washingtonpost)\./.test(domain)
    ) {
      return <span className="source-type-pill news">News</span>;
    }

    // Default
    return <span className="source-type-pill web">Web</span>;
  };

  return (
    <article
      id={`claim-${claim.id}`}
      className={`evidence-claim-card ${verified ? `verdict-${verified.verdict.toLowerCase()}` : ''}`}
      aria-label={`Claim ${formatIndex(index)}`}
    >
      {/* Top Header */}
      <div className="card-top-bar">
        <div className="card-id-group">
          <span className="card-index">Claim {formatIndex(index)}</span>
          <span className="claim-type-tag">{claim.claim_type}</span>

          {claim.temporal_context && claim.temporal_context.type !== 'TIMELESS' && (
            <span className="card-meta-pill" title="Temporal alignment">
              <Clock size={11} />
              <span>
                {claim.temporal_context.type === 'AS_OF' && `As-of ${claim.temporal_context.year || ''}`}
                {claim.temporal_context.type === 'HISTORICAL' && `Historical (${claim.temporal_context.year || ''})`}
                {claim.temporal_context.type === 'CURRENT' && 'Current'}
                {claim.temporal_context.type === 'FUTURE' && 'Future'}
              </span>
            </span>
          )}

          {claim.language && claim.language !== 'en' && (
            <span className="card-meta-pill" title="Cross-lingual normalized">
              <Globe size={11} />
              <span>{claim.language.toUpperCase()}</span>
            </span>
          )}

          {claim.uncertainty && claim.uncertainty.isUncertain && (
            <span className="card-meta-pill warning" title={claim.uncertainty.reasons.join(', ')}>
              <span>{claim.uncertainty.flags[0] || 'Uncertain'}</span>
            </span>
          )}
        </div>

        <div className="card-verdict-group">
          {verified ? (
            getVerdictBadge(verified.verdict)
          ) : (
            claim.check_worthy && (
              <span className="check-worthy-pill">
                <CheckCircle2 size={11} />
                <span>Check-Worthy</span>
              </span>
            )
          )}
        </div>
      </div>

      {/* Proposition Statement */}
      <div className="claim-statement-section">
        <blockquote className="claim-quote">"{claim.normalized_claim}"</blockquote>

        {claim.original_text !== claim.normalized_claim && (
          <div className="claim-original-ref">
            <span className="ref-label">Original excerpt:</span>
            <span className="ref-text">"{claim.original_text}"</span>
          </div>
        )}
      </div>

      {/* Verification Details */}
      {verified && (
        <div className="card-verification-block">
          <div className="verdict-confidence-bar">
            <div className="confidence-indicator">
              <span className="conf-label">Confidence:</span>
              <span className="conf-value">{verified.confidence}%</span>
              {verified.confidence_level && (
                <span className={`conf-badge ${verified.confidence_level.toLowerCase()}`}>
                  {verified.confidence_level}
                </span>
              )}
            </div>

            {verified.evidence_groups_count !== undefined && (
              <span className="independence-count">
                {verified.sources.length} sources ({verified.evidence_groups_count} independent groups)
              </span>
            )}
          </div>

          {verified.confidence_rationale && (
            <div className="confidence-rationale-note">
              {verified.confidence_rationale}
            </div>
          )}

          {/* Explanation Section */}
          <div className="card-section why-section">
            <h5 className="section-title">Why?</h5>
            <p className="section-text">{verified.explanation}</p>
          </div>

          {/* Section 9: "Why this claim is incorrect" for Refuted / Misleading claims */}
          {verified.why_is_this_wrong && (
            <div className="incorrect-audit-box">
              <div className="audit-box-header">
                <XCircle size={15} className="audit-header-icon" />
                <h5 className="audit-header-title">Why this claim is incorrect</h5>
              </div>

              <div className="audit-box-content">
                <div className="audit-row">
                  <span className="audit-row-label">Problem</span>
                  <p className="audit-row-text">{verified.why_is_this_wrong.summary}</p>
                </div>

                <div className="audit-row">
                  <span className="audit-row-label">Evidence</span>
                  <blockquote className="audit-evidence-quote">
                    "{verified.why_is_this_wrong.contradicting_evidence}"
                  </blockquote>
                </div>

                <div className="audit-row">
                  <span className="audit-row-label">Source</span>
                  <div className="audit-source-line">
                    <strong>{verified.why_is_this_wrong.key_counter_source}</strong>
                    <span className="audit-counter-conf">
                      ({verified.why_is_this_wrong.counter_confidence}% counter-confidence)
                    </span>
                  </div>
                </div>

                <div className="audit-row">
                  <span className="audit-row-label">Conclusion</span>
                  <p className="audit-row-text text-refuted-summary">
                    The claim conflicts directly with authoritative sources and should be considered refuted.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 11: Conflicting Evidence Clean Comparison Table */}
          {verified.conflict && verified.conflict.hasConflict && (
            <div className="evidence-conflict-panel">
              <div className="conflict-panel-header">
                <AlertTriangle size={14} className="conflict-header-icon" />
                <h5 className="conflict-title">Evidence Conflict</h5>
                <span className="conflict-severity-pill">{verified.conflict.severity} severity</span>
              </div>

              <p className="conflict-summary">{verified.conflict.explanation}</p>

              <div className="conflict-table-wrapper">
                <table className="conflict-table">
                  <thead>
                    <tr>
                      <th>Source Position</th>
                      <th>Evidence Count</th>
                      <th>Position Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Supporting Consensus</td>
                      <td>{verified.conflict.supportingCount} sources</td>
                      <td>
                        <span className="position-pill supports">Supports</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Contradicting Records</td>
                      <td>{verified.conflict.contradictingCount} sources</td>
                      <td>
                        <span className="position-pill contradicts">Contradicts</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 10: Evidence Sources Panel */}
          {verified.sources && verified.sources.length > 0 && (
            <div className="card-section evidence-panel">
              <h5 className="section-title">
                <BookOpen size={13} />
                <span>Evidence ({verified.sources.length})</span>
              </h5>

              <div className="evidence-list">
                {verified.sources.map((src, sIdx) => {
                  const isContradiction =
                    verified.verdict === 'REFUTED' ||
                    (src.snippet && src.snippet.toLowerCase().includes('not '));

                  return (
                    <div key={sIdx} className="evidence-item">
                      <div className="evidence-item-header">
                        <div className="source-identity">
                          {src.url ? (
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-link"
                            >
                              <span>{src.title}</span>
                              <ExternalLink size={11} />
                            </a>
                          ) : (
                            <span className="source-title-static">{src.title}</span>
                          )}
                          {renderSourceTypeBadge(src)}
                        </div>

                        <div className="source-status-tags">
                          {src.credibilityScore !== undefined && (
                            <span className="source-score" title="Domain authority / credibility score">
                              Trust: {src.credibilityScore}%
                            </span>
                          )}
                          <span
                            className={`source-position-badge ${
                              isContradiction ? 'contradicts' : 'supports'
                            }`}
                          >
                            {isContradiction ? 'Contradicts claim' : 'Supports claim'}
                          </span>
                        </div>
                      </div>

                      {src.snippet && (
                        <p className="evidence-excerpt">"{src.snippet}"</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unverified Reason Box */}
      {!verified && claim.reason && (
        <div className="unverified-reason">
          <HelpCircle size={13} />
          <span>{claim.reason}</span>
        </div>
      )}
    </article>
  );
};
