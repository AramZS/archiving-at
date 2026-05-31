# Design Document: Upload Archive Session

## Overview

This feature adds an upload flow to the Archiver's ATmosphere SPA. A logged-in user can navigate from the home page to `/upload`, fill in a form covering all fields defined by the `at.archiving.session` lexicon, and submit the record (including blob uploads) to their PDS.

The implementation follows the existing patterns in the codebase:
- Svelte 5 `$state` runes for reactivity
- Manual `history.pushState` routing via the `navigate()` function in `App.svelte`
- `new Agent(session)` from `@atproto/api` for all ATProto API calls
- Plain Svelte + CSS matching the existing card/button style

The flow is: **navigate → fill form → validate → upload blobs → resolve bskyPostRef CID → create record → show result**.

---

## Architecture

The feature introduces two new files and modifies `App.svelte`:

```
src/
  app/
    App.svelte                  ← modified: add /upload route + nav button
    upload/
      UploadView.svelte         ← new: thin route wrapper, passes session + navigate
  components/
    UploadForm.svelte           ← new: form logic, validation, submission
  lib/
    uploadSession.ts            ← new: ATProto API calls (uploadBlob, getRecord, createRecord)
    validation.ts               ← new: pure validation helpers (grapheme count, URI format, file size)
```

### Component Hierarchy

```
App.svelte
  └── UploadView.svelte          (rendered when path === '/upload' && did)
        └── UploadForm.svelte    (all form state, validation, submission)
```

### Data Flow

```
User fills form
  → UploadForm validates fields (client-side, real-time)
  → On submit: validateAll() → uploadBlob(archiveFile) → uploadBlob(coverImage?)
                             → resolveStrongRef(bskyPostRef?) → createRecord()
  → Success: show AT-URI, offer reset
  → Error: show inline error, allow retry
```

---

## Components and Interfaces

### `App.svelte` changes

1. Add an `"Upload Archive Session"` button in the authenticated home view that calls `navigate('/upload')`.
2. Add a route branch: `{:else if path === '/upload'}` renders `<UploadView {session} {navigate} />`.
3. The `session` object is obtained by calling `client.restore(did)` — the same pattern used in `loadActivityRecords`. Since `App.svelte` currently restores the session only inside `loadActivityRecords`, a small refactor stores the restored session in a `$state` variable so it can be passed to `UploadView`.

### `UploadView.svelte`

A thin wrapper that:
- Receives `session: OAuthSession` and `navigate: (to: string) => void` as props.
- Renders `<UploadForm>` passing those props through.
- Handles the unauthenticated guard: if `session` is null, calls `navigate('/')`.

### `UploadForm.svelte`

The main form component. Manages all form state with `$state` runes.

**Props:**
```typescript
interface Props {
  session: OAuthSession;
  navigate: (to: string) => void;
}
```

**Internal state:**
```typescript
// Field values
let title = $state('');
let description = $state('');
let archiveFile = $state<File | null>(null);
let coverImage = $state<File | null>(null);
let bskyPostRef = $state('');
let sameAs = $state<string[]>(['']);
let tags = $state<string[]>([]);
let archiveDateCreatedAt = $state('');
let uploadedAt = $state('');

// Submission state
let submitting = $state(false);
let submitError = $state<string | null>(null);
let successUri = $state<string | null>(null);

// Validation errors (keyed by field name)
let errors = $state<Record<string, string>>({});
```

**Key methods:**
- `addSameAs()` / `removeSameAs(i)` — dynamic list management
- `addTag()` / `removeTag(i)` — dynamic list management
- `validate(): boolean` — runs all validation rules, populates `errors`, returns validity
- `handleSubmit()` — orchestrates the full submission pipeline
- `reset()` — clears all state back to initial values

### `uploadSession.ts`

Pure async functions wrapping ATProto API calls. Keeping these separate from the component makes them independently testable.

```typescript
import { Agent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-browser';

/** Upload a blob and return the blob ref from the PDS response. */
export async function uploadBlob(
  session: OAuthSession,
  file: File
): Promise<BlobRef>

/** Resolve an AT-URI to a { uri, cid } strong reference via getRecord. */
export async function resolveStrongRef(
  session: OAuthSession,
  atUri: string
): Promise<{ uri: string; cid: string }>

/** Create the at.archiving.session record and return the resulting AT-URI. */
export async function createArchiveSession(
  session: OAuthSession,
  record: ArchiveSessionRecord
): Promise<string>
```

### `validation.ts`

Pure functions with no side effects — suitable for property-based testing.

