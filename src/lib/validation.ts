/**
 * Pure validation helpers for the upload-archive-session feature.
 * No side effects — suitable for property-based testing.
 */

/**
 * Count Unicode grapheme clusters in a string using Intl.Segmenter.
 * Returns 0 for an empty string.
 */
export function countGraphemes(str: string): number {
  if (str.length === 0) return 0;
  const segmenter = new Intl.Segmenter();
  let count = 0;
  for (const _ of segmenter.segment(str)) {
    count++;
  }
  return count;
}

/**
 * Returns true iff the string starts with `at://` or `https://`
 * and has non-empty content after the scheme.
 */
export function isValidSameAsUri(uri: string): boolean {
  if (uri.startsWith('at://')) {
    return uri.length > 'at://'.length;
  }
  if (uri.startsWith('https://')) {
    return uri.length > 'https://'.length;
  }
  return false;
}

/**
 * Returns true iff the string matches `at://<authority>/<collection>/<rkey>`
 * with all three path components non-empty.
 */
export function isValidAtUri(uri: string): boolean {
  if (!uri.startsWith('at://')) return false;
  const withoutScheme = uri.slice('at://'.length);
  const parts = withoutScheme.split('/');
  // Must have exactly 3 parts: authority, collection, rkey — all non-empty
  return (
    parts.length === 3 &&
    parts[0].length > 0 &&
    parts[1].length > 0 &&
    parts[2].length > 0
  );
}

/**
 * Returns false if `file.size > maxBytes`, true otherwise.
 */
export function isFileSizeValid(file: { size: number }, maxBytes: number): boolean {
  return file.size <= maxBytes;
}
