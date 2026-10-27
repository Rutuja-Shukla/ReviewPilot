import React, { RefObject } from 'react';
import { ReviewFinding, SourceFile } from '../../types/review';
import { FileCode2, GitCommit } from 'lucide-react';

interface SourceCodeViewerProps {
  activeFile: SourceFile;
  fileLines: string[];
  lineToFindingsMap: Map<number, ReviewFinding[]>;
  selectedFinding?: ReviewFinding;
  onSelectFinding: (findingId: string) => void;
  codeViewerRef: RefObject<HTMLDivElement | null>;
  totalFindingsCount: number;
}

export const SourceCodeViewer: React.FC<SourceCodeViewerProps> = ({
  activeFile,
  fileLines,
  lineToFindingsMap,
  selectedFinding,
  onSelectFinding,
  codeViewerRef,
  totalFindingsCount,
}) => {
  return (
    <div className="flex-1 flex flex-col bg-slate-950 border-r border-slate-800 overflow-hidden select-text">
      {/* File Header Bar */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-xs font-mono text-slate-300 shrink-0">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="font-semibold text-white truncate">{activeFile.path}</span>
          {activeFile.isDiff && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
              UNIFIED DIFF
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 tabular-nums">
          {fileLines.length} lines · {totalFindingsCount} findings anchored
        </div>
      </div>

      {/* Code Viewer Area */}
      <div
        ref={codeViewerRef}
        tabIndex={0}
        aria-label="Source code viewer"
        className="flex-1 overflow-auto font-mono text-xs text-slate-200 select-text focus:outline-none"
      >
        <div className="p-2 min-w-full inline-block">
          {fileLines.map((lineContent, index) => {
            const lineNum = index + 1;
            const findingsOnLine = lineToFindingsMap.get(lineNum) || [];
            const isSelectedFindingLine =
              selectedFinding &&
              lineNum >= selectedFinding.startLine &&
              lineNum <= (selectedFinding.endLine || selectedFinding.startLine);

            const hasCritical = findingsOnLine.some((f) => f.severity === 'CRITICAL');
            const hasHigh = findingsOnLine.some((f) => f.severity === 'HIGH');
            const hasMedium = findingsOnLine.some((f) => f.severity === 'MEDIUM');

            const isHunkHeader = activeFile.isDiff && lineContent.startsWith('@@');
            const isDiffAdd = activeFile.isDiff && lineContent.startsWith('+') && !lineContent.startsWith('+++');
            const isDiffDel = activeFile.isDiff && lineContent.startsWith('-') && !lineContent.startsWith('---');

            let lineStyle = 'hover:bg-slate-900/50';
            if (isSelectedFindingLine) {
              lineStyle = 'bg-indigo-950/80 border-l-2 border-indigo-400 text-white';
            } else if (hasCritical) {
              lineStyle = 'bg-rose-950/30 border-l-2 border-rose-500';
            } else if (hasHigh) {
              lineStyle = 'bg-orange-950/20 border-l-2 border-orange-500';
            } else if (hasMedium) {
              lineStyle = 'bg-amber-950/15 border-l-2 border-amber-500/60';
            } else if (isHunkHeader) {
              lineStyle = 'bg-slate-900/90 text-sky-400 font-semibold border-y border-slate-800';
            } else if (isDiffAdd) {
              lineStyle = 'bg-emerald-950/30 text-emerald-300 border-l-2 border-emerald-500/50';
            } else if (isDiffDel) {
              lineStyle = 'bg-rose-950/30 text-rose-300 border-l-2 border-rose-500/50';
            }

            return (
              <div
                key={lineNum}
                id={`source-line-${lineNum}`}
                className={`flex items-start group leading-5 transition-colors ${lineStyle}`}
              >
                {/* Gutter Line Number */}
                <div className="w-12 text-right pr-3 text-slate-400 select-none text-[11px] shrink-0 font-mono tabular-nums">
                  {lineNum}
                </div>

                {/* Finding Marker Gutter */}
                <div className="w-4 shrink-0 flex items-center justify-center">
                  {hasCritical ? (
                    <span
                      className="w-2 h-2 rounded-full bg-rose-500 shadow-xs cursor-pointer"
                      title="Critical finding"
                      onClick={() => findingsOnLine[0] && onSelectFinding(findingsOnLine[0].id)}
                    />
                  ) : hasHigh ? (
                    <span
                      className="w-2 h-2 rounded-full bg-orange-500 shadow-xs cursor-pointer"
                      title="High finding"
                      onClick={() => findingsOnLine[0] && onSelectFinding(findingsOnLine[0].id)}
                    />
                  ) : hasMedium ? (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-500 shadow-xs cursor-pointer"
                      title="Medium finding"
                      onClick={() => findingsOnLine[0] && onSelectFinding(findingsOnLine[0].id)}
                    />
                  ) : null}
                </div>

                {/* Code Content */}
                <pre className="flex-1 overflow-x-auto whitespace-pre font-mono pr-2">
                  {lineContent || ' '}
                </pre>

                {/* Quick Finding View Action on Hover */}
                {findingsOnLine.length > 0 && (
                  <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectFinding(findingsOnLine[0].id)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 cursor-pointer"
                    >
                      Finding →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
