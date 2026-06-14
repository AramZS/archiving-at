# Implementation Plan: archive-record-viewer

## Overview

Implement a public `/view/<rkey>?did=<did>` route that fetches an `at.archiving.session` record without authentication, constructs a blob URL for the WACZ file, and embeds it in a `<replay-web-page>` custom element. The home view's record cards become clickable links to the viewer. All pure functions live in a new `archiveRecord.ts` library module; the viewer UI is a new `RecordViewer.svelte` component; `App.svelte` is updated for routing and link rendering.

## Tasks

- [ ] 1. Create `src/lib/archiveRecord.ts` with types and pure helper functions
  - Define `ParsedAtUri`, `ArchiveRecordValue`, `FetchedRecord`, and `FetchRecordResult` TypeScript interfaces/types
  - Implement `parseAtUri(uri: string): ParsedAtUri | null` — splits an `at://` URI into `{ did, collection, rkey }`, returns `null` for any malformed input
  - Implement `buildBlobUrl(pdsHost: string, did: string, cid: string): string` — constructs the `com.atproto.sync.getBlob` HTTPS URL, stripping trailing slashes from `pdsHost` and percent-encoding `did` and `cid`
  - Implement `resolveOriginalUrl(sameAs: string[] | undefined): string | null` — returns the first element passing `isValidSameAsUri` from `validation.ts`, or `null`
  - _Requirements: 1.5, 1.6, 4.2, 5.1_

  - [ ]* 1.1 Write property test for `parseAtUri` round-trip
    - **Property 1: `parseAtUri` round-trip reconstructs the view path**
    - For any valid `at://<did>/<collection>/<rkey>` string (non-empty, slash-free components), `parseAtUri` returns a non-null result and `"/view/" + rkey + "?did=" + did` equals the expected view path
    - **Validates: Requirements 1.1, 2.1**

  - [ ]* 1.2 Write property test for `buildBlobUrl` URL correctness
    - **Property 2: `buildBlobUrl` always produces a valid HTTPS URL with correct query params**
    - For any non-empty `pdsHost`, `did`, and `cid`, the result parses as an HTTPS URL, the pathname contains `getBlob`, and `searchParams.get("did") === did` and `searchParams.get("cid") === cid`
    - **Validates: Requirements 4.1**

  - [ ]* 1.3 Write property test for `resolveOriginalUrl` first-valid-or-null
    - **Property 3: `resolveOriginalUrl` returns the first valid entry or null**
    - For any `string[]`, the result is the first element satisfying `isValidSameAsUri`, or `null` if none exists
    - **Validates: Requirements 5.1**

- [ ] 2. Add `resolvePdsHost` and `fetchRecord` to `src/lib/archiveRecord.ts`
  - Implement `resolvePdsHost(did: string): Promise<string>` — fetches DID document from `https://plc.directory/<did>` (did:plc) or `https://<hostname>/.well-known/did.json` (did:web), extracts `AtprotoPersonalDataServer` service endpoint; throws descriptive errors for HTTP failures and missing service
  - Implement `fetchRecord(did: string, rkey: string): Promise<FetchRecordResult>` — calls `resolvePdsHost`, then `com.atproto.repo.getRecord`, returns a discriminated union `{ status: 'success', record, pdsHost }` or `{ status: 'error', message }`; validates that `archiveFile.ref.$link` is non-empty before returning success
  - Map all error scenarios from the design's error-handling table to their exact error messages
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.3_

  - [ ]* 2.1 Write property test for `fetchRecord` state machine invariants
    - **Property 4: `fetchRecord` state machine — exactly one terminal state, success implies valid CID**
    - For any `did` and `rkey` with mocked fetch responses, `result.status` is exactly `'success'` or `'error'`; when `'success'`, `result.record.value.archiveFile.ref.$link` is non-empty
    - **Validates: Requirements 3.1, 3.2, 4.1**

  - [ ]* 2.2 Write unit tests for `resolvePdsHost` and `fetchRecord`
    - Test `resolvePdsHost`: correct extraction from a realistic DID document fixture; throws on HTTP error; throws on missing service; handles `did:web` scheme
    - Test `fetchRecord`: success path with mocked fetch; error path for DID resolution failure; error path for `getRecord` failure; error path for missing `archiveFile.ref.$link`
    - Test `parseAtUri`: valid URIs; malformed URIs (missing scheme, empty components, too few/extra parts)
    - Test `buildBlobUrl`: correct URL with known inputs; trailing slash stripped
    - Test `resolveOriginalUrl`: first valid entry returned; null for empty; null for all-invalid; `at://` accepted; `http://` rejected
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.3_

