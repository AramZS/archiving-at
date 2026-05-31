# Implementation Plan: Upload Archive Session

## Overview

Implement the upload-archive-session feature in the Archiver's ATmosphere SPA. The work proceeds bottom-up: pure validation helpers first, then ATProto API helpers, then the form component, then the route wrapper, and finally the App.svelte integration. Tests are placed alongside the code they cover.

## Tasks

- [x] 1. Add `fast-check` dev dependency and create validation helpers
  - Run `pnpm add -D fast-check` to add the property-based testing library
  - Create `src/lib/validation.ts` with the following exported functions:
    - `countGraphemes(str: string): number` — counts Unicode grapheme clusters using `Intl.Segmenter`
    - `isValidSameAsUri(uri: string): boolean` — returns true iff the string starts with `at://` or `https://` and has non-empty content after the scheme
    - `isValidAtUri(uri: string): boolean` — returns true iff the string matches `at://<authority>/<collection>/<rkey>` with all three components non-empty
    - `isFileSizeValid(file: { size: number }, maxBytes: number): boolean` — returns false if `file.size > maxBytes`, true otherwise
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 1.1 Write unit tests for `validation.ts`
    - Create `src/lib/validation.test.ts`
    - Test `countGraphemes('')` returns 0
    - Test `countGraphemes('hello')` returns 5
    - Test `countGraphemes('👨‍👩‍👧')` returns 1 (multi-codepoint grapheme cluster)
    - Test `isValidSameAsUri('at://did:plc:abc/col/rkey')` returns true
    - Test `isValidSameAsUri('https://example.com')` returns true
    - Test `isValidSameAsUri('http://example.com')` returns false
    - Test `isValidSameAsUri('')` returns false
    - Test `isValidAtUri('at://did:plc:abc/app.bsky.feed.post/rkey')` returns true
    - Test `isValidAtUri('https://example.com')` returns false
    - Test `isFileSizeValid` boundary cases at exactly 52,428,800 bytes and 1,000,000 bytes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 1.2 Write property test for grapheme counter (Property 1)
    - **Property 1: Grapheme counter is non-negative and bounded**
    - For any string `s`, `countGraphemes(s)` returns a value ≥ 0 and ≤ `s.length`, and matches the count from iterating `new Intl.Segmenter().segment(s)` manually
    - Use `fc.string()` as the arbitrary; run with `{ numRuns: 100 }`
    - **Validates: Requirements 5.1, 5.2**

  - [x]* 1.3 Write property test for file size validation (Property 4)
    - **Property 4: File size validation**
    - For any integers `size` and `maxBytes`, `isFileSizeValid({ size }, maxBytes)` returns false if `size > maxBytes` and true if `size ≤ maxBytes`
    - Use `fc.integer({ min: 0, max: 100_000_000 })` for both values; run with `{ numRuns: 100 }`
    - **Validates: Requirements 5.3, 5.4**

  - [x]* 1.4 Write property test for sameAs URI validation (Property 5)
    - **Property 5: sameAs URI validation**
    - For any string, `isValidSameAsUri` returns true iff it starts with `at://` or `https://` and has non-empty content after the scheme
    - Use `fc.string()` for negative cases; use `fc.tuple(fc.constantFrom('at://', 'https://'), fc.string({ minLength: 1 }))` for positive cases; run with `{ numRuns: 100 }`
    - **Validates: Requirements 5.5**

  - [x]* 1.5 Write property test for AT-URI validation (Property 6)
    - **Property 6: AT-URI validation**
    - For any string matching `at://<authority>/<collection>/<rkey>` with non-empty components, `isValidAtUri` returns true; for any string that does not match, it returns false
    - Use `fc.string()` for negative cases; construct valid AT-URIs from three `fc.string({ minLength: 1 })` arbitraries for positive cases; run with `{ numRuns: 100 }`
    - **Validates: Requirements 5.6**