```typescript
/** Count Unicode grapheme clusters (uses Intl.Segmenter). */
export function countGraphemes(str: string): number

/** Validate that a string is a valid AT-URI (at://) or HTTPS URI. */
export function isValidSameAsUri(uri: string): boolean

/** Validate that a string is a valid AT-URI (at://). */
export function isValidAtUri(uri: string): boolean

/** Validate that a file does not exceed the given byte limit. */
export function isFileSizeValid(file: File, maxBytes: number): boolean
```

---

## Data Models

### `ArchiveSessionRecord`

Mirrors the `at.archiving.session` lexicon fields that the form populates:

```typescript
interface BlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

interface StrongRef {
  uri: string;
  cid: string;
}

interface ArchiveSessionRecord {
  $type: 'at.archiving.session';
  title: string;                          // required, max 500 graphemes
  archiveFile: BlobRef;                   // required blob
  sameAs: string[];                       // required, min 1 item
  archiveDateCreatedAt: string;           // required, ISO 8601 datetime
  description?: string;                   // optional, max 3000 graphemes
  coverImage?: BlobRef;                   // optional blob
  bskyPostRef?: StrongRef;               // optional strong ref
  tags?: string[];                        // optional
  uploadedAt?: string;                    // optional, ISO 8601 datetime
}
```

### AT-URI format

AT-URIs follow the pattern `at://<authority>/<collection>/<rkey>`, e.g.:
`at://did:plc:abc123/app.bsky.feed.post/3jxtttklmak24`

The `resolveStrongRef` function parses this into `{ authority, collection, rkey }` and calls:
```typescript
agent.com.atproto.repo.getRecord({ repo: authority, collection, rkey })
```
returning `{ uri: record.uri, cid: record.cid }`.

### Validation rules summary

| Field | Rule |
|---|---|
| `title` | Required; ≤ 500 graphemes |
| `description` | Optional; ≤ 3000 graphemes |
| `archiveFile` | Required; MIME in `{application/warc, application/warc+gzip, application/wacz, application/zip}`; ≤ 50 MB |
| `coverImage` | Optional; MIME matches `image/*`; ≤ 1 MB |
| `sameAs` | Required; ≥ 1 entry; each entry is `at://` or `https://` URI |
| `bskyPostRef` | Optional; if non-empty, must be valid `at://` URI; must resolve via `getRecord` |
| `archiveDateCreatedAt` | Required; valid datetime |
| `tags` | Optional; each tag ≤ 128 graphemes |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Grapheme counter is non-negative and bounded

*For any* string `s`, `countGraphemes(s)` SHALL return a value ≥ 0 and ≤ `s.length`, and SHALL return the same count as iterating `new Intl.Segmenter().segment(s)` manually.

**Validates: Requirements 5.1, 5.2**

### Property 2: Title grapheme limit enforcement

*For any* string, `validate()` SHALL produce a non-empty error for the `title` field if and only if the string's grapheme count exceeds 500 or the string is empty/whitespace-only (assuming all other fields are valid).

**Validates: Requirements 3.1, 5.1**

### Property 3: Description grapheme limit enforcement

*For any* non-empty string whose grapheme count exceeds 3000, `validate()` SHALL produce a non-empty error for the `description` field; *for any* string whose grapheme count is ≤ 3000, `validate()` SHALL produce no error for `description` (assuming other fields are valid).

**Validates: Requirements 4.1, 5.2**

### Property 4: File size validation

*For any* integer `size` and integer `maxBytes`, `isFileSizeValid({ size }, maxBytes)` SHALL return `false` if `size > maxBytes` and `true` if `size ≤ maxBytes`. This property covers both the 50 MB archive file limit and the 1 MB cover image limit.

**Validates: Requirements 5.3, 5.4**

### Property 5: sameAs URI validation

*For any* string, `isValidSameAsUri` SHALL return `true` if and only if the string begins with `at://` or `https://` and has non-empty content after the scheme. *For any* string that does not begin with `at://` or `https://`, `isValidSameAsUri` SHALL return `false`.

**Validates: Requirements 5.5**

### Property 6: AT-URI validation

*For any* string that matches the pattern `at://<authority>/<collection>/<rkey>` with non-empty components, `isValidAtUri` SHALL return `true`; *for any* string that does not match this pattern, `isValidAtUri` SHALL return `false`.

**Validates: Requirements 5.6**

### Property 7: Empty or blank sameAs list is invalid

*For any* form state where `sameAs` is an empty array or every entry is an empty or whitespace-only string, `validate()` SHALL produce a non-empty error for the `sameAs` field.

**Validates: Requirements 3.3**

### Property 8: Record payload contains all provided field values

*For any* set of valid field values passed to `createArchiveSession`, the constructed record payload SHALL contain each provided value at the corresponding field key, and SHALL not contain fields that were not provided (optional fields absent from input must be absent from the payload).

**Validates: Requirements 7.1**

### Property 9: Form reset returns to initial empty state

