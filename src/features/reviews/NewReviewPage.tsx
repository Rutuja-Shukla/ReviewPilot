import React, { useState, useRef } from 'react';
import { SupportedLanguage, ReviewProfile, Review } from '../../types/review';
import { createReview } from '../../lib/api';
import { detectLanguage } from '../../utils/languageDetector';
import {
  FileCode,
  GitPullRequest,
  Upload,
  Play,
  Loader2,
  AlertCircle,
  Command,
  ShieldCheck,
} from 'lucide-react';

interface NewReviewPageProps {
  onReviewCreated: (review: Review) => void;
}

const SAMPLE_PRESETS: {
  title: string;
  description: string;
  language: SupportedLanguage;
  profile: ReviewProfile;
  inputType: 'snippet' | 'diff';
  code: string;
}[] = [
  {
    title: 'SQL Injection & Auth Assignment (TypeScript)',
    description: 'Vulnerable route concatenating user input directly into SQL with assignment in conditional.',
    language: 'typescript',
    profile: 'SECURITY_REVIEW',
    inputType: 'snippet',
    code: `import express, { Request, Response } from 'express';
import { db } from './database';

export async function getUserAccount(req: Request, res: Response) {
  const userId = req.query.id as string;
  const role = req.query.role as string;

  // Defect 1: Accidental assignment instead of comparison
  if (role = 'admin') {
    console.log('Elevated admin privileges granted');
  }

  // Defect 2: Critical SQL Injection vulnerability
  const query = "SELECT * FROM users WHERE id = '" + userId + "' AND active = 1";
  const user = await db.query(query);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
}`,
  },
  {
    title: 'Command Injection in Subprocess (Python)',
    description: 'Untrusted user input interpolated directly into shell=True command in Flask route.',
    language: 'python',
    profile: 'SECURITY_REVIEW',
    inputType: 'snippet',
    code: `import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/ping', methods=['GET'])
def ping_host():
    target = request.args.get('target', '127.0.0.1')
    # Defect: shell=True with unescaped user string leads to arbitrary command execution
    cmd = f"ping -c 1 {target}"
    output = subprocess.check_output(cmd, shell=True, text=True)
    return jsonify({"output": output})
`,
  },
  {
    title: 'Mutable Default & Resource Leak (Python)',
    description: 'Persistent list mutation across calls, unclosed open() file, and bare except.',
    language: 'python',
    profile: 'BUG_DETECTION',
    inputType: 'snippet',
    code: `def collect_metrics(metric_name: str, values: list = []):
    # Defect 1: Mutable default argument retains state across invocations
    values.append(metric_name)
    
    # Defect 2: Identity comparison with literal
    if metric_name is "cpu_usage":
        print("Monitoring CPU load")
        
    try:
        # Defect 3: Resource opened without with context manager
        f = open("/var/log/metrics.log", "a")
        f.write(f"{metric_name}: {len(values)}\\n")
    except:
        # Defect 4: Bare except silently swallowing errors
        pass
        
    return values
`,
  },
  {
    title: 'Null Dereference & Resource Leak (Java)',
    description: 'Unchecked nullable dereference and unclosed FileInputStream stream resource.',
    language: 'java',
    profile: 'BUG_DETECTION',
    inputType: 'snippet',
    code: `package com.example.service;

import java.io.FileInputStream;
import java.io.IOException;

public class FileReaderService {
    public String readFileContent(String filePath) throws IOException {
        // Defect: Null pointer potential
        if (filePath.isEmpty()) {
            return null;
        }

        // Defect: Unclosed resource stream leak without try-with-resources
        FileInputStream fis = new FileInputStream(filePath);
        byte[] data = new byte[fis.available()];
        fis.read(data);
        return new String(data);
    }
}`,
  },
  {
    title: 'Pull Request Unified Diff (Auth Middleware)',
    description: 'Git diff adding auth middleware with JWT bypass and hardcoded secret.',
    language: 'typescript',
    profile: 'COMPREHENSIVE',
    inputType: 'diff',
    code: `--- a/src/middleware/auth.ts
+++ b/src/middleware/auth.ts
@@ -10,8 +10,12 @@ export function verifyToken(req: Request, res: Response, next: NextFunction) {
   const token = req.headers['authorization'];
-  if (!token) {
-    return res.status(401).json({ error: 'Missing token' });
+  // Defect: Token validation bypass when header contains test string
+  if (!token || token === 'DEBUG_BYPASS') {
+    req.user = { id: 0, role: 'admin' };
+    return next();
   }
   
+  // Defect: Weak cryptographic validation secret
+  const payload = jwt.verify(token, 'hardcoded_jwt_secret_123');
   next();
 }`,
  },
];

