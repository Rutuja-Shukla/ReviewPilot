import React from 'react';
import { DetectionSource, ValidationStatus } from '../types/review';
import { Cpu, Sparkles, CheckCheck, UserCheck, XCircle, HelpCircle, ShieldCheck } from 'lucide-react';

interface DetectionSourceBadgeProps {
  source: DetectionSource;
}

export const DetectionSourceBadge: React.FC<DetectionSourceBadgeProps> = ({ source }) => {
  switch (source) {
    case 'STATIC_ANALYZER':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono text-slate-700 bg-slate-100 border-slate-300">
          <Cpu className="w-3 h-3 text-slate-500" />
          STATIC_ANALYZER
        </span>
      );
    case 'AI_ANALYSIS':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono text-indigo-700 bg-indigo-50 border-indigo-200">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          AI_REASONING
        </span>
      );
    case 'TEST_EXECUTION':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono text-emerald-800 bg-emerald-50 border-emerald-200">
          <CheckCheck className="w-3 h-3 text-emerald-600" />
          TEST_EXECUTION
        </span>
      );
    case 'MANUAL_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono text-purple-700 bg-purple-50 border-purple-200">
          <UserCheck className="w-3 h-3 text-purple-600" />
          MANUAL_REVIEW
        </span>
      );
    default:
      return null;
  }
};

interface ValidationStatusBadgeProps {
  status: ValidationStatus;
}

export const ValidationStatusBadge: React.FC<ValidationStatusBadgeProps> = ({ status }) => {
  switch (status) {
    case 'STATICALLY_CONFIRMED':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium text-emerald-800 bg-emerald-50 border-emerald-200">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          Statically Confirmed
        </span>
      );
    case 'TEST_CONFIRMED':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium text-teal-800 bg-teal-50 border-teal-200">
          <CheckCheck className="w-3 h-3 text-teal-600" />
          Test Confirmed
        </span>
      );
    case 'MANUALLY_VERIFIED':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium text-blue-800 bg-blue-50 border-blue-200">
          <UserCheck className="w-3 h-3 text-blue-600" />
          Manually Verified
        </span>
      );
    case 'DISMISSED':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium text-slate-500 bg-slate-100 border-slate-200 line-through">
          <XCircle className="w-3 h-3 text-slate-400" />
          Dismissed
        </span>
      );
    case 'UNVERIFIED':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium text-amber-800 bg-amber-50 border-amber-200">
          <HelpCircle className="w-3 h-3 text-amber-600" />
          AI Hypothesis (Unverified)
        </span>
      );
  }
};
