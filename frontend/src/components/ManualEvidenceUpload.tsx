import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import {
  FileText,
  UploadCloud,
  X,
  Trash2,
  FileCheck,
  AlertCircle,
  FileCode,
  ShieldCheck,
  Search,
} from 'lucide-react';

export interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  sizeFormatted: string;
  sizeBytes: number;
  status: 'ready' | 'processing';
}

export type EvidenceInputMode = 'web' | 'manual';

interface ManualEvidenceUploadProps {
  onVerifyManual: (data: { files: File[]; text: string }) => void;
  onVerifyWeb: () => void;
  isVerifying: boolean;
  claimsCount: number;
}

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_FILES_COUNT = 5;
const MAX_TEXT_LENGTH = 30000;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ManualEvidenceUpload: React.FC<ManualEvidenceUploadProps> = ({
  onVerifyManual,
  onVerifyWeb,
  isVerifying,
  claimsCount,
}) => {
  const [mode, setMode] = useState<EvidenceInputMode>('web');
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [pastedText, setPastedText] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManualInputEmpty = files.length === 0 && pastedText.trim().length === 0;
  const isSubmitDisabled = isVerifying || (mode === 'manual' && isManualInputEmpty);

  const validateAndAddFiles = (newFiles: FileList | File[]) => {
    setValidationError(null);
    const addedItems: UploadedFileItem[] = [];
    const errors: string[] = [];

    if (files.length + newFiles.length > MAX_FILES_COUNT) {
      setValidationError(`Maximum of ${MAX_FILES_COUNT} PDF files can be uploaded at once.`);
      return;
    }

    Array.from(newFiles).forEach((file) => {
      // Validate file type (PDF only)
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        errors.push(`"${file.name}" is not a PDF. Only PDF (.pdf) documents are supported.`);
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`"${file.name}" exceeds the maximum 15MB file size limit.`);
        return;
      }

      // Duplicate check
      const isDuplicate = files.some(
        (f) => f.name === file.name && f.sizeBytes === file.size
      );
      if (isDuplicate) {
        errors.push(`"${file.name}" has already been added.`);
        return;
      }

      addedItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
        sizeBytes: file.size,
        status: 'ready',
      });
    });

    if (errors.length > 0) {
      setValidationError(errors.join(' '));
    }

    if (addedItems.length > 0) {
      setFiles((prev) => [...prev, ...addedItems]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
    // Reset file input value so re-selecting same file triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (validationError) setValidationError(null);
  };

  const handleClearText = () => {
    setPastedText('');
    if (validationError) setValidationError(null);
  };

  const handleSubmit = () => {
    if (isSubmitDisabled) return;

    if (mode === 'web') {
      onVerifyWeb();
    } else {
      onVerifyManual({
        files: files.map((f) => f.file),
        text: pastedText.trim(),
      });
    }
  };

  return (
    <section className="evidence-source-panel" aria-label="Evidence Source Selection">
      <div className="evidence-panel-header">
        <div className="evidence-panel-title-group">
          <h3 className="evidence-panel-title">Verification Evidence Method</h3>
          <p className="evidence-panel-subtitle">
            Choose whether to cross-check extracted claims against live web sources or your own manual documents and text.
          </p>
        </div>

        {/* Segmented Control / Tabs */}
        <div className="mode-toggle-group" role="tablist" aria-label="Evidence Input Method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'web'}
            className={`mode-toggle-tab ${mode === 'web' ? 'active' : ''}`}
            onClick={() => {
              setMode('web');
              setValidationError(null);
            }}
            disabled={isVerifying}
          >
            <Search size={15} />
            <span>Search the Web</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            className={`mode-toggle-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => {
              setMode('manual');
              setValidationError(null);
            }}
            disabled={isVerifying}
          >
            <UploadCloud size={15} />
            <span>Upload Files / Paste Text</span>
          </button>
        </div>
      </div>

      {mode === 'manual' && (
        <div className="manual-sources-container">
          {/* Validation Alert */}
          {validationError && (
            <div className="upload-error-alert" role="alert">
              <AlertCircle size={16} />
              <span>{validationError}</span>
              <button
                type="button"
                className="close-alert-btn"
                onClick={() => setValidationError(null)}
                aria-label="Dismiss alert"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="manual-inputs-grid">
            {/* Section A: PDF Drag & Drop Upload Zone */}
            <div className="upload-section-card">
              <div className="upload-section-header">
                <div className="section-label-group">
                  <FileText size={16} className="section-icon" />
                  <h4>Upload PDF Documents</h4>
                </div>
                <span className="file-limit-hint">
                  {files.length}/{MAX_FILES_COUNT} PDFs (max 15MB each)
                </span>
              </div>

              <div
                className={`dropzone-area ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Upload PDF documents dropzone"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={handleFileInputChange}
                  disabled={isVerifying}
                />
                <div className="dropzone-content">
                  <div className="dropzone-icon-circle">
                    <UploadCloud size={24} />
                  </div>
                  <div className="dropzone-text">
                    <span className="dropzone-prompt">
                      Drag and drop PDF files here, or <strong className="browse-link">browse</strong>
                    </span>
                    <span className="dropzone-subtext">
                      Supports multiple research papers, reports, or articles (.pdf)
                    </span>
                  </div>
                </div>
              </div>

              {/* Selected Files List */}
              {files.length > 0 && (
                <div className="selected-files-list" aria-label="Selected PDF files">
                  {files.map((fileItem) => (
                    <div key={fileItem.id} className="file-chip">
                      <div className="file-chip-left">
                        <FileText size={18} className="pdf-icon" />
                        <div className="file-info">
                          <span className="file-name" title={fileItem.name}>
                            {fileItem.name}
                          </span>
                          <span className="file-meta">
                            {fileItem.sizeFormatted} &bull; Ready
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="file-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(fileItem.id);
                        }}
                        disabled={isVerifying}
                        aria-label={`Remove file ${fileItem.name}`}
                        title="Remove file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section B: Paste Evidence Text */}
            <div className="upload-section-card">
              <div className="upload-section-header">
                <div className="section-label-group">
                  <FileCode size={16} className="section-icon" />
                  <h4>Provide Text as Evidence</h4>
                </div>
                <span className="char-counter-hint">
                  {pastedText.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} chars
                </span>
              </div>

              <div className="pasted-text-wrapper">
                <textarea
                  className="pasted-text-area"
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="Paste the source text, reference paragraphs, or relevant factual evidence passages here..."
                  rows={5}
                  disabled={isVerifying}
                  maxLength={MAX_TEXT_LENGTH}
                  aria-label="Pasted evidence text"
                />
                {pastedText.length > 0 && (
                  <button
                    type="button"
                    className="clear-pasted-btn"
                    onClick={handleClearText}
                    disabled={isVerifying}
                    title="Clear text"
                  >
                    <X size={13} style={{ marginRight: '4px' }} />
                    Clear text
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="evidence-panel-footer">
        <div className="footer-status-info">
          {mode === 'web' ? (
            <span>
              Searching external indexed records and authoritative archives for all {claimsCount} claims.
            </span>
          ) : (
            <span>
              {isManualInputEmpty ? (
                <span className="text-warning">
                  Select at least one PDF or enter text evidence to proceed.
                </span>
              ) : (
                <span className="text-success">
                  Ready to verify against {files.length} document(s){' '}
                  {pastedText.trim() ? 'and pasted evidence passages' : ''}.
                </span>
              )}
            </span>
          )}
        </div>

        <button
          type="button"
          className="verify-action-btn primary"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
        >
          {isVerifying ? (
            <>
              <div className="spinner" style={{ width: '15px', height: '15px', borderWidth: '2px' }} />
              <span>Verifying Against Sources...</span>
            </>
          ) : (
            <>
              <ShieldCheck size={17} />
              <span>
                {mode === 'web'
                  ? `Verify All ${claimsCount} Claims via Web`
                  : `Verify Against Manual Sources`}
              </span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
