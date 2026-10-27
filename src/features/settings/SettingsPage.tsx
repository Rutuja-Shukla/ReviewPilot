import React, { useState, useEffect } from 'react';
import { AppSettings, ReviewProfile } from '../../types/review';
import { fetchSettings, updateSettings } from '../../lib/api';
import {
  Settings,
  Shield,
  Cpu,
  CheckCircle2,
  Lock,
  Save,
  Loader2,
  AlertTriangle,
  Server,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sandboxCapability, setSandboxCapability] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await fetchSettings();
      setSettings(data.settings);
      setSandboxCapability(data.sandboxCapability);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-mono text-xs gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 max-w-4xl w-full mx-auto space-y-5">
      {/* Page Header */}
      <div className="pb-3 border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
          Engine Settings & Policies
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure source retention policies, static analysis limits, host sandbox parameters, and model defaults.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {saveSuccess && (
          <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Settings saved and applied successfully.</span>
          </div>
        )}

        {/* Source Code Retention & Privacy */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Lock className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900 text-xs font-mono uppercase tracking-wider">
              Source Code Retention Policy
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            ReviewPilot does not persist customer source code indefinitely. Source files are strictly stored in an ephemeral workspace subject to automatic expiration.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase mb-1">
                Data Retention Window
              </label>
              <select
                value={settings.retentionPeriod}
                onChange={(e) =>
                  setSettings({ ...settings, retentionPeriod: e.target.value as any })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
              >
                <option value="session">Session Only (Purge on restart)</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days (Standard Audit Trail)</option>
                <option value="30d">30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase mb-1">
                Max Code Input Size
              </label>
              <select
                value={settings.maxInputSizeBytes}
                onChange={(e) =>
                  setSettings({ ...settings, maxInputSizeBytes: parseInt(e.target.value, 10) })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
              >
                <option value={200 * 1024}>200 KB (~5,000 lines)</option>
                <option value={500 * 1024}>500 KB (~12,500 lines - Recommended)</option>
                <option value={1024 * 1024}>1 MB (~25,000 lines)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Analysis Pipeline Configuration */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Cpu className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900 text-xs font-mono uppercase tracking-wider">
              Analysis Engine Defaults
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase mb-1">
                Default Review Profile
              </label>
              <select
                value={settings.defaultProfile}
                onChange={(e) =>
                  setSettings({ ...settings, defaultProfile: e.target.value as ReviewProfile })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
              >
                <option value="SECURITY_REVIEW">Security Audit</option>
                <option value="BUG_HUNTER">Bug Hunter</option>
                <option value="FULL_ENGINE">Full Engine</option>
                <option value="PERFORMANCE">Performance & Efficiency</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase mb-1">
                AI Model Engine
              </label>
              <input
                type="text"
                value={settings.modelName}
                onChange={(e) => setSettings({ ...settings, modelName: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded font-mono focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Sandbox Execution & Isolation Policy */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 text-xs font-mono uppercase tracking-wider">
              Sandbox & Host Isolation Policy
            </h2>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Untrusted code submitted for review or generated during unit-test reproduction is never executed directly inside the host application server. Execution is guarded by AST validation and restricted container mock adapters.
          </p>

          <div className="p-3 rounded bg-slate-50 border border-slate-200 font-mono text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Isolation Active:</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Enforced (Mock Isolated Container)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Execution Timeout:</span>
              <span className="text-slate-800">5000 ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Max Memory Ceiling:</span>
              <span className="text-slate-800">128 MB</span>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-slate-400 font-mono">
            Changes take effect immediately across all worker threads
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded shadow-2xs transition-colors cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
