import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  BookOpen,
  Scale,
  Brain,
  Search,
} from 'lucide-react';

interface AuditHeroShowcaseProps {
  onLoadSample: (sampleText: string) => void;
}

interface DemoScenario {
  id: string;
  name: string;
  fullText: string;
  spans: {
    text: string;
    status: 'refuted' | 'supported';
    badge: string;
    source: string;
  }[];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'australia',
    name: 'Australia Capital Hallucination',
    fullText:
      "The capital of Australia is Sydney, and it is also the country's largest city. Australia became a federation in 1901, and Canberra was later established as the national capital.",
    spans: [
      {
        text: 'The capital of Australia is Sydney, ',
        status: 'refuted',
        badge: '❌ Refuted (97%): Canberra is the capital',
        source: 'Parliament of Australia / Gov Records',
      },
      {
        text: "and it is also the country's largest city. ",
        status: 'supported',
        badge: '✓ Supported (95%): ABS Census Records',
        source: 'Australian Bureau of Statistics',
      },
      {
        text: 'Australia became a federation in 1901, ',
        status: 'supported',
        badge: '✓ Supported (99%): Historical Consensus',
        source: 'National Archives of Australia',
      },
      {
        text: 'and Canberra was later established as the national capital.',
        status: 'supported',
        badge: '✓ Supported (96%): 1913 Foundation Act',
        source: 'National Museum of Australia',
      },
    ],
  },
  {
    id: 'great-wall',
    name: 'Historical Geography Flaw',
    fullText:
      'The Great Wall of China is located in Japan. It was built primarily as a defensive fortification against military invasions, with construction spanning multiple imperial dynasties.',
    spans: [
      {
        text: 'The Great Wall of China is located in Japan. ',
        status: 'refuted',
        badge: '❌ Refuted (98%): Located in Northern China',
        source: 'Encyclopaedia Britannica / UNESCO',
      },
      {
        text: 'It was built primarily as a defensive fortification against military invasions, ',
        status: 'supported',
        badge: '✓ Supported (96%): Military History',
        source: 'UNESCO World Heritage Centre',
      },
      {
        text: 'with construction spanning multiple imperial dynasties.',
        status: 'supported',
        badge: '✓ Supported (94%): Archaeological Records',
        source: 'Britannica Reference Encyclopedia',
      },
    ],
  },
];

