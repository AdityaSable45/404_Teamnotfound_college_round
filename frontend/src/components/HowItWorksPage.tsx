import React from 'react';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Brain,
  ShieldAlert,
  Sliders,
  Crosshair,
  FileCheck,
  LayoutDashboard,
  ArrowRight,
  ArrowDown,
  Globe,
  Scale,
  BookOpen,
  Check,
} from 'lucide-react';

interface HowItWorksPageProps {
  onNavigateAudit: () => void;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onNavigateAudit }) => {
  const pipelineStages = [
    { num: '01', title: 'AI-Generated Answer', desc: 'Raw model output containing factual and logical assertions.', icon: <FileText size={16} /> },
    { num: '02', title: 'Claim Extraction', desc: 'Decomposes complex paragraphs into standalone, check-worthy claims.', icon: <Crosshair size={16} /> },
    { num: '03', title: 'Claim Normalization', desc: 'Converts claims into atomic, testable propositions without pronouns.', icon: <FileCheck size={16} /> },
    { num: '04', title: 'Language Detection', desc: 'Detects script (Latin, Devanagari) and maps cross-lingual queries.', icon: <Globe size={16} /> },
    { num: '05', title: 'Evidence Retrieval', desc: 'Queries live web search, Wikipedia, and encyclopedic sources.', icon: <Search size={16} /> },
    { num: '06', title: 'Evidence Quality & Relevance', desc: 'Filters untrusted sources and clusters syndicated wire copies.', icon: <Filter size={16} /> },
    { num: '07', title: 'NLI Verification', desc: 'Evaluates empirical entailment, neutral sufficiency, or contradiction.', icon: <CheckCircle2 size={16} /> },
    { num: '08', title: 'Conflict Detection', desc: 'Identifies genuine disagreements between credible source tiers.', icon: <AlertTriangle size={16} /> },
    { num: '09', title: 'Reasoning Audit', desc: 'Audits multi-claim logic for non-sequiturs, contradictions, and causal gaps.', icon: <Brain size={16} /> },
    { num: '10', title: 'Uncertainty Analysis', desc: 'Flags epistemic hedges, approximations, and absolute generalizations.', icon: <ShieldAlert size={16} /> },
    { num: '11', title: 'Confidence Calibration', desc: 'Calibrates probability based on source quality and independent groups.', icon: <Sliders size={16} /> },
    { num: '12', title: 'Error Localization', desc: 'Maps verdicts to exact character offset spans in the original text.', icon: <Crosshair size={16} /> },
    { num: '13', title: 'Audit Report', desc: 'Generates structured synthesis, counter-explanations, and exports.', icon: <FileText size={16} /> },
    { num: '14', title: 'Interactive Dashboard', desc: 'Presents interactive side-by-side text heatmap and evidence cards.', icon: <LayoutDashboard size={16} /> },
  ];

  const stageDescriptions = [
    {
      num: '01',
      title: 'Claim Extraction',
      description: 'Breaks the AI response into individual factual claims. Sentences containing multiple assertions (e.g. coordinated conjunctions) are split into standalone claims while preserving original text boundaries.',
    },
    {
      num: '02',
      title: 'Claim Normalization',
      description: 'Converts claims into structured propositions so that the system can compare their actual semantic meaning rather than relying on superficial keyword overlap.',
    },
    {
      num: '03',
      title: 'Evidence Retrieval',
      description: 'Searches multiple sources—including live web retrieval, Wikipedia APIs, and scholarly repositories—to gather candidate evidence for each isolated proposition.',
    },
    {
      num: '04',
      title: 'Evidence Quality & Filtering',
      description: 'Evaluates domain authority, source tiers (Government, Academic, Reference Encyclopedia, Mainstream News), publication freshness, and groups syndicated wire stories into independent evidence clusters.',
    },
    {
      num: '05',
      title: 'Verification (Natural Language Inference)',
      description: 'Determines whether retrieved evidence strictly entails, explicitly contradicts, or fails to establish each proposition. Semantic similarity is never treated as proof of truth.',
    },
    {
      num: '06',
      title: 'Conflict Detection',
      description: 'Identifies situations where credible sources disagree on a claim, weighing institutional authority and flagging evidence conflicts with supporting vs. contradicting counts.',
    },
    {
      num: '07',
      title: 'Reasoning Audit',
      description: 'Looks beyond individual isolated facts to audit relationships across claims, detecting internal contradictions, unsupported conclusions, deductive leaps, and invalid comparisons.',
    },
    {
      num: '08',
      title: 'Uncertainty Analysis',
      description: 'Identifies claims containing epistemic hedges ("might", "allegedly"), numerical approximations, or extreme absolute modifiers, differentiating unverifiable speculation from demonstrably false facts.',
    },
    {
      num: '09',
      title: 'Confidence Calibration',
      description: 'Produces a mathematically calibrated confidence score with a human-interpretable rationale based on source authority tiers, independent evidence counts, and evidence consensus.',
    },
    {
      num: '10',
      title: 'Error Localization',
      description: 'Identifies exactly which character offsets in the original AI-generated answer contain the error, enabling precision visual highlights rather than blanket flagging.',
    },
    {
      num: '11',
      title: 'Audit Report Generation',
      description: 'Combines findings into an executive audit report featuring accuracy metrics, clear counter-explanations ("Why is this wrong?"), and print-ready export options (JSON / PDF).',
    },
    {
      num: '12',
      title: 'Interactive Dashboard',
      description: 'Presents verified claims, counter-sources, conflict breakdowns, reasoning warnings, and an interactive text heatmap in a clean side-by-side evidence inspection interface.',
    },
  ];

  const principles = [
    {
      title: 'Evidence over similarity',
      desc: 'Semantic similarity alone does not establish truth. High token overlap between a claim and an excerpt cannot substitute for strict logical entailment.',
    },
    {
      title: 'Source quality matters',
      desc: 'Authoritative evidence carries greater weight than unverified blogs or forums. Wikipedia and Britannica are treated as reference encyclopedias, distinct from primary news or government registries.',
    },
    {
      title: 'Retrieval is not verification',
      desc: 'Finding a relevant web page does not make a claim true. Evidence must be examined at the proposition level to determine whether it confirms or refutes the assertion.',
    },
    {
      title: 'Uncertainty is allowed',
      desc: 'The system clearly states when available evidence is insufficient, ambiguous, or contested rather than guessing or fabricating confidence.',
    },
    {
      title: 'Every conclusion should be traceable',
      desc: 'Users can trace every finding from claim to exact evidence excerpt, source domain credibility score, and logical deduction step.',
    },
  ];

  return (
    <div className="how-it-works-page">
      {/* Hero Section */}
      <section className="hiw-hero">
        <div className="hiw-hero-badge">Architecture & Methodology</div>
        <h1 className="hiw-hero-title">How Second Opinion Works</h1>
        <p className="hiw-hero-subtitle">
          Second Opinion does not simply ask another AI whether an answer is correct.
          It breaks the answer into claims, retrieves evidence, evaluates that evidence,
          checks reasoning, and produces an auditable result.
        </p>
        <div className="hiw-hero-action">
          <button type="button" className="hiw-btn-primary" onClick={onNavigateAudit}>
            <span>Run an Audit</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* Main Architecture Diagram */}
      <section className="hiw-section">
        <div className="hiw-section-header">
          <span className="hiw-section-tag">End-to-End Pipeline</span>
          <h2 className="hiw-section-title">System Architecture</h2>
          <p className="hiw-section-desc">
            A deterministic, multi-stage auditing pipeline that decouples retrieval, verification, and reasoning.
          </p>
        </div>

        <div className="hiw-architecture-diagram">
          <div className="hiw-pipeline-flow">
            {pipelineStages.map((stage, idx) => (
              <React.Fragment key={stage.num}>
                <div className="hiw-pipeline-card">
                  <div className="hiw-card-header">
                    <span className="hiw-card-num">{stage.num}</span>
                    <span className="hiw-card-icon">{stage.icon}</span>
                  </div>
                  <h4 className="hiw-card-title">{stage.title}</h4>
                  <p className="hiw-card-desc">{stage.desc}</p>
                </div>
                {idx < pipelineStages.length - 1 && (
                  <div className="hiw-pipeline-arrow" aria-hidden="true">
                    <ArrowRight size={16} className="arrow-horizontal" />
                    <ArrowDown size={16} className="arrow-vertical" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* Second Diagram: How Evidence Is Evaluated */}
      <section className="hiw-section">
        <div className="hiw-section-header">
          <span className="hiw-section-tag">Verification Protocol</span>
          <h2 className="hiw-section-title">How Evidence Is Evaluated</h2>
          <p className="hiw-section-desc">
            Claims are grounded against multi-source evidence through structured proposition matching.
          </p>
        </div>

        <div className="hiw-evidence-flow-card">
          <div className="hiw-eval-step">
            <span className="hiw-eval-tag">Input</span>
            <strong>Extracted Claim Proposition</strong>
          </div>
          <div className="hiw-eval-arrow"><ArrowDown size={16} /></div>

          <div className="hiw-eval-step">
            <span className="hiw-eval-tag">Retrieval</span>
            <strong>Search Multiple Authoritative Sources</strong>
            <span className="hiw-eval-sub">Live Search API • Wikipedia • Encyclopedias • Government Portals</span>
          </div>
          <div className="hiw-eval-arrow"><ArrowDown size={16} /></div>

          <div className="hiw-eval-step">
            <span className="hiw-eval-tag">Filtering</span>
            <strong>Filter & Rank Evidence Passages</strong>
            <span className="hiw-eval-sub">Domain Trust Tiers • Syndication Clustering • Freshness Assessment</span>
          </div>
          <div className="hiw-eval-arrow"><ArrowDown size={16} /></div>

          <div className="hiw-eval-step">
            <span className="hiw-eval-tag">Inspection</span>
            <strong>Check Proposition-Level Relevance</strong>
            <span className="hiw-eval-sub">Discard incidental keyword matches without semantic grounding</span>
          </div>
          <div className="hiw-eval-arrow"><ArrowDown size={16} /></div>

          <div className="hiw-eval-step">
            <span className="hiw-eval-tag">Inference</span>
            <strong>Compare Evidence With Claim</strong>
          </div>
          <div className="hiw-eval-arrow"><ArrowDown size={16} /></div>

          {/* Three-way branch */}
          <div className="hiw-verdict-branches">
            <div className="hiw-verdict-box supported">
              <div className="hiw-verdict-badge supported">
                <CheckCircle2 size={14} />
                <span>SUPPORTS</span>
              </div>
              <p>Evidence directly entails the proposition without contradiction.</p>
            </div>

            <div className="hiw-verdict-box refuted">
              <div className="hiw-verdict-badge refuted">
                <XCircle size={14} />
                <span>CONTRADICTS</span>
              </div>
              <p>Evidence explicitly disproves or states the opposite of the claim.</p>
            </div>

            <div className="hiw-verdict-box insufficient">
              <div className="hiw-verdict-badge insufficient">
                <AlertTriangle size={14} />
                <span>INSUFFICIENT</span>
              </div>
              <p>Available evidence does not establish truth, or sources conflict.</p>
            </div>
          </div>

          <div className="hiw-eval-arrow"><ArrowDown size={16} /></div>

          <div className="hiw-eval-step result">
            <span className="hiw-eval-tag">Output</span>
            <strong>Calibrated Confidence Assessment + Audit Report</strong>
          </div>
        </div>
      </section>

      {/* Third Diagram: Why Second Opinion Is Different */}
      <section className="hiw-section">
        <div className="hiw-section-header">
          <span className="hiw-section-tag">Comparison</span>
          <h2 className="hiw-section-title">Why Second Opinion Is Different</h2>
          <p className="hiw-section-desc">
            Moving from subjective chatbot assertions to an evidence-backed verification pipeline.
          </p>
        </div>

        <div className="hiw-comparison-grid">
          <div className="hiw-comparison-col traditional">
            <div className="hiw-col-badge">Traditional AI Answer</div>
            <h3 className="hiw-col-title">Single-Pass Generative Output</h3>
            <p className="hiw-col-desc">Produces text without verification or claim-level traceability.</p>

            <div className="hiw-comp-chain">
              <div className="hiw-comp-node">User Question</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node">LLM Generation</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node end">AI Answer (Unverified)</div>
            </div>
            <div className="hiw-col-footer error">
              <span>Prone to hallucinations, unverified assertions, and logical fallacies.</span>
            </div>
          </div>

          <div className="hiw-comparison-col audit">
            <div className="hiw-col-badge active">Second Opinion</div>
            <h3 className="hiw-col-title">Evidence-Grounded Audit</h3>
            <p className="hiw-col-desc">Audits the answer across multiple independent dimensions.</p>

            <div className="hiw-comp-chain">
              <div className="hiw-comp-node">User Question</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node">AI Answer</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node highlight">Claim Extraction</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node highlight">Evidence Retrieval</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node highlight">Verification & Conflict Check</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node highlight">Reasoning Consistency Audit</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node highlight">Calibrated Confidence</div>
              <div className="hiw-comp-link"><ArrowDown size={14} /></div>
              <div className="hiw-comp-node end success">Auditable Result & Traceable Evidence</div>
            </div>
            <div className="hiw-col-footer success">
              <strong>The goal is not another opinion. The goal is an evidence-backed audit.</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Section 16: From Answer to Audit (12 numbered cards) */}
      <section className="hiw-section">
        <div className="hiw-section-header">
          <span className="hiw-section-tag">Detailed Breakdown</span>
          <h2 className="hiw-section-title">From Answer to Audit</h2>
          <p className="hiw-section-desc">
            A comprehensive look at the twelve core operations executed during every verification.
          </p>
        </div>

        <div className="hiw-stage-grid">
          {stageDescriptions.map((item) => (
            <div key={item.num} className="hiw-stage-card">
              <div className="hiw-stage-header">
                <span className="hiw-stage-index">{item.num}</span>
                <h3 className="hiw-stage-title">{item.title}</h3>
              </div>
              <p className="hiw-stage-body">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 19: Design & Trust Principles */}
      <section className="hiw-section">
        <div className="hiw-section-header">
          <span className="hiw-section-tag">Core Principles</span>
          <h2 className="hiw-section-title">Design & Trust Principles</h2>
          <p className="hiw-section-desc">
            Foundational rules governing how Second Opinion retrieves, filters, and reasons.
          </p>
        </div>

        <div className="hiw-principles-grid">
          {principles.map((p, idx) => (
            <div key={idx} className="hiw-principle-card">
              <div className="hiw-principle-icon">
                <Check size={16} />
              </div>
              <div className="hiw-principle-content">
                <h4 className="hiw-principle-title">{p.title}</h4>
                <p className="hiw-principle-desc">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="hiw-footer-cta">
        <h3>Ready to audit an AI answer?</h3>
        <p>Test any generative text across live web sources, reasoning consistency, and counter-explanations.</p>
        <button type="button" className="hiw-btn-primary" onClick={onNavigateAudit}>
          <span>Open Audit Workspace</span>
          <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
};
