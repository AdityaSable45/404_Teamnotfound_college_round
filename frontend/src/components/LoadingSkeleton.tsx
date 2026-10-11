import React from 'react';

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="loading-state-panel" aria-busy="true" aria-live="polite">
      <div className="loading-indicator-row">
        <div className="restrained-spinner" />
        <span className="loading-text">Analyzing claims and gathering evidence…</span>
      </div>

      <div className="skeleton-cards-container">
        <div className="skeleton-card">
          <div className="skeleton-line w-25" />
          <div className="skeleton-line w-85" />
          <div className="skeleton-line w-60" />
        </div>

        <div className="skeleton-card">
          <div className="skeleton-line w-25" />
          <div className="skeleton-line w-85" />
          <div className="skeleton-line w-60" />
        </div>
      </div>
    </div>
  );
};