export const AuditHeroShowcase: React.FC<AuditHeroShowcaseProps> = ({ onLoadSample }) => {
  const [activeScenarioIdx, setActiveScenarioIdx] = useState<number>(0);
  const [revealedChars, setRevealedChars] = useState<number>(0);
  const [isTyping, setIsTyping] = useState<boolean>(true);
  const [activeBadgeSpanIdx, setActiveBadgeSpanIdx] = useState<number>(0);

  const scenario = DEMO_SCENARIOS[activeScenarioIdx];

  // Typing animation loop
  useEffect(() => {
    setRevealedChars(0);
    setIsTyping(true);
    setActiveBadgeSpanIdx(0);

    const fullLength = scenario.fullText.length;
    let current = 0;

    const timer = setInterval(() => {
      current += 3;
      if (current >= fullLength) {
        current = fullLength;
        setRevealedChars(fullLength);
        setIsTyping(false);
        clearInterval(timer);
      } else {
        setRevealedChars(current);
      }
    }, 28);

    return () => clearInterval(timer);
  }, [activeScenarioIdx]);

  // Periodic badge pulse / cycle after typing completes
  useEffect(() => {
    if (isTyping) return;
    const interval = setInterval(() => {
      setActiveBadgeSpanIdx((prev) => (prev + 1) % scenario.spans.length);
    }, 2600);
    return () => clearInterval(interval);
  }, [isTyping, scenario.spans.length]);

  // Compute character ranges for spans
  let currentOffset = 0;
  const renderedSpans = scenario.spans.map((span, sIdx) => {
    const spanStart = currentOffset;
    const spanEnd = currentOffset + span.text.length;
    currentOffset = spanEnd;

    // Check how much of this span is revealed
    const isSpanVisible = revealedChars > spanStart;
    const visibleLengthInSpan = Math.max(0, Math.min(span.text.length, revealedChars - spanStart));
    const visibleText = span.text.slice(0, visibleLengthInSpan);
    const isFullyTyped = revealedChars >= spanEnd;

    return {
      ...span,
      index: sIdx,
      isSpanVisible,
      visibleText,
      isFullyTyped,
    };
  });

  return (
    <section className="audit-hero-showcase" aria-label="Can You Trust Your AI Showcase">
      <div className="hero-content-grid">
        {/* Left Column: Value Prop & Brief */}
        <div className="hero-text-col">
          <div className="hero-trust-badge">
            <ShieldAlert size={14} className="trust-badge-icon" />
            <span>Empirical AI Verification Platform</span>
          </div>

          <h1 className="hero-headline">
            Can you trust <br />
            <span className="hero-headline-accent">your AI?</span>
          </h1>

          <p className="hero-brief-lead">
            Large language models write with effortless fluency and unwavering authority—even when stating subtle falsehoods, fabricated statistics, or invalid logical leaps.
          </p>

          <p className="hero-brief-sub">
            <strong>Second Opinion</strong> breaks generative answers into isolated claims, retrieves live multi-source evidence, evaluates contradiction versus entailment, and pinpoints hallucinations with grounded counter-evidence.
          </p>

          {/* Value Highlights */}
          <div className="hero-capabilities-list">
            <div className="capability-item">
              <CheckCircle2 size={15} className="capability-icon text-supported" />
              <span>
                <strong>Sentence-Level Isolation:</strong> Decomposes compound text into independent, check-worthy propositions.
              </span>
            </div>
            <div className="capability-item">
              <CheckCircle2 size={15} className="capability-icon text-supported" />
              <span>
                <strong>Ground-Truth Retrieval:</strong> Cites primary encyclopedias, government archives, and academic journals.
              </span>
            </div>
            <div className="capability-item">
              <CheckCircle2 size={15} className="capability-icon text-supported" />
              <span>
                <strong>Reasoning Consistency:</strong> Audits deductive leaps, premise contradictions, and causal flaws.
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Animated AI Verification Simulator */}
        <div className="hero-demo-col">
          <div className="demo-window-card">
            {/* Window Title Bar */}
            <div className="demo-window-header">
              <div className="window-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="window-title">
                <span>AI Output Audit Simulator</span>
              </div>
              <div className="scenario-switcher">
                {DEMO_SCENARIOS.map((sc, idx) => (
                  <button
                    key={sc.id}
                    type="button"
                    className={`scenario-btn ${idx === activeScenarioIdx ? 'active' : ''}`}
                    onClick={() => setActiveScenarioIdx(idx)}
                    title={`Switch to ${sc.name}`}
                  >
                    {idx === 0 ? 'Example 1' : 'Example 2'}
                  </button>
                ))}
              </div>
            </div>

            {/* Simulated AI Output with dynamic inline highlighting */}
            <div className="demo-window-body">
              <div className="demo-ai-prompt">
                <span className="prompt-label">AI Output Analysis:</span>
                <span className="prompt-model-tag">GPT-4o / Claude 3.5 Generated Response</span>
              </div>

              <div className="demo-text-box">
                {renderedSpans.map((item) => {
                  if (!item.isSpanVisible) return null;

                  const isHighlighted = item.isFullyTyped;
                  const isRefuted = item.status === 'refuted';
                  const isCurrentActive = activeBadgeSpanIdx === item.index;

                  return (
                    <span
                      key={item.index}
                      className={`demo-animated-span ${
                        isHighlighted ? (isRefuted ? 'span-highlight-refuted' : 'span-highlight-supported') : ''
                      } ${isCurrentActive && !isTyping ? 'active-callout-focus' : ''}`}
                      onClick={() => setActiveBadgeSpanIdx(item.index)}
                    >
                      {item.visibleText}
                    </span>
                  );
                })}
                {isTyping && <span className="typing-cursor">|</span>}
              </div>

              {/* Dynamic Callout Inspector */}
              <div className="demo-callout-box">
                <div className="callout-header">
                  <span className="callout-label">Live Verification Detection:</span>
                  <button
                    type="button"
                    className="replay-btn"
                    onClick={() => {
                      setRevealedChars(0);
                      setIsTyping(true);
                      setActiveBadgeSpanIdx(0);
                    }}
                    title="Replay animation"
                  >
                    <RotateCcw size={11} />
                    <span>Replay</span>
                  </button>
                </div>

                {scenario.spans[activeBadgeSpanIdx] && (
                  <div
                    className={`callout-banner ${
                      scenario.spans[activeBadgeSpanIdx].status === 'refuted' ? 'refuted' : 'supported'
                    }`}
                  >
                    <div className="callout-badge-line">
                      {scenario.spans[activeBadgeSpanIdx].status === 'refuted' ? (
                        <XCircle size={15} className="callout-icon" />
                      ) : (
                        <CheckCircle2 size={15} className="callout-icon" />
                      )}
                      <strong>{scenario.spans[activeBadgeSpanIdx].badge}</strong>
                    </div>
                    <div className="callout-source-line">
                      <span>Corroborating record:</span>
                      <code>{scenario.spans[activeBadgeSpanIdx].source}</code>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Window Footer Action */}
            <div className="demo-window-footer">
              <span className="footer-hint">Want to test this live against the audit engine?</span>
              <button
                type="button"
                className="btn-load-demo"
                onClick={() => onLoadSample(scenario.fullText)}
              >
                <span>Audit this text</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