- [x] 2. Create ATProto API helpers in `uploadSession.ts`
  - Create `src/lib/uploadSession.ts` with the following exported async functions:
    - `uploadBlob(session: OAuthSession, file: File): Promise<BlobRef>` — creates an `Agent` from the session, calls `agent.com.atproto.repo.uploadBlob`, and returns the blob ref from the response
    - `resolveStrongRef(session: OAuthSession, atUri: string): Promise<{ uri: string; cid: string }>` — parses the AT-URI into `{ authority, collection, rkey }`, calls `agent.com.atproto.repo.getRecord`, and returns `{ uri, cid }`; throws a descriptive error if the record is not found
    - `createArchiveSession(session: OAuthSession, record: ArchiveSessionRecord): Promise<string>` — calls `agent.com.atproto.repo.createRecord` with `$type: 'at.archiving.session'` and returns the resulting AT-URI
  - Define and export the `BlobRef`, `StrongRef`, and `ArchiveSessionRecord` TypeScript interfaces in this file
  - Import `OAuthSession` from `@atproto/oauth-client-browser` (not from `@atproto/api`, which does not export it)
  - _Requirements: 6.1, 6.2, 7.1_

  - [x]* 2.1 Write unit tests for `uploadSession.ts` (with mocked Agent)
    - Create `src/lib/uploadSession.test.ts`
    - Mock `@atproto/api` Agent to control `com.atproto.repo.uploadBlob`, `com.atproto.repo.getRecord`, and `com.atproto.repo.createRecord`
    - Test `resolveStrongRef` correctly parses AT-URI components and calls `getRecord` with the right `repo`, `collection`, and `rkey` params
    - Test `resolveStrongRef` throws a descriptive error when `getRecord` returns no record
    - Test `createArchiveSession` constructs the record payload correctly and returns the AT-URI from the response
    - _Requirements: 6.1, 6.2, 7.1_

  - [x]* 2.2 Write property test for record payload completeness (Property 8)
    - **Property 8: Record payload contains all provided field values**
    - For any set of valid field values passed to `createArchiveSession`, the constructed record payload contains each provided value at the corresponding field key, and does not contain optional fields that were absent from the input
    - Mock the Agent so `createRecord` captures the payload; use `fc.record(...)` arbitraries for the input fields; run with `{ numRuns: 100 }`
    - **Validates: Requirements 7.1**

