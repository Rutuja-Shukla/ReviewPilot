import React, { useState, useEffect } from 'react';
import { AppSettings, ReviewProfile } from '../../types/review';
import { fetchSettings, updateSettings } from '../../lib/api';
import {
  Settings,
  Shield,
  Server,
  Cpu,
  CheckCircle2,
  Lock,
  Save,
  Loader2,
  AlertTriangle,
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
      <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings & Privacy</h1>
        <p className="text-sm text-slate-600 mt-1">
          Configure analysis policies, source code retention boundaries, runtime sandbox parameters, and AI model preferences.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {saveSuccess && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved and applied successfully.</span>
          </div>
        )}

        {/* Section: Source Code Retention & Privacy */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Lock className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900 text-base">Source Code Privacy & Retention</h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            ReviewPilot does not persist source code indefinitely. Source files are strictly stored in an ephemeral development repository subject to automatic expiration.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono mb-1.5">
                Data Retention Window
              </label>
              <select
                value={settings.retentionPeriod}
                onChange={(e) =>
                  setSettings({ ...settings, retentionPeriod: e.target.value as any })
                }
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:outline-none"
              >
                <option value="session">Session Only (Purge on server restart)</option>
                <option value="24h">24 Hours</option>
                <option value="7d">7 Days (Default for audit logs)</option>
                <option value="30d">30 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono mb-1.5">
                Max Code Input Size
              </label>
              <select
                value={settings.maxInputSizeBytes}
                onChange={(e) =>
                  setSettings({ ...settings, maxInputSizeBytes: parseInt(e.target.value, 10) })
                }
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:outline-none"
              >
                <option value={200 * 1024}>200 KB (~5,000 lines)</option>
                <option value={500 * 1024}>500 KB (~12,500 lines - Recommended)</option>
                <option value={1024 * 1024}>1 MB (~25,000 lines)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section: Analysis & Review Preferences */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Cpu className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900 text-base">Analysis Pipeline Configuration</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono mb-1.5">
                Default Review Profile
              </label>
              <select
                value={settings.defaultProfile}
                onChange={(e) =>
                  setSettings({ ...settings, defaultProfile: e.target.value as ReviewProfile })
                }
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:outline-none"
              >
                <option value="COMPREHENSIVE">Comprehensive Review</option>
                <option value="SECURITY_REVIEW">Security Review</option>
                <option value="BUG_DETECTION">Bug Detection</option>
                <option value="CODE_QUALITY">Code Quality</option>
                <option value="PERFORMANCE">Performance</option>
                <option value="TEST_COVERAGE">Test Coverage</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono mb-1.5">
                Active Gemini Model
              </label>
              <input
                type="text"
                disabled
                value={settings.modelName}
                className="w-full p-2.5 text-xs bg-slate-100 border border-slate-300 rounded-lg font-mono text-slate-700 cursor-not-allowed"
              />
              <span className="text-[11px] text-slate-400 font-mono block mt-1">
                Configured via server-side Google GenAI SDK
              </span>
            </div>
          </div>
        </div>

        {/* Section: Sandbox Execution Disclosures */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900 text-base">Sandbox Security & Execution Policy</h2>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-slate-600 font-mono">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-semibold text-slate-900">Runtime Isolation:</div>
              <div>{sandboxCapability?.isolationMechanism || 'AST syntax validation + Safe runner policy'}</div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-semibold text-slate-900">Security Invariants:</div>
              <ul className="list-disc pl-5 space-y-1 text-slate-500">
                <li>No unrestricted shell execution, eval(), or Function constructors.</li>
                <li>Zero access to host environment secrets or credentials.</li>
                <li>Network egress disabled during automated test validation.</li>
                <li>Execution time strictly bounded to max 3,000ms.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm shadow-indigo-600/30 transition-all cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
