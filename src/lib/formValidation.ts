/**
 * Pure form validation helpers for UploadForm.svelte.
 * Extracted so they can be tested directly without a Svelte component environment.
 */

import {
  countGraphemes,
  isValidSameAsUri,
  isValidAtUri,
  isFileSizeValid,
} from './validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormFields {
  title: string;
  description: string;
  archiveFile: File | null;
  coverImage: File | null;
  bskyPostRef: string;
  sameAs: string[];
  tags: string[];
  archiveDateCreatedAt: string;
  uploadedAt: string;
}

export interface FormState extends FormFields {
  submitting: boolean;
  submitError: string | null;
  successUri: string | null;
  errors: Record<string, string>;
  archiveBlobRef: unknown | null;
  coverBlobRef: unknown | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARCHIVE_MIME_TYPES = new Set([
  'application/warc',
  'application/warc+gzip',
  'application/wacz',
  'application/zip',
]);

const ARCHIVE_MAX_BYTES = 52_428_800; // 50 MB
const COVER_MAX_BYTES = 1_000_000;    // 1 MB
const TITLE_MAX_GRAPHEMES = 500;
const DESCRIPTION_MAX_GRAPHEMES = 3000;
const TAG_MAX_GRAPHEMES = 128;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates all form fields and returns a record of field-name → error message.
 * An empty record means the form is valid.
 */
export function validateFormFields(fields: FormFields): Record<string, string> {
  const errors: Record<string, string> = {};

  // title: required, ≤ 500 graphemes
  const trimmedTitle = fields.title.trim();
  if (!trimmedTitle) {
    errors.title = 'Title is required.';
  } else if (countGraphemes(fields.title) > TITLE_MAX_GRAPHEMES) {
    errors.title = `Title must be ${TITLE_MAX_GRAPHEMES} graphemes or fewer.`;
  }

  // description: optional, ≤ 3000 graphemes
  if (fields.description && countGraphemes(fields.description) > DESCRIPTION_MAX_GRAPHEMES) {
    errors.description = `Description must be ${DESCRIPTION_MAX_GRAPHEMES} graphemes or fewer.`;
  }

  // archiveFile: required, MIME type, size
  if (!fields.archiveFile) {
    errors.archiveFile = 'Archive file is required.';
  } else {
    // Validate that the file is one of the accepted MIME types, or falls back to
    // checking the filename extension for .wacz files (browsers often report an
    // empty or generic MIME type for WACZ files).
    if (!ARCHIVE_MIME_TYPES.has(fields.archiveFile.type) && !fields.archiveFile.name.endsWith('.wacz')) {
      errors.archiveFile =
        'Archive file must be a WARC, WARC+GZIP, WACZ, or ZIP file.';
    } else if (!isFileSizeValid(fields.archiveFile, ARCHIVE_MAX_BYTES)) {
      errors.archiveFile = 'Archive file must be 50 MB or smaller.';
    }
  }

  // coverImage: optional, MIME image/*, size ≤ 1 MB
  if (fields.coverImage) {
    if (!fields.coverImage.type.startsWith('image/')) {
      errors.coverImage = 'Cover image must be an image file.';
    } else if (!isFileSizeValid(fields.coverImage, COVER_MAX_BYTES)) {
      errors.coverImage = 'Cover image must be 1 MB or smaller.';
    }
  }

  // sameAs: at least one non-empty entry; each non-empty entry must be a valid URI
  const nonEmptySameAs = fields.sameAs.filter((s) => s.trim() !== '');
  if (nonEmptySameAs.length === 0) {
    errors.sameAs = 'At least one URL is required.';
  } else {
    const invalidIndex = fields.sameAs.findIndex(
      (s) => s.trim() !== '' && !isValidSameAsUri(s.trim())
    );
    if (invalidIndex !== -1) {
      errors[`sameAs_${invalidIndex}`] =
        'URL must start with at:// or https://.';
    }
  }

  // bskyPostRef: optional; if non-empty, must be a valid AT-URI
  if (fields.bskyPostRef.trim() && !isValidAtUri(fields.bskyPostRef.trim())) {
    errors.bskyPostRef =
      'Bluesky post reference must be a valid AT-URI (at://authority/collection/rkey).';
  }

  // archiveDateCreatedAt: required
  if (!fields.archiveDateCreatedAt.trim()) {
    errors.archiveDateCreatedAt = 'Archive creation date is required.';
  }

  // tags: each tag ≤ 128 graphemes
  fields.tags.forEach((tag, i) => {
    if (tag && countGraphemes(tag) > TAG_MAX_GRAPHEMES) {
      errors[`tag_${i}`] = `Tag must be ${TAG_MAX_GRAPHEMES} graphemes or fewer.`;
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/**
 * Returns the initial empty form state.
 * Used by reset() and as the baseline for property tests.
 */
export function initialFormState(): FormState {
  return {
    title: '',
    description: '',
    archiveFile: null,
    coverImage: null,
    bskyPostRef: '',
    sameAs: [''],
    tags: [],
    archiveDateCreatedAt: '',
    uploadedAt: '',
    submitting: false,
    submitError: null,
    successUri: null,
    errors: {},
    archiveBlobRef: null,
    coverBlobRef: null,
  };
}