export const NewReviewPage: React.FC<NewReviewPageProps> = ({ onReviewCreated }) => {
  const [title, setTitle] = useState('');
  const [inputType, setInputType] = useState<'snippet' | 'diff' | 'upload'>('snippet');
  const [language, setLanguage] = useState<SupportedLanguage>('typescript');
  const [profile, setProfile] = useState<ReviewProfile>('SECURITY_REVIEW');
  const [codeContent, setCodeContent] = useState(SAMPLE_PRESETS[0].code);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = codeContent.split('\n');
  const lineCount = lines.length;

  const handleApplyPreset = (index: number) => {
    const preset = SAMPLE_PRESETS[index];
    setTitle(preset.title);
    setLanguage(preset.language);
    setProfile(preset.profile);
    setInputType(preset.inputType);
    setCodeContent(preset.code);
    setErrorMessage(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const updated = codeContent.substring(0, start) + '  ' + codeContent.substring(end);
      setCodeContent(updated);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('File size exceeds maximum allowable limit of 2 MB.');
      return;
    }

    setTitle(file.name);
    if (file.name.endsWith('.diff') || file.name.endsWith('.patch')) {
      setInputType('diff');
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCodeContent(content);
      setErrorMessage(null);

      const detected = detectLanguage({ fileName: file.name, code: content });
      if (detected) {
        setLanguage(detected);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!codeContent.trim()) {
      setErrorMessage('Source code or diff content cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setCurrentStage('1. AST Parsing & Lexical Analysis');

    const timer1 = setTimeout(() => {
      setCurrentStage('2. Deterministic Static Analyzers (12 AST Rules)');
    }, 600);

    const timer2 = setTimeout(() => {
      setCurrentStage('3. Gemini Contextual Verification');
    }, 1400);

    try {
      const effectiveTitle = title.trim() || `${language.toUpperCase()} ${inputType === 'diff' ? 'Diff Review' : 'Code Audit'}`;
      const review = await createReview({
        title: effectiveTitle,
        language,
        profile,
        inputType: inputType === 'diff' ? 'diff' : inputType === 'upload' ? 'file' : 'snippet',
        code: codeContent,
      });
      clearTimeout(timer1);
      clearTimeout(timer2);
      onReviewCreated(review);
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setErrorMessage(err.message || 'Review execution failed. Please verify syntax and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-5">
      {/* Page Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Start Code Review
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit a code snippet, unified git diff, or file for deterministic rule scanning and AI verification.
          </p>
        </div>
        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
          <Command className="w-3.5 h-3.5" />
          <span>Press <kbd className="px-1 py-0.5 bg-slate-100 rounded border border-slate-300 text-slate-700">⌘↵</kbd> to submit</span>
        </div>
      </div>

      {/* Preset Fixtures Picker (Compact Developer Selectors) */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-mono font-medium text-slate-500 uppercase tracking-wider">
          Load Sample Defect Fixtures:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {SAMPLE_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyPreset(idx)}
              className="text-left p-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs group cursor-pointer"
            >
              <div className="text-xs font-semibold text-slate-900 group-hover:text-indigo-600 truncate font-mono">
                {preset.title}
              </div>
              <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                {preset.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Review Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Review Title & Language / Profile Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase tracking-wider mb-1">
              Review Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Auth Route Security Audit"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase tracking-wider mb-1">
              Target Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="typescript">TypeScript (.ts, .tsx)</option>
              <option value="javascript">JavaScript (.js, .jsx)</option>
              <option value="python">Python (.py)</option>
              <option value="java">Java (.java)</option>
              <option value="csharp">C# (.cs)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono font-medium text-slate-700 uppercase tracking-wider mb-1">
              Analysis Profile
            </label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as ReviewProfile)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="SECURITY_REVIEW">Security Audit (SQLi, Injection, Secrets)</option>
              <option value="BUG_DETECTION">Bug & Reliability (Null, Logic, Async)</option>
              <option value="COMPREHENSIVE">Comprehensive (All Rules + Style + Concurrency)</option>
              <option value="PERFORMANCE">Performance & Efficiency</option>
              <option value="CODE_QUALITY">Code Quality</option>
              <option value="TEST_COVERAGE">Test Coverage</option>
            </select>
          </div>
        </div>

        {/* Language Capabilities & Toolchain Status Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-600 gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-slate-900 uppercase">
              {language} Toolchain Status:
            </span>
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {language === 'python'
                ? 'AST: @lezer/python (Offline)'
                : language === 'java'
                ? 'AST: @lezer/java'
                : language === 'csharp'
                ? 'AST: csharp-parser'
                : 'Parser: esbuild'}
            </span>
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className={`w-1.5 h-1.5 rounded-full ${language === 'python' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
              {language === 'python' ? 'Linter: Ruff (Fallback: Python AST Rules)' : 'Linter: ReviewPilot Engine'}
            </span>
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              Synthesis: {language === 'python' ? 'pytest' : language === 'java' ? 'JUnit 5' : language === 'csharp' ? 'xUnit' : 'vitest'}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-slate-400" />
            <span>Server Isolation Policy Active</span>
          </div>
        </div>

        {/* Input Format Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200">
          <div className="flex space-x-1">
            <button
              type="button"
              onClick={() => setInputType('snippet')}
              className={`px-3 py-2 text-xs font-mono font-medium border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
                inputType === 'snippet'
                  ? 'border-indigo-600 text-indigo-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Source Snippet</span>
            </button>
            <button
              type="button"
              onClick={() => setInputType('diff')}
              className={`px-3 py-2 text-xs font-mono font-medium border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
                inputType === 'diff'
                  ? 'border-indigo-600 text-indigo-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              <span>Git Unified Diff (.patch)</span>
            </button>
            <button
              type="button"
              onClick={() => setInputType('upload')}
              className={`px-3 py-2 text-xs font-mono font-medium border-b-2 -mb-px flex items-center gap-1.5 cursor-pointer ${
                inputType === 'upload'
                  ? 'border-indigo-600 text-indigo-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload File</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400">
            {lineCount} lines · {codeContent.length} chars
          </div>
        </div>

        {/* File Upload Area */}
        {inputType === 'upload' && (
          <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded text-center space-y-2">
            <Upload className="w-6 h-6 text-slate-400 mx-auto" />
            <div className="text-xs text-slate-600">
              Select a source code file or git patch to inspect
            </div>
            <input
              type="file"
              onChange={handleFileUpload}
              className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-mono file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300 cursor-pointer"
            />
          </div>
        )}

        {/* Code Editor with Line Gutter */}
        <div className="border border-slate-300 rounded overflow-hidden bg-slate-950 font-mono text-xs flex">
          <div className="w-12 py-3 bg-slate-900 text-slate-400 text-right pr-3 select-none text-[11px] border-r border-slate-800 leading-5 shrink-0">
            {Array.from({ length: Math.max(lineCount, 1) }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={codeContent}
            onChange={(e) => setCodeContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={18}
            spellCheck={false}
            placeholder={
              inputType === 'diff'
                ? 'Paste unified git diff (--- a/file.ts +++ b/file.ts @@ ... @@)...'
                : 'Paste or type source code to review...'
            }
            className="flex-1 p-3 bg-slate-950 text-slate-100 font-mono text-xs leading-5 resize-y focus:outline-none border-none whitespace-pre overflow-x-auto"
          />
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Loading / Pipeline State */}
        {isSubmitting && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Analyzing source code...</span>
            </div>
            <div className="text-slate-400 text-[11px] pl-6">
              {currentStage || 'Running deterministic rules...'}
            </div>
          </div>
        )}

        {/* Submit Action Bar */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-slate-400 font-mono">
            Analyzed with AST static parser + Gemini engine
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !codeContent.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded transition-colors shadow-2xs cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Run Code Review (⌘↵)</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
