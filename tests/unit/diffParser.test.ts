import { describe, it, expect } from 'vitest';
import { parseGitDiff } from '../../server/analyzers/diffParser';

describe('Git Diff Parser', () => {
  it('should parse unified git diff headers and file names correctly', () => {
    const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,4 +10,5 @@ function verifyUser(id: string) {
-  const token = null;
+  const token = 'active';
+  console.log(token);
   return token;
 }`;

    const parsed = parseGitDiff(sampleDiff);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].newPath).toBe('src/auth.ts');
    expect(parsed[0].additions).toBe(2);
    expect(parsed[0].deletions).toBe(1);
    expect(parsed[0].changedLines).toContain(10);
    expect(parsed[0].changedLines).toContain(11);
  });

  it('should handle multiple files in a single diff', () => {
    const multiFileDiff = `diff --git a/file1.ts b/file1.ts
@@ -1,2 +1,3 @@
 line1
+line2
 line3
diff --git a/file2.py b/file2.py
@@ -1,2 +1,2 @@
-old_py
+new_py`;

    const parsed = parseGitDiff(multiFileDiff);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].newPath).toBe('file1.ts');
    expect(parsed[1].newPath).toBe('file2.py');
    expect(parsed[1].deletions).toBe(1);
    expect(parsed[1].additions).toBe(1);
  });

  it('should return empty array for empty diff input', () => {
    expect(parseGitDiff('')).toEqual([]);
    expect(parseGitDiff('   \n  ')).toEqual([]);
  });
});