*For any* form state with arbitrary field values filled in, calling `reset()` SHALL return every field to its initial empty value (empty strings, null files, empty arrays, null success/error state).

**Validates: Requirements 8.2**

---

## Error Handling

### Validation errors

Client-side validation runs on submit (and optionally on blur for individual fields). Errors are stored in the `errors` record keyed by field name and displayed inline beneath each field. The submit button is disabled while `submitting` is true.

### Blob upload failures

If `uploadBlob` throws, the error message is captured in `submitError` and displayed as a banner above the submit button. The form remains editable so the user can retry.

### `bskyPostRef` resolution failures

If `resolveStrongRef` throws (record not found, network error, etc.), an inline error is set on the `bskyPostRef` field. Submission is blocked until the field is cleared or corrected.

### Record creation failures

If `createArchiveSession` throws, the error is shown in `submitError`. The submit button is re-enabled so the user can retry without re-uploading blobs (blob refs from a successful upload are retained in component state).

### Network / session errors

All ATProto calls are wrapped in try/catch. Errors are surfaced as human-readable messages. The `OAuthSession` handles token refresh automatically via `@atproto/oauth-client-browser`.

### Error display pattern

```
[field label]
[field input]
[inline error message in red, role="alert"]
```

Global submission errors appear in a banner above the submit button:
```
[error banner, role="alert"]
[Submit button]
```

---

## Testing Strategy

### Unit tests (Vitest)

Unit tests cover specific examples and edge cases for the pure helper functions in `validation.ts` and `uploadSession.ts`.

**`validation.ts` unit tests:**
- `countGraphemes('')` returns 0
- `countGraphemes('hello')` returns 5
- `countGraphemes('👨‍👩‍👧')` returns 1 (multi-codepoint grapheme cluster)
- `isValidSameAsUri('at://did:plc:abc/col/rkey')` returns true
- `isValidSameAsUri('https://example.com')` returns true
- `isValidSameAsUri('http://example.com')` returns false
- `isValidSameAsUri('')` returns false
- `isValidAtUri('at://did:plc:abc/app.bsky.feed.post/rkey')` returns true
- `isValidAtUri('https://example.com')` returns false
- `isFileSizeValid` boundary cases at exactly 50 MB and 1 MB

**`uploadSession.ts` unit tests (with mocked Agent):**
- `resolveStrongRef` correctly parses AT-URI components and calls `getRecord` with the right params
- `resolveStrongRef` throws a descriptive error when `getRecord` returns no record
- `createArchiveSession` constructs the record payload correctly and returns the AT-URI

### Property-based tests (Vitest + fast-check)

The project uses Vitest. The property-based testing library is [fast-check](https://fast-check.dev/), which integrates directly with Vitest via `fc.assert(fc.property(...))`. Add it as a dev dependency: `pnpm add -D fast-check`.

Each property test runs a minimum of 100 iterations (fast-check default is 100; set explicitly via `{ numRuns: 100 }` in `fc.assert`).

**`validation.ts` property tests:**

```
// Feature: upload-archive-session, Property 1: grapheme counter is non-negative and bounded
// Feature: upload-archive-session, Property 2: title grapheme limit enforcement
// Feature: upload-archive-session, Property 3: description grapheme limit enforcement
// Feature: upload-archive-session, Property 4: file size validation
// Feature: upload-archive-session, Property 5: sameAs URI validation
// Feature: upload-archive-session, Property 6: AT-URI validation
// Feature: upload-archive-session, Property 7: empty or blank sameAs list is invalid
```

**`uploadSession.ts` property tests:**

```
// Feature: upload-archive-session, Property 8: record payload contains all provided field values
```

**`UploadForm.svelte` / form state property tests:**

```
// Feature: upload-archive-session, Property 9: form reset returns to initial empty state
```

Property 4 (file size) uses `fc.integer({ min: 0, max: 100_000_000 })` to generate sizes and a plain object `{ size }` (since `isFileSizeValid` only reads `.size`), keeping tests fast and free of I/O.

Properties 5 and 6 (URI validation) use `fc.string()` for negative cases and structured arbitraries for positive cases (e.g., `fc.tuple(fc.constantFrom('at://', 'https://'), fc.string({ minLength: 1 }))`).

### Integration tests

Integration tests are out of scope for this feature's automated test suite. Manual testing against a real PDS (or a local PDS dev instance) covers:
- Successful blob upload and record creation end-to-end
- OAuth session token refresh during a long upload
- `bskyPostRef` CID resolution against a real Bluesky post

### Component tests

Svelte component testing (e.g., with `@testing-library/svelte`) is not set up in this project. The form's UI behavior (button states, error display, dynamic list add/remove) is covered by manual testing and the unit tests on the underlying validation logic.
