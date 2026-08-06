// Escapes Postgres LIKE/ILIKE metacharacters (%, _) and the escape
// character itself (\) in user-supplied search text, so a search for
// e.g. "50%_off" or "a\b" matches those characters literally instead of
// being interpreted as wildcards - see the code-quality-scan audit that
// flagged unescaped search input being built into ILIKE patterns.
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
