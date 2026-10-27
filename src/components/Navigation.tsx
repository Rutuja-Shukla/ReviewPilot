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
  Command,
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
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'new-review', label: 'New Review', icon: PlusCircle },
    { id: 'workspace', label: 'Review Workspace', icon: Code2 },
    { id: 'findings', label: 'Findings Explorer', icon: AlertTriangle, badge: totalFindingsCount },
    { id: 'test-lab', label: 'Test Lab', icon: FlaskConical },
    { id: 'evaluation', label: 'Evaluation Suite', icon: Target },
    { id: 'history', label: 'History & Audits', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0 min-h-screen select-none">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer"
        >
          <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white font-mono font-bold text-xs shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-white tracking-tight text-sm flex items-center gap-1.5 leading-none">
              ReviewPilot
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              Code Review & Verification
            </div>
          </div>
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2.5 py-1.5 font-mono">
          Workspace
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-white font-semibold border-l-2 border-indigo-500 pl-2'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700 tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Active Review File Link */}
      {activeReviewTitle && (
        <div className="p-2.5 mx-2 mb-2 bg-slate-950 rounded border border-slate-800 text-xs">
          <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between uppercase tracking-wider">
            <span>Active Review</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <button
            type="button"
            onClick={() => onNavigate('workspace')}
            className="text-left font-medium text-slate-200 truncate block w-full hover:text-white hover:underline cursor-pointer"
            title={activeReviewTitle}
          >
            {activeReviewTitle}
          </button>
        </div>
      )}

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="p-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Command className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[10px]">Shortcuts:</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span title="Navigate findings in workspace"><kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">j</kbd>/<kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">k</kbd></span>
          <span title="Submit review in editor"><kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">⌘↵</kbd></span>
        </div>
      </div>
    </aside>
  );
};
