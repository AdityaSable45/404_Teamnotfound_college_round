import React from 'react';
import { ShieldCheck, History, PlusCircle, Download, Zap, Search, GraduationCap } from 'lucide-react';

interface HeaderProps {
  currentRoute: 'audit' | 'how-it-works';
  onNavigate: (route: 'audit' | 'how-it-works') => void;
  onOpenHistory: () => void;
  historyCount: number;
  onNewAudit: () => void;
  hasContent: boolean;
  onExportReport?: () => void;
  hasReport?: boolean;
  auditMode: 'quick' | 'deep' | 'research';
  onChangeMode: (mode: 'quick' | 'deep' | 'research') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRoute,
  onNavigate,
  onOpenHistory,
  historyCount,
  onNewAudit,
  hasContent,
  onExportReport,
  hasReport,
  auditMode,
  onChangeMode,
}) => {
  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand */}
        <div className="brand" onClick={() => onNavigate('audit')} role="button" tabIndex={0}>
          <div className="brand-icon">
            <ShieldCheck size={20} strokeWidth={2.4} />
          </div>
          <div className="brand-text">
            <span className="brand-title">Second Opinion</span>
            <span className="brand-subtitle">Audit another AI.</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="header-nav" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-link ${currentRoute === 'audit' ? 'active' : ''}`}
            onClick={() => onNavigate('audit')}
          >
            Audit
          </button>
          <button
            type="button"
            className={`nav-link ${currentRoute === 'how-it-works' ? 'active' : ''}`}
            onClick={() => onNavigate('how-it-works')}
          >
            How It Works
          </button>
          <button
            type="button"
            className="nav-link history-nav-btn"
            onClick={onOpenHistory}
            title="View saved audit history"
          >
            <span>History</span>
            {historyCount > 0 && <span className="history-badge">{historyCount}</span>}
          </button>
        </nav>

        {/* Right Actions */}
        <div className="header-actions">
          {/* Audit Mode Quick Selector */}
          <div className="mode-segmented-control" role="group" aria-label="Audit Mode Selector">
            <button
              type="button"
              className={`mode-seg-btn ${auditMode === 'quick' ? 'active' : ''}`}
              onClick={() => onChangeMode('quick')}
              title="Quick Mode: 3 fast sources"
            >
              <Zap size={12} />
              <span>Quick</span>
            </button>
            <button
              type="button"
              className={`mode-seg-btn ${auditMode === 'deep' ? 'active' : ''}`}
              onClick={() => onChangeMode('deep')}
              title="Deep Mode: Multi-tier live web verification"
            >
              <Search size={12} />
              <span>Deep</span>
            </button>
            <button
              type="button"
              className={`mode-seg-btn ${auditMode === 'research' ? 'active' : ''}`}
              onClick={() => onChangeMode('research')}
              title="Research Mode: Prioritizes academic, official & encyclopedic sources"
            >
              <GraduationCap size={12} />
              <span>Research</span>
            </button>
          </div>

          {/* Export Report Action if available */}
          {hasReport && onExportReport && (
            <button
              type="button"
              className="header-btn secondary"
              onClick={onExportReport}
              title="View full synthesized audit report & export"
            >
              <Download size={13} />
              <span>Export</span>
            </button>
          )}

          {/* New Audit Action */}
          {hasContent && (
            <button
              type="button"
              className="header-btn primary"
              onClick={onNewAudit}
              title="Clear current workspace and start new audit"
            >
              <PlusCircle size={13} />
              <span>New Audit</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
