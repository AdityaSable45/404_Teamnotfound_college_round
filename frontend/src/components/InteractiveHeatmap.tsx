import React from 'react';
import { ExtractedClaim, VerifiedClaim } from '../types.js';

interface InteractiveHeatmapProps {
  originalAnswer: string;
  claims: (ExtractedClaim | VerifiedClaim)[];
  onSelectClaim?: (claimId: string) => void;
  selectedClaimId?: string | null;
}

interface TextSpan {
  text: string;
  isClaim: boolean;
  claim?: ExtractedClaim | VerifiedClaim;
  claimIndex?: number;
}

export const InteractiveHeatmap: React.FC<InteractiveHeatmapProps> = ({
  originalAnswer,
  claims,
  onSelectClaim,
  selectedClaimId,
}) => {
  if (!originalAnswer) return null;

  // Build segments from claims
  const spans: TextSpan[] = [];
  const validClaims = claims
    .map((c, idx) => ({ claim: c, index: idx }))
    .filter((item) => {
      if (item.claim.offset_start !== undefined && item.claim.offset_end !== undefined) {
        return item.claim.offset_end > item.claim.offset_start;
      }
      return item.claim.original_text && originalAnswer.includes(item.claim.original_text);
    });

  interface ClaimPosition {
    claim: ExtractedClaim | VerifiedClaim;
    index: number;
    start: number;
    end: number;
  }

  const positions: ClaimPosition[] = [];
  let cursor = 0;

  for (const item of validClaims) {
    let start = item.claim.offset_start;
    let end = item.claim.offset_end;

    if (start === undefined || end === undefined || start < cursor || end > originalAnswer.length) {
      const foundIdx = originalAnswer.indexOf(item.claim.original_text, cursor);
      if (foundIdx !== -1) {
        start = foundIdx;
        end = foundIdx + item.claim.original_text.length;
      } else {
        const anyIdx = originalAnswer.indexOf(item.claim.original_text);
        if (anyIdx !== -1) {
          start = anyIdx;
          end = anyIdx + item.claim.original_text.length;
        }
      }
    }

    if (start !== undefined && end !== undefined && start >= 0 && end <= originalAnswer.length) {
      positions.push({
        claim: item.claim,
        index: item.index,
        start,
        end,
      });
      cursor = Math.max(cursor, end);
    }
  }

  // Sort by start position
  positions.sort((a, b) => a.start - b.start);

  // Split original text into segments
  let currentPos = 0;
  for (const pos of positions) {
    if (pos.start > currentPos) {
      spans.push({
        text: originalAnswer.slice(currentPos, pos.start),
        isClaim: false,
      });
    }

    const claimStart = Math.max(currentPos, pos.start);
    if (pos.end > claimStart) {
      spans.push({
        text: originalAnswer.slice(claimStart, pos.end),
        isClaim: true,
        claim: pos.claim,
        claimIndex: pos.index,
      });
      currentPos = pos.end;
    }
  }

  if (currentPos < originalAnswer.length) {
    spans.push({
      text: originalAnswer.slice(currentPos),
      isClaim: false,
    });
  }

  const getSpanClassName = (claim?: ExtractedClaim | VerifiedClaim, isSelected?: boolean) => {
    if (!claim) return '';
    const verified = 'verdict' in claim ? (claim as VerifiedClaim) : null;
    const base = 'heatmap-claim-span';
    const sel = isSelected ? 'selected' : '';

    if (!verified) return `${base} unverified ${sel}`;
    switch (verified.verdict) {
      case 'SUPPORTED':
        return `${base} span-supported ${sel}`;
      case 'REFUTED':
        return `${base} span-refuted ${sel}`;
      case 'MISLEADING':
        return `${base} span-misleading ${sel}`;
      default:
        return `${base} span-unverifiable ${sel}`;
    }
  };

  const handleClick = (claim?: ExtractedClaim | VerifiedClaim) => {
    if (!claim) return;
    if (onSelectClaim) {
      onSelectClaim(claim.id);
    }
    const el = document.getElementById(`claim-${claim.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('claim-focus-active');
      setTimeout(() => el.classList.remove('claim-focus-active'), 2000);
    }
  };

  return (
    <div className="heatmap-container" aria-label="Interactive Answer Heatmap">
      <div className="heatmap-header">
        <div className="heatmap-title-group">
          <span className="heatmap-title">Audited Response</span>
          <span className="heatmap-subtitle">Click highlighted claims to inspect evidence</span>
        </div>

        <div className="heatmap-legend">
          <span className="legend-item supported">
            <span className="legend-dot" /> Supported
          </span>
          <span className="legend-item refuted">
            <span className="legend-dot" /> Refuted
          </span>
          <span className="legend-item misleading">
            <span className="legend-dot" /> Review
          </span>
        </div>
      </div>

      <div className="heatmap-body">
        {spans.map((span, sIdx) => {
          if (!span.isClaim || !span.claim) {
            return (
              <span key={sIdx} className="heatmap-text-plain">
                {span.text}
              </span>
            );
          }

          const isSelected = selectedClaimId === span.claim.id;
          const verified = 'verdict' in span.claim ? (span.claim as VerifiedClaim) : null;
          const tooltip = verified
            ? `Claim ${(span.claimIndex ?? 0) + 1}: ${verified.verdict} (${verified.confidence}% confidence)`
            : `Claim ${(span.claimIndex ?? 0) + 1}: Isolated proposition`;

          return (
            <mark
              key={sIdx}
              className={getSpanClassName(span.claim, isSelected)}
              title={tooltip}
              onClick={() => handleClick(span.claim)}
            >
              {span.text}
            </mark>
          );
        })}
      </div>
    </div>
  );
};