- [ ] 3. Checkpoint — Ensure all `archiveRecord.ts` tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Create `src/app/view/RecordViewer.svelte`
  - Add `Props` interface with `navigate: (to: string) => void`
  - Declare reactive state: `status` (`'loading' | 'success' | 'error'`), `record`, `pdsHost`, `errorMessage`, `replayError`, `replayLoaded`
  - In `onMount`: parse `rkey` from `location.pathname` and `did` from `URLSearchParams`; if either is missing set `status = 'error'` with the required message; otherwise call `fetchRecord(did, rkey)` and update state
  - Derive `blobUrl` and `original` from state after a successful fetch
  - In a `$effect` that fires when `status === 'success'`: inject the 30-second timeout and attach `error`/`load` DOM event listeners on the `<replay-web-page>` element as specified in the design
  - Render the template: always-visible back link; loading/error/success branches; `<svelte:head>` ReplayWeb.page script; full-width layout (no card `max-width` constraint)
  - Add a local `.d.ts` augmentation so TypeScript accepts the `<replay-web-page>` custom element tag without errors
  - Apply styling matching the existing palette (`#f4f6f8` background, `#1f2937` text, `#6366f1` accent)
  - _Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 4.1 Write component tests for `RecordViewer.svelte`
    - Test loading state: loading indicator visible, no metadata, no error
    - Test error state (missing params): error message visible, back link visible, no metadata
    - Test error state (fetch failure): error message visible, back link visible, no replay element
    - Test success state: `<h1>` with title, description paragraph, original URL link, `<replay-web-page>` element rendered
    - Test back link present in all three states
    - Mock `fetchRecord` via `vi.stubGlobal('fetch', ...)` — no real network calls
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4_

- [ ] 5. Update `src/app/App.svelte` — routing and record link rendering
  - Import `RecordViewer` from `'./view/RecordViewer.svelte'`
  - Import `parseAtUri` from `'../lib/archiveRecord'`
  - Insert the `{:else if path.startsWith('/view/')}` route branch before `{:else if did}` so the viewer is accessible without authentication
  - Replace the `{#each activityRecords as record}` block in the home view: use `parseAtUri(record.uri)` to conditionally render a clickable `<a>` link (title if present, else URI text) or a plain `<p>` fallback; implement the `onclick` handler with `history.pushState`/`navigate` and `window.location.href` fallback
  - Add `record-link` CSS class styling to match the existing card palette
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2_

  - [ ]* 5.1 Write routing tests for `App.svelte`
    - Test: unauthenticated user at `/view/rkey?did=…` renders `RecordViewer`, not `Login`
    - Test: authenticated user at `/view/rkey?did=…` renders `RecordViewer`, not the home view
    - Test: record with parseable AT-URI renders an `<a>` element with correct `href`
    - Test: record with un-parseable AT-URI renders a `<p>` with the raw URI
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2_

- [ ] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- `archiveRecord.ts` is intentionally side-effect-free (except `fetch`) to keep it testable with `vi.stubGlobal`
- Property tests use **fast-check** (already in `devDependencies`) with a minimum of 100 iterations each
- The `<replay-web-page>` custom element requires a TypeScript declaration; add a `replay-web-page.d.ts` file or a `svelteHTML` namespace augmentation in `src/app/view/RecordViewer.svelte` to silence compiler errors
- The routing change in `App.svelte` inserts the `/view/` branch **before** `{:else if did}` — this is the critical ordering that makes the viewer publicly accessible

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["5.1"] }
  ]
}
```
