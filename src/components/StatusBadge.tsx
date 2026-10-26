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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 text-slate-800 border border-slate-300">
          <Cpu className="w-3 h-3 text-slate-600" />
          STATIC_ANALYZER
        </span>
      );
    case 'AI_ANALYSIS':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          <Sparkles className="w-3 h-3 text-indigo-600" />
          AI_ANALYSIS
        </span>
      );
    case 'TEST_EXECUTION':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCheck className="w-3 h-3 text-emerald-600" />
          TEST_EXECUTION
        </span>
      );
    case 'MANUAL_REVIEW':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-purple-50 text-purple-700 border border-purple-200">
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          Statically Confirmed
        </span>
      );
    case 'TEST_CONFIRMED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
          <CheckCheck className="w-3 h-3 text-teal-600" />
          Test Confirmed
        </span>
      );
    case 'MANUALLY_VERIFIED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
          <UserCheck className="w-3 h-3 text-blue-600" />
          Manually Verified
        </span>
      );
    case 'DISMISSED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 line-through border border-slate-200">
          <XCircle className="w-3 h-3 text-slate-400" />
          Dismissed
        </span>
      );
    case 'UNVERIFIED':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
          <HelpCircle className="w-3 h-3 text-amber-600" />
          Unverified (AI Hypothesis)
        </span>
      );
  }
};
