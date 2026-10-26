import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Code2,
  AlertTriangle,
  FlaskConical,
  Target,
  History,
  Settings,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';

export type AppPage = 
  | 'dashboard' 
  | 'new-review' 
  | 'workspace' 
  | 'findings' 
  | 'test-lab' 
  | 'evaluation' 
  | 'history' 
  | 'settings';

interface NavigationProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  activeReviewTitle?: string;
  totalFindingsCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentPage,
  onNavigate,
  activeReviewTitle,
  totalFindingsCount,
}) => {
  const navItems: { id: AppPage; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'new-review', label: 'New Review', icon: PlusCircle },
    { id: 'workspace', label: 'Review Workspace', icon: Code2 },
    { id: 'findings', label: 'Findings Explorer', icon: AlertTriangle, badge: totalFindingsCount },
    { id: 'test-lab', label: 'Test Lab', icon: FlaskConical },
    { id: 'evaluation', label: 'Evaluation Suite', icon: Target },
    { id: 'history', label: 'Review History', icon: History },
    { id: 'settings', label: 'Settings & Privacy', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="w-8 h-8 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-900/50 group-hover:bg-indigo-500 transition-colors">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-white tracking-tight flex items-center gap-1.5">
              ReviewPilot
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/60">
                v1.0
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono leading-none mt-0.5">
              AI Code Review Engine
            </div>
          </div>
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1 font-mono">
          Core Platform
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Active Workspace Pill */}
      {activeReviewTitle && (
        <div className="p-3 mx-3 mb-3 bg-slate-800/80 rounded-lg border border-slate-700/60 text-xs">
          <div className="text-[10px] uppercase font-mono text-slate-400 mb-1 flex items-center justify-between">
            <span>Loaded Workspace</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="font-medium text-slate-200 truncate" title={activeReviewTitle}>
            {activeReviewTitle}
          </div>
        </div>
      )}

      {/* System Telemetry Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-[11px] font-mono text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Model:</span>
          <span className="text-indigo-300 font-semibold">gemini-3.8-flash</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Sandbox:</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            AST Verified
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Static Checks:</span>
          <span className="text-slate-300">Active (12 Rules)</span>
        </div>
      </div>
    </aside>
  );
};