- [x] 3. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement `UploadForm.svelte`
  - Create `src/components/UploadForm.svelte`
  - Declare props: `session: OAuthSession` and `navigate: (to: string) => void`
  - Declare all `$state` fields: `title`, `description`, `archiveFile`, `coverImage`, `bskyPostRef`, `sameAs` (initialised to `['']`), `tags`, `archiveDateCreatedAt`, `uploadedAt`, `submitting`, `submitError`, `successUri`, `errors`
  - Implement `addSameAs()` / `removeSameAs(i)` and `addTag()` / `removeTag(i)` for dynamic list management
  - Implement `validate(): boolean` — runs all validation rules using helpers from `validation.ts`, populates `errors`, returns overall validity; validates: title (required, ≤ 500 graphemes), description (≤ 3000 graphemes), archiveFile (required, MIME type, ≤ 52,428,800 bytes), coverImage (MIME type, ≤ 1,000,000 bytes), each sameAs entry (valid URI), bskyPostRef (valid AT-URI if non-empty), archiveDateCreatedAt (required), each tag (≤ 128 graphemes)
  - Implement `handleSubmit()` — calls `validate()`, then `uploadBlob` for archiveFile, then `uploadBlob` for coverImage if provided, then `resolveStrongRef` for bskyPostRef if non-empty, then `createArchiveSession`; sets `successUri` on success or `submitError` on failure; retains blob refs in state so the user can retry record creation without re-uploading
  - Implement `reset()` — clears all field values back to initial empty state
  - Render the form with all fields from Requirements 3 and 4: title input, description textarea, archiveFile file input (accept attribute set to the four MIME types), coverImage file input (accept="image/*"), bskyPostRef text input, sameAs dynamic list with add/remove buttons, tags dynamic list with add/remove buttons, archiveDateCreatedAt datetime-local input, uploadedAt datetime-local input
  - Display inline validation errors beneath each field (`role="alert"`)
  - Display a global error banner above the submit button when `submitError` is set (`role="alert"`)
  - Disable the submit button and show a loading indicator while `submitting` is true
  - Show a success message with the AT-URI and a "Upload another" reset button when `successUri` is set
  - Include a "Cancel" button that calls `navigate('/')`
  - Style using the existing card/button CSS patterns from `App.svelte`
  - _Requirements: 3.1–3.5, 4.1–4.5, 5.1–5.7, 6.1–6.3, 7.1–7.4, 8.1–8.2_

  - [x]* 4.1 Write property test for title grapheme limit enforcement (Property 2)
    - **Property 2: Title grapheme limit enforcement**
    - For any string, `validate()` produces a non-empty error for `title` iff the grapheme count exceeds 500 or the string is empty/whitespace-only (all other fields valid)
    - Extract the `validate` logic into a testable unit or test via the component's exported state; use `fc.string()` with `{ numRuns: 100 }`
    - **Validates: Requirements 3.1, 5.1**

  - [x]* 4.2 Write property test for description grapheme limit enforcement (Property 3)
    - **Property 3: Description grapheme limit enforcement**
    - For any non-empty string whose grapheme count exceeds 3000, `validate()` produces a non-empty error for `description`; for any string ≤ 3000 graphemes, no error is produced (other fields valid)
    - Use `fc.string()` with `{ numRuns: 100 }`
    - **Validates: Requirements 4.1, 5.2**

  - [x]* 4.3 Write property test for empty/blank sameAs list (Property 7)
    - **Property 7: Empty or blank sameAs list is invalid**
    - For any form state where `sameAs` is an empty array or every entry is empty/whitespace-only, `validate()` produces a non-empty error for the `sameAs` field
    - Use `fc.array(fc.string())` filtered to all-blank entries; run with `{ numRuns: 100 }`
    - **Validates: Requirements 3.3**

  - [x]* 4.4 Write property test for form reset (Property 9)
    - **Property 9: Form reset returns to initial empty state**
    - For any form state with arbitrary field values filled in, calling `reset()` returns every field to its initial empty value (empty strings, null files, empty arrays, null success/error state)
    - Test the `reset()` function directly against the initial state contract; use `fc.record(...)` to generate arbitrary filled states; run with `{ numRuns: 100 }`
    - **Validates: Requirements 8.2**

- [x] 5. Implement `UploadView.svelte`
  - Create `src/app/upload/UploadView.svelte`
  - Declare props: `session: OAuthSession | null` and `navigate: (to: string) => void`
  - In a `$effect`, if `session` is null, call `navigate('/')` to redirect unauthenticated users
  - Render `<UploadForm {session} {navigate} />` when `session` is non-null
  - _Requirements: 2.1, 2.2_

- [ ] 6. Integrate into `App.svelte`
  - Refactor `App.svelte` to store the restored `OAuthSession` in a `$state` variable (e.g., `let session = $state<OAuthSession | null>(null)`) so it can be passed to `UploadView`; update `loadActivityRecords` to set this variable after calling `client.restore(did)`
  - Import `UploadView` from `./upload/UploadView.svelte`
  - Add an `"Upload Archive Session"` button in the authenticated home view that calls `navigate('/upload')`; place it alongside the existing "Sign out" button
  - Add a route branch in the template: `{:else if path === '/upload'}` renders `<UploadView {session} {navigate} />`
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

- [~] 7. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- `fast-check` is already present in `package.json` as a dev dependency; task 1 installs it if not yet in `node_modules`
- Property tests use `fc.assert(fc.property(...), { numRuns: 100 })` via Vitest
- `OAuthSession` must be imported from `@atproto/oauth-client-browser`, not from `@atproto/api` (which does not export it — see existing `getBskyData.ts` for the correct import pattern)
- Blob refs from a successful upload are retained in component state so the user can retry record creation without re-uploading blobs
