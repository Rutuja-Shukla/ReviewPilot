import React from 'react';
import { ReviewSeverity } from '../types/review';
import { ShieldAlert, AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

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
          className={`inline-flex items-center gap-1 font-semibold rounded-md bg-rose-50 border border-rose-200 text-rose-700 ${
            isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
          }`}
          title="Critical severity: immediate remediation recommended"
        >
          <ShieldAlert className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          CRITICAL
        </span>
      );
    case 'HIGH':
      return (
        <span
          className={`inline-flex items-center gap-1 font-semibold rounded-md bg-orange-50 border border-orange-200 text-orange-700 ${
            isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
          }`}
          title="High severity: significant bug or security risk"
        >
          <AlertCircle className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          HIGH
        </span>
      );
    case 'MEDIUM':
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-md bg-amber-50 border border-amber-200 text-amber-700 ${
            isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
          }`}
          title="Medium severity: quality or performance issue"
        >
          <AlertTriangle className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          MEDIUM
        </span>
      );
    case 'LOW':
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-md bg-blue-50 border border-blue-200 text-blue-700 ${
            isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
          }`}
          title="Low severity: minor improvement or style"
        >
          <Info className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          LOW
        </span>
      );
    case 'INFORMATIONAL':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-md bg-slate-100 border border-slate-200 text-slate-700 ${
            isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
          }`}
          title="Informational observation"
        >
          <CheckCircle2 className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          INFO
        </span>
      );
  }
};
