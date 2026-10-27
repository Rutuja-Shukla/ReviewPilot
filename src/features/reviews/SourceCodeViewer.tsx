import React, { RefObject } from 'react';
import { ReviewFinding, SourceFile } from '../../types/review';
import { FileCode2 } from 'lucide-react';

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
    <div className="flex-1 flex flex-col bg-slate-950 border-r border-slate-800 overflow-hidden">
      {/* File Tab Header */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between text-xs font-mono text-slate-300">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-indigo-400" />
          <span className="font-medium text-white">{activeFile.path}</span>
          {activeFile.isDiff && (
            <span className="text-[11px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
              DIFF VIEW
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          {fileLines.length} lines • {totalFindingsCount} findings anchored
        </div>
      </div>

      {/* Line-Numbered Source Viewer */}
      <div
        ref={codeViewerRef}
        className="flex-1 overflow-auto font-mono text-xs text-slate-200 select-text"
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

            const isDiffAdd = activeFile.isDiff && lineContent.startsWith('+');
            const isDiffDel = activeFile.isDiff && lineContent.startsWith('-');

            return (
              <div
                key={lineNum}
                id={`source-line-${lineNum}`}
                className={`flex items-start group leading-6 transition-colors ${
                  isSelectedFindingLine
                    ? 'bg-indigo-950/80 border-l-2 border-indigo-400'
                    : hasCritical
                    ? 'bg-rose-950/30 border-l-2 border-rose-500'
                    : hasHigh
                    ? 'bg-orange-950/20 border-l-2 border-orange-500'
                    : hasMedium
                    ? 'bg-amber-950/20'
                    : isDiffAdd
                    ? 'bg-emerald-950/30 text-emerald-300'
                    : isDiffDel
                    ? 'bg-rose-950/30 text-rose-300'
                    : 'hover:bg-slate-900/60'
                }`}
              >
                {/* Line Number */}
                <div className="w-12 text-right pr-4 text-slate-400 select-none text-[11px] shrink-0 font-mono">
                  {lineNum}
                </div>

                {/* Inline Severity Marker */}
                <div className="w-5 shrink-0 flex items-center justify-center">
                  {hasCritical ? (
                    <span className="w-2 h-2 rounded-full bg-rose-500" title="Critical finding on this line" />
                  ) : hasHigh ? (
                    <span className="w-2 h-2 rounded-full bg-orange-500" title="High finding on this line" />
                  ) : hasMedium ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500" title="Medium finding on this line" />
                  ) : null}
                </div>

                {/* Code Text */}
                <pre className="flex-1 overflow-x-auto whitespace-pre font-mono">
                  {lineContent || ' '}
                </pre>

                {/* Quick Finding Jump Button */}
                {findingsOnLine.length > 0 && (
                  <div className="pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onSelectFinding(findingsOnLine[0].id)}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700"
                    >
                      View Finding
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
