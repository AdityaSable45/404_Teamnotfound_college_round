import React from 'react';
import { History, X, RotateCcw, Trash2, Calendar, CheckCircle2, AlertTriangle, XCircle, ArrowUpRight } from 'lucide-react';
import { ClaimExtractionResponse, ClaimVerificationResponse } from '../types.js';

export interface AuditHistoryEntry {
  id: string;
  timestamp: number;
  inputText: string;
  snippet: string;
  claimsCount: number;
  accuracyScore: number;
  mode: 'quick' | 'deep' | 'research';
  extractionResult: ClaimExtractionResponse;
  verificationResult: ClaimVerificationResponse;
}

interface AuditHistoryModalProps {
  history: AuditHistoryEntry[];
  onRestore: (entry: AuditHistoryEntry) => void;
  onClear: () => void;
  onClose: () => void;
}

export const AuditHistoryModal: React.FC<AuditHistoryModalProps> = ({
  history,
  onRestore,
  onClear,
  onClose,
}) => {
  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Audit History">
      <div className="modal-dialog history-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title-group">
            <History size={18} className="modal-icon" />
            <div>
              <h3 className="modal-title">Audit History</h3>
              <p className="modal-subtitle">Previously executed factual verifications stored locally</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body history-modal-body">
          {history.length === 0 ? (
            <div className="history-empty-state">
              <History size={36} className="history-empty-icon" />
              <p className="history-empty-text">No audit history recorded yet.</p>
              <span className="history-empty-sub">
                Audits you execute will automatically be preserved here for reference and restoration.
              </span>
            </div>
          ) : (
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Audited Response Snippet</th>
                    <th>Claims</th>
                    <th>Result</th>
                    <th>Mode</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="history-row">
                      <td className="history-date-cell">
                        <span className="history-date">{formatDate(item.timestamp)}</span>
                      </td>
                      <td className="history-snippet-cell">
                        <span className="history-snippet" title={item.inputText}>
                          "{item.snippet}"
                        </span>
                      </td>
                      <td className="history-claims-cell">
                        <span className="history-claims-badge">{item.claimsCount} claims</span>
                      </td>
                      <td className="history-result-cell">
                        <span
                          className={`history-result-pill ${
                            item.accuracyScore >= 80
                              ? 'high'
                              : item.accuracyScore >= 50
                              ? 'medium'
                              : 'low'
                          }`}
                        >
                          {item.accuracyScore}% Accuracy
                        </span>
                      </td>
                      <td className="history-mode-cell">
                        <span className="history-mode-tag">{item.mode}</span>
                      </td>
                      <td className="history-actions-cell" style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-history-restore"
                          onClick={() => onRestore(item)}
                          title="Restore this audit to the workspace"
                        >
                          <RotateCcw size={12} />
                          <span>Restore</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer history-modal-footer">
          {history.length > 0 && (
            <button
              type="button"
              className="btn-clear-history"
              onClick={onClear}
            >
              <Trash2 size={13} />
              <span>Clear History</span>
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
