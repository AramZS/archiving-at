# Implementation Plan: Persistent Auth Session

## Overview

Implement persistent authentication session state for the Archiver's ATmosphere app. The work splits into two parts: (1) a new `SessionStore` module (`src/lib/sessionStore.ts`) that wraps `localStorage` with an in-memory fallback, and (2) wiring that module into `App.svelte` so sessions are saved on login, restored on page load, and cleared on sign-out.

## Tasks

- [x] 1. Create the `SessionStore` module
  - Create `src/lib/sessionStore.ts`
  - Define and export the `ProfileData` type with fields `did`, `displayName`, `handle`, `avatar`
  - On module load, probe `localStorage` with a test write/read; if it throws, switch to an in-memory variable and emit `console.warn` once
  - Implement `writeSession(data: ProfileData): void` — serialises to JSON and writes to the backing store under key `archivers-at:session`; catch and log any write errors without propagating
  - Implement `readSession(): ProfileData | null` — reads and JSON-parses the stored value; validates that `did` is a non-empty string; removes the entry and returns `null` on parse failure or invalid DID
  - Implement `clearSession(): void` — removes the stored entry; catches and logs any removal errors without propagating
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.3, 4.1, 4.2, 4.3, 5.2, 5.3_

- [x] 2. Write tests for `SessionStore`
  - Create `src/lib/sessionStore.test.ts`
  - [x] 2.1 Write example-based unit tests for `SessionStore`
    - `writeSession` + `readSession` returns the original data (concrete values)
    - `readSession` on an empty store returns `null`
    - `readSession` on a store with malformed JSON returns `null` and removes the entry
    - `clearSession` after a write results in `readSession` returning `null`
    - `clearSession` on an empty store does not throw
    - Fallback mode is activated when `localStorage` throws; `console.warn` is emitted
    - `readSession` in fallback mode returns `null` after `clearSession`
    - _Requirements: 1.1, 1.2, 3.1, 4.1, 4.2, 4.3, 5.2, 5.3_

  - [ ]* 2.2 Write property test for session write/read round-trip
    - **Property 1: Session write/read round-trip**
    - Use `fc.record({ did: fc.string({ minLength: 1 }), displayName: fc.option(fc.string(), { nil: null }), handle: fc.option(fc.string(), { nil: null }), avatar: fc.option(fc.string(), { nil: null }) })` to generate valid `ProfileData`
    - Assert that `readSession()` returns an object deeply equal to the written data
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 1.1, 1.2, 2.1**

  - [ ]* 2.3 Write property test for only allowed fields are persisted
    - **Property 2: Only allowed fields are persisted**
    - For any valid `ProfileData`, after `writeSession`, parse the raw `localStorage` value and assert the parsed object has exactly the keys `did`, `displayName`, `handle`, `avatar` and no others
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 1.3**

  - [ ]* 2.4 Write property test for invalid DIDs are rejected and removed
    - **Property 3: Invalid DIDs are rejected and removed**
    - Use `fc.oneof(fc.constant(''), fc.string().filter(s => s.trim() === ''), fc.constant(null), fc.constant(undefined), fc.integer())` to generate invalid DID values
    - Manually write a JSON object with the invalid DID under the session key, then call `readSession()` and assert it returns `null` and the key is absent from the store
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 2.5 Write property test for clear empties the store
    - **Property 4: Clear empties the store**
    - For any valid `ProfileData`, write it, call `clearSession()`, then assert `readSession()` returns `null`
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 3.1**

  - [ ]* 2.6 Write property test for fallback mode behavioural equivalence
    - **Property 5: Fallback mode is behaviourally equivalent**
    - Force the module into fallback mode by making `localStorage` throw, then for any valid `ProfileData` assert that write → read → clear produces the same results as in normal mode
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 4.1, 4.2**

- [x] 3. Checkpoint — ensure all `SessionStore` tests pass
  - Run `pnpm test --run` and confirm all tests in `sessionStore.test.ts` pass; ask the user if any questions arise.

- [x] 4. Wire `SessionStore` into `App.svelte`
  - Import `readSession`, `writeSession`, and `clearSession` from `src/lib/sessionStore.ts`
  - Add a `restoring` boolean state variable (initially `false`)
  - Add an `initSession()` async function that:
    - Calls `readSession()`; if no stored DID is found, returns immediately (login page shown as before)
    - Sets `restoring = true` before calling `BrowserOAuthClient.restore(did)`
    - On success: populates `did`, `displayName`, `handle`, `avatar`, and `session` from the stored `ProfileData` and the restored session; sets `restoring = false`
    - On failure: calls `clearSession()`, resets all auth state to `null`, sets `restoring = false`
  - Call `initSession()` once on mount via a `$effect` that runs only on the initial render (not on callback pages)
  - In `onAuthSuccess`: call `writeSession({ did, displayName, handle, avatar })` immediately after setting auth state
  - In `signOut`: call `clearSession()` before the `session.signOut()` call; ensure auth state is cleared even if `clearSession` throws
  - Add a loading indicator branch to the template: when `restoring === true`, render a loading message in place of both the authenticated view and the login form
  - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 5.1_

- [x] 5. Write App-level integration tests for session restore flow
  - Create or extend `src/app/App.test.ts` (or equivalent Vitest component test file)
  - [x] 5.1 Write example-based tests for the restore-on-init flow
    - Mock `BrowserOAuthClient` and `SessionStore` functions
    - App shows loading indicator while restore is in progress
    - App shows authenticated view after successful restore
    - App shows login page when store is empty (no restore attempted)
    - App shows login page and clears store after restore failure
    - `writeSession` is called with correct `ProfileData` after OAuth callback success
    - `clearSession` is called before OAuth sign-out
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2_

  - [ ]* 5.2 Write property test for restore failure clears the store
    - **Property 6: Restore failure clears the store**
    - For any stored `ProfileData` and any error thrown by `BrowserOAuthClient.restore()`, assert that after the restore attempt completes the store is empty and auth state is unauthenticated
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 2.3, 5.1**

  - [ ]* 5.3 Write property test for sign-out clears the store regardless of storage errors
    - **Property 7: Sign-out clears the store regardless of storage errors**
    - For any `ProfileData` in the store, simulate `clearSession()` throwing internally, then assert the sign-out flow still completes and auth state is cleared
    - Run with `{ numRuns: 100 }`
    - **Validates: Requirements 3.3**

- [~] 6. Final checkpoint — ensure all tests pass
  - Run `pnpm test --run` and confirm all tests pass across `sessionStore.test.ts` and the App-level test file; ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` (already in `devDependencies`) with a minimum of 100 runs each
- OAuth tokens are never stored — `BrowserOAuthClient` manages them internally; `SessionStore` only persists `ProfileData`
- The `localStorage` key is fixed as `archivers-at:session`
- The in-memory fallback is module-level and lasts only for the current page session
