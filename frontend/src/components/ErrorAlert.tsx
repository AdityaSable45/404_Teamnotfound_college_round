import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorAlertProps {
  error: string;
  details?: string;
  onRetry?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ error, details, onRetry }) => {
  return (
    <div className="error-alert-panel" role="alert">
      <div className="error-alert-icon-col">
        <AlertCircle size={18} />
      </div>

      <div className="error-alert-content-col">
        <h4 className="error-alert-title">{error}</h4>
        {details && <p className="error-alert-details">{details}</p>}
      </div>

      {onRetry && (
        <button type="button" className="error-alert-retry-btn" onClick={onRetry}>
          <RotateCcw size={13} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
};
