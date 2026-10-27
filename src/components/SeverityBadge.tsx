import React from 'react';
import { ReviewSeverity } from '../types/review';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';

interface SeverityBadgeProps {
  severity: ReviewSeverity;
  size?: 'sm' | 'md';
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity, size = 'md' }) => {
  const isSm = size === 'sm';

  switch (severity) {
    case 'CRITICAL':
      return (
        <span
          className={`inline-flex items-center gap-1 font-mono font-semibold uppercase tracking-wider rounded border text-rose-700 bg-rose-50 border-rose-200 ${
            isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
          }`}
          title="Critical severity: immediate remediation required"
        >
          <ShieldAlert className={isSm ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          CRITICAL
        </span>
      );
    case 'HIGH':
      return (
        <span
          className={`inline-flex items-center gap-1 font-mono font-semibold uppercase tracking-wider rounded border text-orange-700 bg-orange-50 border-orange-200 ${
            isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
          }`}
          title="High severity: significant bug or security risk"
        >
          <AlertCircle className={isSm ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          HIGH
        </span>
      );
    case 'MEDIUM':
      return (
        <span
          className={`inline-flex items-center gap-1 font-mono font-medium uppercase tracking-wider rounded border text-amber-800 bg-amber-50 border-amber-200 ${
            isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
          }`}
          title="Medium severity: quality or performance issue"
        >
          <AlertTriangle className={isSm ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          MEDIUM
        </span>
      );
    case 'LOW':
      return (
        <span
          className={`inline-flex items-center gap-1 font-mono font-medium uppercase tracking-wider rounded border text-sky-700 bg-sky-50 border-sky-200 ${
            isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
          }`}
          title="Low severity: style or minor improvement"
        >
          <Info className={isSm ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          LOW
        </span>
      );
    case 'INFORMATIONAL':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 font-mono font-medium uppercase tracking-wider rounded border text-slate-600 bg-slate-100 border-slate-200 ${
            isSm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
          }`}
          title="Informational observation"
        >
          <CheckCircle2 className={isSm ? 'w-2.5 h-2.5 shrink-0' : 'w-3 h-3 shrink-0'} />
          INFO
        </span>
      );
  }
};
