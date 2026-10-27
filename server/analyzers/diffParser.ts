export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: Array<{
    type: 'add' | 'delete' | 'context';
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
  }>;
}

export interface ParsedDiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  changedLines: number[]; // new line numbers that were added/modified
  fullNewContent: string;
  fullOldContent?: string;
}

export function parseGitDiff(diffText: string): ParsedDiffFile[] {
  if (!diffText || !diffText.trim()) {
    return [];
  }

  const lines = diffText.split(/\r?\n/);
  const files: ParsedDiffFile[] = [];
  let currentFile: ParsedDiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineCounter = 0;
  let newLineCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Diff header: diff --git a/path b/path
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(finalizeDiffFile(currentFile));
      }
      currentHunk = null;
      const parts = line.split(' ');
      const oldPath = parts[2]?.replace(/^a\//, '') || 'unknown';
      const newPath = parts[3]?.replace(/^b\//, '') || oldPath;
      currentFile = {
        oldPath,
        newPath,
        hunks: [],
        additions: 0,
        deletions: 0,
        changedLines: [],
        fullNewContent: '',
      };
      continue;
    }

    // --- a/path or +++ b/path
    if (line.startsWith('--- ')) {
      if (currentFile && !currentFile.oldPath) {
        currentFile.oldPath = line.substring(4).replace(/^a\//, '').trim();
      }
      continue;
    }
    if (line.startsWith('+++ ')) {
      if (currentFile && (!currentFile.newPath || currentFile.newPath === 'unknown')) {
        currentFile.newPath = line.substring(4).replace(/^b\//, '').trim();
      }
      continue;
    }

    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@ ')) {
      if (!currentFile) {
        currentFile = {
          oldPath: 'source-file',
          newPath: 'source-file',
          hunks: [],
          additions: 0,
          deletions: 0,
          changedLines: [],
          fullNewContent: '',
        };
      }
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/);
      if (match) {
        const oldStart = parseInt(match[1], 10);
        const oldCount = match[2] ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newCount = match[4] ? parseInt(match[4], 10) : 1;

        oldLineCounter = oldStart;
        newLineCounter = newStart;

        currentHunk = {
          oldStart,
          oldCount,
          newStart,
          newCount,
          header: line,
          lines: [],
        };
      }
      continue;
    }

    // Hunk body
    if (currentHunk && currentFile) {
      if (line.startsWith('+')) {
        const content = line.substring(1);
        currentHunk.lines.push({
          type: 'add',
          content,
          newLineNumber: newLineCounter,
        });
        currentFile.changedLines.push(newLineCounter);
        currentFile.additions++;
        newLineCounter++;
      } else if (line.startsWith('-')) {
        const content = line.substring(1);
        currentHunk.lines.push({
          type: 'delete',
          content,
          oldLineNumber: oldLineCounter,
        });
        currentFile.deletions++;
        oldLineCounter++;
      } else if (line.startsWith(' ') || line === '') {
        const content = line.startsWith(' ') ? line.substring(1) : line;
        currentHunk.lines.push({
          type: 'context',
          content,
          oldLineNumber: oldLineCounter,
          newLineNumber: newLineCounter,
        });
        oldLineCounter++;
        newLineCounter++;
      }
    }
  }

  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(finalizeDiffFile(currentFile));
  }

  return files;
}

function finalizeDiffFile(file: ParsedDiffFile): ParsedDiffFile {
  // Reconstruct full content of the modified file based on hunks, aligning line numbers
  const newContentLines: string[] = [];
  let currentLine = 1;

  for (const hunk of file.hunks) {
    while (currentLine < hunk.newStart) {
      newContentLines.push('');
      currentLine++;
    }

    for (const l of hunk.lines) {
      if (l.type === 'add' || l.type === 'context') {
        newContentLines.push(l.content);
        currentLine++;
      }
    }
  }

  file.fullNewContent = newContentLines.join('\n');
  return file;
}
