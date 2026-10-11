import React from 'react';
import { ArrowRight, Trash2, ArrowUpRight } from 'lucide-react';

interface ClaimInputAreaProps {
  text: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  isLoading: boolean;
  maxLength?: number;
}

const SAMPLE_PROMPTS = [
  {
    label: 'Australia Capital',
    text: "The capital of Australia is Sydney, and it is also the country's largest city. Australia became a federation in 1901, and Canberra was later established as the national capital. Sydney is located on the east coast of Australia and is famous for the Sydney Opera House and Harbour Bridge, while Canberra is located inland in the Australian Capital Territory.",
  },
  {
    label: 'Great Wall of China',
    text: 'The Great Wall of China is located in Japan. The Great Wall was built primarily as a defensive fortification against invasions and was constructed during various dynasties, notably joined under the Qin dynasty. Construction began earlier, but Emperor Qin Shi Huang connected existing sections.',
  },
  {
    label: 'World Wide Web vs Internet',
    text: 'Tim Berners-Lee invented the World Wide Web in 1989. However, the Internet itself was developed earlier through ARPANET in the late 1960s, so Tim Berners-Lee did not invent the physical Internet network.',
  },
  {
    label: 'Numerical & Science',
    text: 'The global human population reached 8 billion people on November 15, 2022. Albert Einstein was born in 1879 and won the Nobel Prize in Physics in 1921 for his explanation of the photoelectric effect.',
  },
];

export const ClaimInputArea: React.FC<ClaimInputAreaProps> = ({
  text,
  onChange,
  onSubmit,
  onClear,
  isLoading,
  maxLength = 10000,
}) => {
  const charCount = text.length;
  const isOverLimit = charCount > maxLength;
  const isInputEmpty = text.trim().length === 0;
  const isSubmitDisabled = isInputEmpty || isOverLimit || isLoading;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isSubmitDisabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <section className="input-card" aria-label="Input AI Answer">
      <div className="input-card-header">
        <label htmlFor="ai-answer-input" className="input-title">
          Paste an AI-generated answer
        </label>
        <div className="input-header-right">
          <span
            className={`char-counter ${
              isOverLimit ? 'danger' : charCount > maxLength * 0.9 ? 'warning' : ''
            }`}
          >
            {charCount.toLocaleString()} / {maxLength.toLocaleString()} chars
          </span>
        </div>
      </div>

      <div className="textarea-container">
        <textarea
          id="ai-answer-input"
          className="audit-textarea"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste the response you want to audit..."
          disabled={isLoading}
          rows={5}
        />
      </div>

      {/* Sample prompts */}
      <div className="sample-prompts-bar">
        <span className="sample-label">Examples:</span>
        <div className="sample-chips">
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              className="sample-chip"
              onClick={() => onChange(sample.text)}
              disabled={isLoading}
            >
              <span>{sample.label}</span>
              <ArrowUpRight size={11} className="chip-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="input-actions-bar">
        <div className="input-hint">
          <span>Press </span>
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
          <span> to audit</span>
        </div>

        <div className="input-action-buttons">
          {!isInputEmpty && (
            <button
              type="button"
              className="btn-text"
              onClick={onClear}
              disabled={isLoading}
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          )}

          <button
            type="button"
            id="extract-claims-btn"
            className="btn-audit"
            onClick={onSubmit}
            disabled={isSubmitDisabled}
          >
            {isLoading ? (
              <>
                <div className="btn-spinner" />
                <span>Auditing Claims...</span>
              </>
            ) : (
              <>
                <span>Audit Answer</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
