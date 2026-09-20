/** A bounded word diff for version previews. Large documents remain responsive. */
export function textDiff(
  before: string,
  after: string,
): { kind: 'same' | 'added' | 'removed'; text: string }[] {
  const a = (before.slice(0, 6000).match(/\s+|\S+/g) ?? []).slice(0, 800);
  const b = (after.slice(0, 6000).match(/\s+|\S+/g) ?? []).slice(0, 800);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const at = i * cols + j;
      dp[at] =
        a[i] === b[j]
          ? 1 + (dp[(i + 1) * cols + j + 1] ?? 0)
          : Math.max(dp[(i + 1) * cols + j] ?? 0, dp[i * cols + j + 1] ?? 0);
    }
  }
  const result: { kind: 'same' | 'added' | 'removed'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ kind: 'same', text: a[i] ?? '' });
      i++;
      j++;
    } else if (
      j < b.length &&
      (i === a.length || (dp[i * cols + j + 1] ?? 0) >= (dp[(i + 1) * cols + j] ?? 0))
    ) {
      result.push({ kind: 'added', text: b[j] ?? '' });
      j++;
    } else {
      result.push({ kind: 'removed', text: a[i] ?? '' });
      i++;
    }
  }
  return result;
}
