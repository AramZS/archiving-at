import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  countGraphemes,
  isValidSameAsUri,
  isValidAtUri,
  isFileSizeValid,
} from './validation';

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('countGraphemes', () => {
  it('returns 0 for an empty string', () => {
    expect(countGraphemes('')).toBe(0);
  });

  it('returns 5 for "hello"', () => {
    expect(countGraphemes('hello')).toBe(5);
  });

  it('returns 1 for a multi-codepoint family emoji grapheme cluster', () => {
    // 👨‍👩‍👧 is a single grapheme cluster composed of multiple code points
    expect(countGraphemes('👨‍👩‍👧')).toBe(1);
  });
});

describe('isValidSameAsUri', () => {
  it('returns true for an at:// URI with content', () => {
    expect(isValidSameAsUri('at://did:plc:abc/col/rkey')).toBe(true);
  });

  it('returns true for an https:// URI with content', () => {
    expect(isValidSameAsUri('https://example.com')).toBe(true);
  });

  it('returns false for an http:// URI', () => {
    expect(isValidSameAsUri('http://example.com')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidSameAsUri('')).toBe(false);
  });
});

describe('isValidAtUri', () => {
  it('returns true for a well-formed AT-URI', () => {
    expect(isValidAtUri('at://did:plc:abc/app.bsky.feed.post/rkey')).toBe(true);
  });

  it('returns false for an https:// URI', () => {
    expect(isValidAtUri('https://example.com')).toBe(false);
  });

  it('returns false for at:// with only two path components', () => {
    expect(isValidAtUri('at://did:plc:abc/app.bsky.feed.post')).toBe(false);
  });

  it('returns false for at:// with an empty component', () => {
    expect(isValidAtUri('at://did:plc:abc//rkey')).toBe(false);
  });
});

describe('isFileSizeValid', () => {
  const FIFTY_MB = 52_428_800;
  const ONE_MB = 1_000_000;

  it('returns true when file size equals the 50 MB limit exactly', () => {
    expect(isFileSizeValid({ size: FIFTY_MB }, FIFTY_MB)).toBe(true);
  });

  it('returns false when file size exceeds the 50 MB limit by 1 byte', () => {
    expect(isFileSizeValid({ size: FIFTY_MB + 1 }, FIFTY_MB)).toBe(false);
  });

  it('returns true when file size equals the 1 MB limit exactly', () => {
    expect(isFileSizeValid({ size: ONE_MB }, ONE_MB)).toBe(true);
  });

  it('returns false when file size exceeds the 1 MB limit by 1 byte', () => {
    expect(isFileSizeValid({ size: ONE_MB + 1 }, ONE_MB)).toBe(false);
  });

  it('returns true when file size is 0', () => {
    expect(isFileSizeValid({ size: 0 }, ONE_MB)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Property 1: Grapheme counter is non-negative and bounded
 * Validates: Requirements 5.1, 5.2
 */
describe('Property 1: countGraphemes is non-negative and bounded', () => {
  it('for any string s, countGraphemes(s) >= 0 and <= s.length, and matches manual Intl.Segmenter iteration', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const count = countGraphemes(s);

        // Non-negative
        expect(count).toBeGreaterThanOrEqual(0);

        // Bounded by code-unit length
        expect(count).toBeLessThanOrEqual(s.length);

        // Matches manual iteration
        const segmenter = new Intl.Segmenter();
        let manualCount = 0;
        for (const _ of segmenter.segment(s)) {
          manualCount++;
        }
        expect(count).toBe(manualCount);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 4: File size validation
 * Validates: Requirements 5.3, 5.4
 */
describe('Property 4: isFileSizeValid returns correct result for any size/maxBytes pair', () => {
  it('returns false when size > maxBytes and true when size <= maxBytes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: 100_000_000 }),
        (size, maxBytes) => {
          const result = isFileSizeValid({ size }, maxBytes);
          if (size > maxBytes) {
            expect(result).toBe(false);
          } else {
            expect(result).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 5: sameAs URI validation
 * Validates: Requirements 5.5
 */
describe('Property 5: isValidSameAsUri returns true iff scheme is at:// or https:// with non-empty content', () => {
  it('returns false for arbitrary strings that do not start with at:// or https://', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        if (!s.startsWith('at://') && !s.startsWith('https://')) {
          expect(isValidSameAsUri(s)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('returns true for strings constructed as scheme + non-empty content', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.constantFrom('at://', 'https://'), fc.string({ minLength: 1 })),
        ([scheme, content]) => {
          expect(isValidSameAsUri(scheme + content)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: AT-URI validation
 * Validates: Requirements 5.6
 */
describe('Property 6: isValidAtUri returns true iff string matches at://<authority>/<collection>/<rkey>', () => {
  it('returns false for arbitrary strings that are not valid AT-URIs', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        // Only check strings that are clearly not valid AT-URIs
        // (i.e., don't start with at://)
        if (!s.startsWith('at://')) {
          expect(isValidAtUri(s)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('returns true for valid AT-URIs constructed from three non-empty components', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (authority, collection, rkey) => {
          // Ensure components don't contain '/' which would break the structure
          const safeAuthority = authority.replace(/\//g, 'x');
          const safeCollection = collection.replace(/\//g, 'x');
          const safeRkey = rkey.replace(/\//g, 'x');
          const uri = `at://${safeAuthority}/${safeCollection}/${safeRkey}`;
          expect(isValidAtUri(uri)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
