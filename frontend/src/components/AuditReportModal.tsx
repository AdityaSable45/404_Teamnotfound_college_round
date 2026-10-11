import React from 'react';
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  FileText,
  Brain,
} from 'lucide-react';
import type { DetailedAuditReport, ReportClaimItem } from '../../../backend/server/services/audit/reportTypes.js';

interface AuditReportModalProps {
  report: DetailedAuditReport;
  onClose: () => void;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({ report, onClose }) => {
  const handlePrint = () => {
    // Open print window with exported HTML for clean print-to-PDF
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      fetch('/api/claims/report/export-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report }),
      })
        .then((res) => res.text())
        .then((html) => {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 300);
        })
        .catch(() => {
          window.print();
        });
    } else {
      window.print();
    }
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${report.report_id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getStatusBadge = (status: string) => {
    const cleaned = status.replace(/_/g, ' ');
    if (status.includes('HIGH')) return <span className="report-status-badge high">{cleaned}</span>;
    if (status.includes('LOW')) return <span className="report-status-badge low">{cleaned}</span>;
    return <span className="report-status-badge medium">{cleaned}</span>;
  };

  const getAssessmentIcon = (assessment: string) => {
    switch (assessment) {
      case 'SUPPORTED':
        return <CheckCircle2 size={15} className="text-success" />;
      case 'CONTRADICTED':
        return <XCircle size={15} className="text-danger" />;
      case 'MIXED':
        return <AlertTriangle size={15} className="text-warning" />;
      default:
        return <HelpCircle size={15} className="text-muted" />;
    }
  };

  return (
    <div className="report-modal-backdrop" role="dialog" aria-modal="true">
      <div className="report-modal-content">
        {/* Modal Top Bar */}
        <div className="report-modal-header">
          <div className="report-modal-title-group">
            <div className="report-modal-title">
              <ShieldCheck size={22} className="report-icon" />
              <h2>{report.title}</h2>
            </div>
            <div className="report-modal-meta">
              <span>ID: <strong>{report.report_id}</strong></span> &bull;{' '}
              <span>Date: {new Date(report.created_at).toLocaleString()}</span>
            </div>
          </div>

          <div className="report-modal-actions">
            <button
              type="button"
              className="report-btn action-print"
              onClick={handlePrint}
              title="Print or Save as PDF"
            >
              <Printer size={16} />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              className="report-btn action-download"
              onClick={handleDownloadJson}
              title="Download JSON Report"
            >
              <Download size={16} />
              <span>JSON</span>
            </button>
            <button
              type="button"
              className="report-btn-close"
              onClick={onClose}
              aria-label="Close report modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="report-modal-scroll">
          {/* Status & Accuracy Banner */}
          <div className="report-overview-card">
            <div className="report-overview-left">
              {getStatusBadge(report.overall_assessment.status)}
              <div className="report-accuracy-score">
                <span className="accuracy-number">{report.overall_assessment.accuracy_score}%</span>
                <span className="accuracy-label">Accuracy Score</span>
              </div>
            </div>

            <div className="report-stats-grid">
              <div className="report-stat-item">
                <span className="stat-value">{report.statistics.total_claims}</span>
                <span className="stat-name">Total Claims</span>
              </div>
              <div className="report-stat-item">
                <span className="stat-value text-success">{report.statistics.supported}</span>
                <span className="stat-name">Supported</span>
              </div>
              <div className="report-stat-item">
                <span className="stat-value text-danger">{report.statistics.contradicted}</span>
                <span className="stat-name">Contradicted</span>
              </div>
              <div className="report-stat-item">
                <span className="stat-value text-warning">{report.statistics.mixed}</span>
                <span className="stat-name">Mixed</span>
              </div>
              <div className="report-stat-item">
                <span className="stat-value text-muted">{report.statistics.inconclusive}</span>
                <span className="stat-name">Inconclusive</span>
              </div>
            </div>
          </div>

          {/* Executive Summary & Key Findings */}
          <section className="report-section">
            <h3 className="report-section-heading">Executive Summary</h3>
            <p className="report-summary-text">{report.overall_assessment.summary}</p>
            {report.overall_assessment.key_findings.length > 0 && (
              <ul className="report-key-findings">
                {report.overall_assessment.key_findings.map((finding, idx) => (
                  <li key={idx}>{finding}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Reasoning Consistency Audit */}
          {report.reasoning_issues && report.reasoning_issues.length > 0 && (
            <section className="report-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Brain size={18} style={{ color: '#ea580c' }} />
                <h3 className="report-section-heading" style={{ margin: 0, color: '#9a3412' }}>
                  Reasoning Consistency Audit ({report.reasoning_issues.length} {report.reasoning_issues.length === 1 ? 'Issue' : 'Issues'})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {report.reasoning_issues.map((issue, idx) => (
                  <div
                    key={issue.id || idx}
                    style={{
                      background: '#fff7ed',
                      border: `1px solid ${issue.severity === 'HIGH' ? '#fca5a5' : '#fed7aa'}`,
                      borderRadius: '8px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: issue.severity === 'HIGH' ? '#b91c1c' : '#c2410c' }}>
                        {issue.type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '11px', background: '#ffedd5', color: '#9a3412', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        {issue.severity} &bull; {issue.confidence}% Confidence
                      </span>
                    </div>
                    <p style={{ margin: '0 0 6px 0', fontSize: '12.5px', color: '#431407' }}>
                      {issue.explanation}
                    </p>
                    <div style={{ fontSize: '11.5px', color: '#7c2d12' }}>
                      <strong>Claims involved:</strong> {issue.claimIds.join(' → ')}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Claim-by-Claim Breakdown */}
          <section className="report-section">
            <h3 className="report-section-heading">Detailed Claim-by-Claim Audit</h3>
            <div className="report-claims-stack">
              {report.claims.map((claim: ReportClaimItem) => (
                <div key={claim.claim_id} className="report-claim-card">
                  <div className="report-claim-card-header">
                    <div className="claim-title-wrapper">
                      <span className="claim-tag">Claim #{claim.claim_number}</span>
                      {claim.claim_type && (
                        <span className="claim-type-pill">{claim.claim_type}</span>
                      )}
                    </div>
                    <div className={`report-assessment-pill ${claim.assessment.toLowerCase()}`}>
                      {getAssessmentIcon(claim.assessment)}
                      <span>{claim.assessment}</span>
                    </div>
                  </div>

                  <p className="claim-statement">"{claim.original_text}"</p>
                  {claim.normalized_claim && claim.normalized_claim !== claim.original_text && (
                    <div className="normalized-claim-note">
                      <strong>Normalized:</strong> {claim.normalized_claim}
                    </div>
                  )}

                  <p className="claim-explanation">{claim.explanation}</p>

                  {/* Evidence Passages */}
                  {claim.evidence && claim.evidence.length > 0 ? (
                    <div className="report-evidence-list">
                      <h4 className="evidence-heading">Referenced Evidence ({claim.evidence.length}):</h4>
                      {claim.evidence.map((ev, evIdx) => (
                        <div key={ev.evidence_id || evIdx} className="report-evidence-entry">
                          <div className="evidence-source-line">
                            <span className="source-title-text">{ev.source_title}</span>
                            {ev.source_url && (
                              <a
                                href={ev.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="source-external-link"
                              >
                                View Source <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          {ev.passage && (
                            <div className="evidence-snippet">"{ev.passage}"</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-evidence-note">
                      <FileText size={14} />
                      <span>No retrieved evidence passages available for this claim.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Methodology & Limitations */}
          <section className="report-section methodology-box">
            <h3 className="report-section-heading">Methodology & Limitations</h3>
            <div className="methodology-grid">
              <div>
                <strong>Claim Extraction:</strong>
                <p>{report.methodology.claim_extraction}</p>
              </div>
              <div>
                <strong>Verification Model:</strong>
                <p><code>{report.methodology.verification_model}</code></p>
              </div>
            </div>
            <div className="limitations-list-wrapper">
              <strong>Audit Limitations:</strong>
              <ul>
                {report.methodology.limitations.map((limit, idx) => (
                  <li key={idx}>{limit}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
