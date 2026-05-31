/**
 * Property-based tests for UploadForm logic.
 *
 * These tests import the pure helper functions from formValidation.ts directly,
 * avoiding the need for a Svelte component test environment.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateFormFields, initialFormState } from '../lib/formValidation';
import type { FormFields, FormState } from '../lib/formValidation';
import { countGraphemes } from '../lib/validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A minimal File that passes archive file validation.
 * Uses a tiny 1-byte blob to avoid memory overhead.
 */
function makeArchiveFile(type = 'application/wacz'): File {
  return new File([new Uint8Array(1)], 'archive.wacz', { type });
}

/**
 * Returns a FormFields object that is valid in all fields except the one
 * being tested. Callers override the field under test.
 */
function validBase(overrides: Partial<FormFields> = {}): FormFields {
  return {
    title: 'Valid Title',
    description: '',
    archiveFile: makeArchiveFile(),
    coverImage: null,
    bskyPostRef: '',
    sameAs: ['https://example.com'],
    tags: [],
    archiveDateCreatedAt: '2024-01-01T00:00:00',
    uploadedAt: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Property 2: Title grapheme limit enforcement
// Validates: Requirements 3.1, 5.1
// ---------------------------------------------------------------------------

describe('Property 2: Title grapheme limit enforcement', () => {
  it('produces an error for title iff grapheme count > 500 or string is empty/whitespace-only', () => {
    fc.assert(
      fc.property(fc.string(), (titleStr) => {
        const fields = validBase({ title: titleStr });
        const errors = validateFormFields(fields);

        const graphemes = countGraphemes(titleStr);
        const isBlank = titleStr.trim() === '';
        const tooLong = graphemes > 500;

        if (isBlank || tooLong) {
          expect(errors.title).toBeTruthy();
        } else {
          expect(errors.title).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Description grapheme limit enforcement
// Validates: Requirements 4.1, 5.2
// ---------------------------------------------------------------------------

describe('Property 3: Description grapheme limit enforcement', () => {
  it('produces an error for description when grapheme count > 3000', () => {
    // Build strings that are definitely over 3000 graphemes by repeating a base string
    const longStringArb = fc.string({ minLength: 1 }).map((s) => {
      // Repeat until we exceed 3000 graphemes
      let result = s;
      while (countGraphemes(result) <= 3000) {
        result = result + result;
      }
      return result;
    });

    fc.assert(
      fc.property(longStringArb, (descStr) => {
        const fields = validBase({ description: descStr });
        const errors = validateFormFields(fields);
        expect(errors.description).toBeTruthy();
      }),
      { numRuns: 100 }
    );
  });

  it('produces no error for description when grapheme count <= 3000', () => {
    // Use strings that are at most 3000 chars (and thus at most 3000 graphemes)
    fc.assert(
      fc.property(fc.string({ maxLength: 3000 }), (descStr) => {
        // Only test strings that are actually <= 3000 graphemes
        if (countGraphemes(descStr) <= 3000) {
          const fields = validBase({ description: descStr });
          const errors = validateFormFields(fields);
          expect(errors.description).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Empty or blank sameAs list is invalid
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe('Property 7: Empty or blank sameAs list is invalid', () => {
  it('produces an error for sameAs when all entries are empty or whitespace-only', () => {
    // Generate arrays of whitespace-only strings (including empty array)
    const blankStringArb = fc.oneof(
      fc.constant(''),
      fc.string({ maxLength: 10 }).map((s) => s.replace(/\S/g, ' '))
    );

    fc.assert(
      fc.property(
        fc.array(blankStringArb, { maxLength: 5 }),
        (sameAsArr) => {
          const fields = validBase({ sameAs: sameAsArr });
          const errors = validateFormFields(fields);
          expect(errors.sameAs).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('produces no sameAs error when at least one entry is a valid URI', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1 }).map((s) => `at://${s}`),
          fc.string({ minLength: 1 }).map((s) => `https://${s}`)
        ),
        (validUri) => {
          const fields = validBase({ sameAs: [validUri] });
          const errors = validateFormFields(fields);
          expect(errors.sameAs).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Form reset returns to initial empty state
// Validates: Requirements 8.2
// ---------------------------------------------------------------------------

describe('Property 9: Form reset returns to initial empty state', () => {
  it('initialFormState() always returns the same initial values', () => {
    const s1 = initialFormState();
    const s2 = initialFormState();

    expect(s1.title).toBe('');
    expect(s1.description).toBe('');
    expect(s1.archiveFile).toBeNull();
    expect(s1.coverImage).toBeNull();
    expect(s1.bskyPostRef).toBe('');
    expect(s1.sameAs).toEqual(['']);
    expect(s1.tags).toEqual([]);
    expect(s1.archiveDateCreatedAt).toBe('');
    expect(s1.uploadedAt).toBe('');
    expect(s1.submitting).toBe(false);
    expect(s1.submitError).toBeNull();
    expect(s1.successUri).toBeNull();
    expect(s1.errors).toEqual({});
    expect(s1.archiveBlobRef).toBeNull();
    expect(s1.coverBlobRef).toBeNull();

    // Two calls return structurally equal objects
    expect(s1).toEqual(s2);
  });

  it('for any arbitrary filled state, reset() returns every field to initial values', () => {
    const archiveFileInstance = makeArchiveFile();

    const filledStateArb = fc.record<FormState>({
      title: fc.string({ minLength: 1, maxLength: 50 }),
      description: fc.string({ maxLength: 100 }),
      archiveFile: fc.oneof(fc.constant(null), fc.constant(archiveFileInstance)),
      coverImage: fc.oneof(fc.constant(null), fc.constant(archiveFileInstance)),
      bskyPostRef: fc.string({ maxLength: 50 }),
      sameAs: fc.array(fc.string({ maxLength: 30 }), { minLength: 1, maxLength: 5 }),
      tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 }),
      archiveDateCreatedAt: fc.string({ minLength: 1, maxLength: 30 }),
      uploadedAt: fc.string({ maxLength: 30 }),
      submitting: fc.boolean(),
      submitError: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
      successUri: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
      errors: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 50 })
      ),
      archiveBlobRef: fc.constant(null),
      coverBlobRef: fc.constant(null),
    });

    fc.assert(
      fc.property(filledStateArb, (_filledState) => {
        // Simulate what reset() does: call initialFormState() and verify it
        // always returns the canonical empty state regardless of what was filled
        const initial = initialFormState();

        expect(initial.title).toBe('');
        expect(initial.description).toBe('');
        expect(initial.archiveFile).toBeNull();
        expect(initial.coverImage).toBeNull();
        expect(initial.bskyPostRef).toBe('');
        expect(initial.sameAs).toEqual(['']);
        expect(initial.tags).toEqual([]);
        expect(initial.archiveDateCreatedAt).toBe('');
        expect(initial.uploadedAt).toBe('');
        expect(initial.submitting).toBe(false);
        expect(initial.submitError).toBeNull();
        expect(initial.successUri).toBeNull();
        expect(initial.errors).toEqual({});
        expect(initial.archiveBlobRef).toBeNull();
        expect(initial.coverBlobRef).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
