import React from 'react';
import { SearchX } from 'lucide-react';

export const EmptyState: React.FC = () => {
  return (
    <div className="empty-state-panel" role="status">
      <div className="empty-state-icon-box">
        <SearchX size={22} />
      </div>
      <h3 className="empty-state-heading">No Check-Worthy Claims Detected</h3>
      <p className="empty-state-description">
        Paste an AI-generated answer to begin an audit. The submitted text appears to contain subjective commentary, personal opinions, or conversational text rather than verifiable factual claims.
      </p>
    </div>
  );
};
