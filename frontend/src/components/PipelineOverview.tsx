import React from 'react';
import {
  FileText,
  Search,
  Filter,
  Layers,
  ShieldCheck,
  Award,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

export type PipelineStage = 'input' | 'extraction' | 'extracted' | 'verifying' | 'verified' | 'reported';

interface PipelineOverviewProps {
  currentStage: PipelineStage;
}

export const PipelineOverview: React.FC<PipelineOverviewProps> = ({ currentStage }) => {
  const getStepStatus = (stepIndex: number) => {
    // Step 1: Claim Extraction
    // Step 2: Search & Retrieval
    // Step 3: Source Filtering
    // Step 4: Evidence Vector Ranking
    // Step 5: NLI Verification
    // Step 6: Final Audit Report
    switch (currentStage) {
      case 'input':
        return 'waiting';
      case 'extraction':
        return stepIndex === 1 ? 'active' : 'waiting';
      case 'extracted':
        return stepIndex === 1 ? 'completed' : 'waiting';
      case 'verifying':
        if (stepIndex === 1) return 'completed';
        if (stepIndex <= 5) return 'active';
        return 'waiting';
      case 'verified':
        if (stepIndex <= 5) return 'completed';
        return 'waiting';
      case 'reported':
        return 'completed';
      default:
        return 'waiting';
    }
  };

  const steps = [
    {
      num: 1,
      title: 'Claim Extraction',
      approach: 'LLM + Sentence Splitting',
      icon: <FileText size={16} />,
      detail: 'Extracts check-worthy factual claims from AI response text',
    },
    {
      num: 2,
      title: 'Search / Retrieval',
      approach: 'Search API / Web Retrieval',
      icon: <Search size={16} />,
      detail: 'Retrieves current live web records, Wikipedia & indexed evidence',
    },
    {
      num: 3,
      title: 'Source Filtering',
      approach: 'Gov, Edu, Reuters, AP, Papers',
      icon: <Filter size={16} />,
      detail: 'Prioritizes peer-reviewed, gov, academic, and trusted press sources',
    },
    {
      num: 4,
      title: 'Evidence Ranking',
      approach: 'Embeddings + Vector Cosine',
      icon: <Layers size={16} />,
      detail: 'Semantic vector similarity ranking of chunked source passages',
    },
    {
      num: 5,
      title: 'NLI Verification',
      approach: 'SUPPORT · REFUTE · UNCERTAIN',
      icon: <ShieldCheck size={16} />,
      detail: 'Cross-encoder NLI entailment / contradiction assessment',
    },
    {
      num: 6,
      title: 'Final Audit Report',
      approach: 'Synthesized Audit & Risk Score',
      icon: <Award size={16} />,
      detail: 'Audit report with accuracy score, evidence breakdown, and print export',
    },
  ];

  return (
    <section className="pipeline-overview-card" aria-label="Auditing Pipeline Architecture">
      <div className="pipeline-header">
        <div className="pipeline-title-group">
          <Sparkles size={16} className="text-accent" />
          <h3 className="pipeline-title">Fact-Auditing Verification Architecture</h3>
        </div>
        <span className="pipeline-badge">
          6-Stage Grounded Pipeline
        </span>
      </div>

      <div className="pipeline-steps-grid">
        {steps.map((step) => {
          const status = getStepStatus(step.num);
          return (
            <div
              key={step.num}
              className={`pipeline-step-item status-${status}`}
              title={step.detail}
            >
              <div className="step-icon-wrapper">
                <span className="step-icon">{step.icon}</span>
                <span className="step-number">{step.num}</span>
              </div>
              <div className="step-info">
                <div className="step-title-row">
                  <h4 className="step-title">{step.title}</h4>
                  {status === 'completed' && <CheckCircle2 size={13} className="status-icon completed" />}
                  {status === 'active' && <Clock size={13} className="status-icon active spinning" />}
                </div>
                <p className="step-approach">{step.approach}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
