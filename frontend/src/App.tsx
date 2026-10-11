import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { ClaimInputArea } from './components/ClaimInputArea.js';
import { ClaimsList } from './components/ClaimsList.js';
import { EmptyState } from './components/EmptyState.js';
import { ErrorAlert } from './components/ErrorAlert.js';
import { LoadingSkeleton } from './components/LoadingSkeleton.js';
import { ManualEvidenceUpload } from './components/ManualEvidenceUpload.js';
import { AuditReportModal } from './components/AuditReportModal.js';
import { AuditHistoryModal, AuditHistoryEntry } from './components/AuditHistoryModal.js';
import { HowItWorksPage } from './components/HowItWorksPage.js';
import { AuditHeroShowcase } from './components/AuditHeroShowcase.js';
import { ShieldCheck, ArrowRight, Zap, Search, GraduationCap } from 'lucide-react';
import type { DetailedAuditReport } from '../../backend/server/services/audit/reportTypes.js';
import {
  ClaimExtractionResponse,
  ClaimVerificationResponse,
} from './types.js';

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<'audit' | 'how-it-works'>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/how-it-works') {
      return 'how-it-works';
    }
    return 'audit';
  });

  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [auditReport, setAuditReport] = useState<DetailedAuditReport | null>(null);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);
  const [result, setResult] = useState<ClaimExtractionResponse | null>(null);
  const [verificationResult, setVerificationResult] = useState<ClaimVerificationResponse | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);

  // Feature 17: Audit Modes
  const [auditMode, setAuditMode] = useState<'quick' | 'deep' | 'research'>('deep');

  // Feature 15: LocalStorage Audit History
  const [auditHistory, setAuditHistory] = useState<AuditHistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Sync route with browser history
  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === '/how-it-works') {
        setCurrentRoute('how-it-works');
      } else {
        setCurrentRoute('audit');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (route: 'audit' | 'how-it-works') => {
    setCurrentRoute(route);
    const targetPath = route === 'how-it-works' ? '/how-it-works' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('second_opinion_audit_history');
      if (saved) {
        setAuditHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not read audit history:', e);
    }
  }, []);

  const saveToHistory = (
    text: string,
    mode: 'quick' | 'deep' | 'research',
    extResult: ClaimExtractionResponse,
    verResult: ClaimVerificationResponse
  ) => {
    try {
      const entry: AuditHistoryEntry = {
        id: 'audit_' + Date.now(),
        timestamp: Date.now(),
        inputText: text,
        snippet: text.slice(0, 140) + (text.length > 140 ? '...' : ''),
        claimsCount: verResult.verified_claims.length,
        accuracyScore: verResult.summary.accuracy_score,
        mode,
        extractionResult: extResult,
        verificationResult: verResult,
      };
      const saved = localStorage.getItem('second_opinion_audit_history');
      const existing: AuditHistoryEntry[] = saved ? JSON.parse(saved) : [];
      const updated = [entry, ...existing.filter((e) => e.inputText !== text)].slice(0, 25);
      localStorage.setItem('second_opinion_audit_history', JSON.stringify(updated));
      setAuditHistory(updated);
    } catch (e) {
      console.warn('Failed to save to audit history:', e);
    }
  };

  const handleClearHistory = () => {
    try {
      localStorage.removeItem('second_opinion_audit_history');
      setAuditHistory([]);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleRestoreEntry = (entry: AuditHistoryEntry) => {
    setInputText(entry.inputText);
    setResult(entry.extractionResult);
    setVerificationResult(entry.verificationResult);
    setAuditMode(entry.mode);
    setHasSubmitted(true);
    setShowHistoryModal(false);
    handleNavigate('audit');
  };

  const handleExtract = async () => {
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setVerificationResult(null);

    try {
      const response = await fetch('/api/claims/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: inputText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP error ${response.status}`);
      }

      setResult(data);
      setHasSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to extract claims from server';
      setError({
        message: 'Claim Extraction Failed',
        details: msg,
      });
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!result || !result.claims || result.claims.length === 0 || isVerifying) return;

    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch('/api/claims/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claims: result.claims,
          original_answer: inputText,
          mode: auditMode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP error ${response.status}`);
      }

      setVerificationResult(data);
      saveToHistory(inputText, auditMode, result, data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify claims';
      setError({
        message: 'Claim Verification Failed',
        details: msg,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyManual = async ({ files, text }: { files: File[]; text: string }) => {
    if (!result || !result.claims || result.claims.length === 0 || isVerifying) return;

    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch('/api/claims/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claims: result.claims,
          original_answer: inputText,
          mode: 'manual',
          evidence_text: text || undefined,
          file_metadata: files.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP error ${response.status}`);
      }

      setVerificationResult(data);
      saveToHistory(inputText, auditMode, result, data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify claims against manual sources';
      setError({
        message: 'Manual Source Verification Failed',
        details: msg,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!verificationResult || !verificationResult.verified_claims.length || isGeneratingReport) return;
    setIsGeneratingReport(true);
    setError(null);

    try {
      const response = await fetch('/api/claims/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_answer: inputText,
          verified_claims: verificationResult.verified_claims,
          reasoning_issues: verificationResult.reasoning_issues,
          reasoning_summary: verificationResult.reasoning_summary,
          use_llm_summary: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || `HTTP error ${response.status}`);
      }
      setAuditReport(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate audit report';
      setError({
        message: 'Report Generation Failed',
        details: msg,
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setResult(null);
    setVerificationResult(null);
    setAuditReport(null);
    setError(null);
    setHasSubmitted(false);
  };

  const handleLoadSample = (sampleText: string) => {
    setInputText(sampleText);
    setError(null);
    const inputEl = document.getElementById('ai-answer-input');
    if (inputEl) {
      inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inputEl.focus();
    }
  };

  const displayedClaims = verificationResult?.verified_claims || result?.claims || [];

  return (
    <div className="app-shell">
      <Header
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        onOpenHistory={() => setShowHistoryModal(true)}
        historyCount={auditHistory.length}
        onNewAudit={handleClear}
        hasContent={Boolean(inputText.trim() || result)}
        onExportReport={() => handleGenerateReport()}
        hasReport={Boolean(auditReport || verificationResult)}
        auditMode={auditMode}
        onChangeMode={setAuditMode}
      />

      <main className="main-content">
        {currentRoute === 'how-it-works' ? (
          <HowItWorksPage onNavigateAudit={() => handleNavigate('audit')} />
        ) : (
          <div className="audit-workspace">
            {/* Can you trust your AI? Hero Showcase with live typing & highlighting */}
            {!hasSubmitted && (
              <AuditHeroShowcase onLoadSample={handleLoadSample} />
            )}

            {/* Section 5: Header & Description for Workspace */}
            {hasSubmitted && (
              <section className="page-intro-header">
                <div className="intro-title-row">
                  <h2 className="workspace-title">Second Opinion</h2>
                  <span className="workspace-tagline">Audit another AI.</span>
                </div>
                <p className="workspace-description">
                  Verify AI-generated answers against evidence, reasoning, and source quality.
                </p>
              </section>
            )}

            {/* Input Area */}
            <ClaimInputArea
              text={inputText}
              onChange={(val) => {
                setInputText(val);
                if (error) setError(null);
              }}
              onSubmit={handleExtract}
              onClear={handleClear}
              isLoading={isLoading}
            />

            {error && (
              <ErrorAlert
                error={error.message}
                details={error.details}
                onRetry={handleExtract}
              />
            )}

            {isLoading && <LoadingSkeleton />}

            {!isLoading && hasSubmitted && result && (
              <>
                {result.total_claims > 0 ? (
                  <>
                    <ManualEvidenceUpload
                      claimsCount={result.total_claims}
                      isVerifying={isVerifying}
                      onVerifyWeb={handleVerify}
                      onVerifyManual={handleVerifyManual}
                    />

                    <ClaimsList
                      claims={displayedClaims}
                      originalAnswer={inputText}
                      processingTimeMs={
                        verificationResult?.metadata?.processing_time_ms ??
                        result.metadata?.processing_time_ms
                      }
                      providerName={
                        verificationResult?.metadata?.provider ?? result.metadata?.provider
                      }
                      onGenerateReport={handleGenerateReport}
                      isGeneratingReport={isGeneratingReport}
                      summary={verificationResult?.summary}
                      reasoningIssues={verificationResult?.reasoning_issues}
                      reasoningSummary={verificationResult?.reasoning_summary}
                      onVerify={handleVerify}
                      isVerifying={isVerifying}
                    />
                  </>
                ) : (
                  <EmptyState />
                )}
              </>
            )}

            {auditReport && (
              <AuditReportModal
                report={auditReport}
                onClose={() => setAuditReport(null)}
              />
            )}
          </div>
        )}
      </main>

      {showHistoryModal && (
        <AuditHistoryModal
          history={auditHistory}
          onRestore={handleRestoreEntry}
          onClear={handleClearHistory}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </div>
  );
};

export default App;
