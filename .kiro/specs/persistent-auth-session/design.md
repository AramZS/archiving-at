# Design Document: Persistent Auth Session

## Overview

This feature adds persistent authentication session state to the Archiver's ATmosphere application. Currently, authenticated state (DID, display name, handle, avatar) lives only in Svelte component memory and is lost on page reload. The goal is to persist enough identity data across page loads so that returning users are automatically restored to their authenticated state without re-authenticating — for as long as the underlying OAuth tokens remain valid.

The design introduces a `SessionStore` module that wraps `localStorage` with a graceful in-memory fallback. On app initialisation, the store is read for a previously saved DID; if found, `BrowserOAuthClient.restore(did)` is called to rehydrate the live OAuth session. On sign-out, the store is cleared. OAuth tokens themselves are never touched — their lifecycle remains entirely within `@atproto/oauth-client-browser`.

---

## Architecture

The feature touches three layers:

```
┌─────────────────────────────────────────────────────────┐
│  App.svelte  (orchestration layer)                      │
│  - reads restore state on mount                         │
│  - calls SessionStore.write() on auth success           │
│  - calls SessionStore.clear() on sign-out               │
│  - shows loading indicator during restore               │
└────────────────────┬────────────────────────────────────┘
                     │ uses
┌────────────────────▼────────────────────────────────────┐
│  src/lib/sessionStore.ts  (new module)                  │
│  - SessionStore: read / write / clear                   │
│  - localStorage with in-memory fallback                 │
│  - DID validation on read                               │
└────────────────────┬────────────────────────────────────┘
                     │ delegates token management to
┌────────────────────▼────────────────────────────────────┐
│  @atproto/oauth-client-browser  (existing)              │
│  - BrowserOAuthClient.restore(did)                      │
│  - BrowserOAuthClient.signOut()                         │
└─────────────────────────────────────────────────────────┘
```

The `SessionStore` is a pure TypeScript module with no Svelte dependency, making it independently testable. `App.svelte` is the only consumer that wires the store into the reactive UI state.

---

## Components and Interfaces

### `SessionStore` (`src/lib/sessionStore.ts`)

The central new module. It exposes three functions and one type:

```typescript
export type ProfileData = {
  did: string;
  displayName: string | null;
  handle: string | null;
  avatar: string | null;
};

/**
 * Writes Profile_Data to the backing store (localStorage or in-memory fallback).
 * Only the four allowed fields are persisted — no tokens or credentials.
 */
export function writeSession(data: ProfileData): void;

/**
 * Reads and validates Profile_Data from the backing store.
 * Returns null if the store is empty, the entry is malformed, or the DID
 * fails validation (non-empty string check). Removes invalid entries.
 */
export function readSession(): ProfileData | null;

/**
 * Removes all stored Profile_Data from the backing store.
 * Errors are caught and logged; they do not propagate to callers.
 */
export function clearSession(): void;
```

**Storage key**: `archivers-at:session` (fixed, application-specific).

**Fallback behaviour**: On module load, the store attempts a test write/read to `localStorage`. If that throws (e.g. in private browsing with storage blocked), it switches to an in-memory `Map` for the lifetime of the page. A `console.warn` is emitted once when fallback mode is activated.

**Serialisation**: Profile_Data is serialised as JSON. On read, the parsed object is validated: `did` must be a non-empty string; other fields may be `null`. If validation fails, the entry is removed and `null` is returned.

### `App.svelte` changes

Three additions to the existing component:

1. **`restoring` state variable** (`boolean`, initially `true` when a stored DID is found, `false` otherwise) — gates the loading indicator.
2. **`initSession()` async function** — called once on mount via `$effect`. Reads the store, attempts `BrowserOAuthClient.restore(did)` if a DID is found, populates auth state on success, clears the store and resets to login on failure.
3. **`writeSession` call in `onAuthSuccess`** — persists Profile_Data immediately after a successful OAuth callback.
4. **`clearSession` call in `signOut`** — removes stored data before the OAuth sign-out call.

The loading indicator is rendered when `restoring === true`, replacing both the authenticated view and the login form.

---

## Data Models

### `ProfileData` (persisted to `localStorage`)

```typescript
type ProfileData = {
  did: string;           // required, non-empty; e.g. "did:plc:abc123"
  displayName: string | null;
  handle: string | null;
  avatar: string | null; // URL or null
};
```

**What is NOT stored**: OAuth access tokens, refresh tokens, DPoP keys, session secrets, or any other credential material. The `BrowserOAuthClient` manages those internally in its own `IndexedDB`-backed store.

### `localStorage` entry

```
key:   "archivers-at:session"
value: JSON string of ProfileData
```

Example:
```json
{
  "did": "did:plc:abc123",
  "displayName": "Alice",
  "handle": "alice.bsky.social",
  "avatar": "https://cdn.bsky.app/img/avatar/plain/did:plc:abc123/bafkreiabc@jpeg"
}
```

### In-memory fallback

When `localStorage` is unavailable, the same `ProfileData` object is held in a module-level variable. It is lost on page unload, giving the same behaviour as the current (pre-feature) implementation.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Session write/read round-trip

*For any* valid `ProfileData` object (with any combination of null/non-null optional fields), writing it to the `SessionStore` and then reading it back SHALL return an equivalent object.

**Validates: Requirements 1.1, 1.2, 2.1**

### Property 2: Only allowed fields are persisted

*For any* `ProfileData` object written to the `SessionStore`, the raw serialised value in the backing store SHALL contain only the fields `did`, `displayName`, `handle`, and `avatar` — no token, credential, or extra fields.

**Validates: Requirements 1.3**

### Property 3: Invalid DIDs are rejected and removed

*For any* value stored under the session key that has an empty, whitespace-only, or non-string `did` field, calling `readSession()` SHALL return `null` and SHALL remove the entry from the backing store.

**Validates: Requirements 5.2, 5.3**

### Property 4: Clear empties the store

*For any* `ProfileData` object written to the `SessionStore`, calling `clearSession()` SHALL result in `readSession()` returning `null`.

**Validates: Requirements 3.1**

### Property 5: Fallback mode is behaviourally equivalent

*For any* `ProfileData` object, the sequence write → read → clear SHALL produce the same observable results whether the `SessionStore` is operating in `localStorage` mode or in-memory fallback mode.

**Validates: Requirements 4.1, 4.2**

### Property 6: Restore failure clears the store

*For any* stored `ProfileData` and any error thrown by `BrowserOAuthClient.restore()`, the `SessionStore` SHALL be empty and auth state SHALL be reset to the unauthenticated state after the restore attempt completes.

**Validates: Requirements 2.3, 5.1**

### Property 7: Sign-out clears the store regardless of storage errors

*For any* `ProfileData` in the store, if `clearSession()` throws internally, the sign-out flow SHALL still complete and auth state SHALL be cleared.

**Validates: Requirements 3.3**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `localStorage` unavailable on module load | Switch to in-memory fallback; emit `console.warn` once |
| `localStorage.setItem` throws during write | Catch, log error, continue (data may not be persisted) |
| `localStorage.removeItem` throws during clear | Catch, log error, continue sign-out flow |
| Stored JSON is malformed (parse error) | Treat as missing; remove entry; return `null` |
| Stored `did` is empty or non-string | Remove entry; return `null` |
| `BrowserOAuthClient.restore()` throws | Clear store; reset auth state; show login page |
| `BrowserOAuthClient.restore()` returns no session | Treat as failure; clear store; show login page |

All storage errors are non-fatal. The app degrades gracefully: worst case, the user sees the login page and must re-authenticate.

---

## Testing Strategy

The project uses **Vitest** with **fast-check** for property-based testing (already present in `devDependencies`).

### Unit tests (`src/lib/sessionStore.test.ts`)

Specific examples and edge cases:

- `writeSession` + `readSession` returns the original data (example with concrete values)
- `readSession` on an empty store returns `null`
- `readSession` on a store with malformed JSON returns `null` and removes the entry
- `clearSession` after a write results in `readSession` returning `null`
- `clearSession` on an empty store does not throw
- Fallback mode is activated when `localStorage` throws; `console.warn` is emitted
- `readSession` in fallback mode returns `null` after `clearSession`

### Property-based tests (`src/lib/sessionStore.test.ts`)

Each property test runs a minimum of **100 iterations** via `fc.assert(..., { numRuns: 100 })`.

| Property | Tag |
|---|---|
| Property 1: Session write/read round-trip | `Feature: persistent-auth-session, Property 1: session write/read round-trip` |
| Property 2: Only allowed fields are persisted | `Feature: persistent-auth-session, Property 2: only allowed fields are persisted` |
| Property 3: Invalid DIDs are rejected and removed | `Feature: persistent-auth-session, Property 3: invalid DIDs are rejected and removed` |
| Property 4: Clear empties the store | `Feature: persistent-auth-session, Property 4: clear empties the store` |
| Property 5: Fallback mode is behaviourally equivalent | `Feature: persistent-auth-session, Property 5: fallback mode is behaviourally equivalent` |
| Property 6: Restore failure clears the store | `Feature: persistent-auth-session, Property 6: restore failure clears the store` |
| Property 7: Sign-out clears the store regardless of storage errors | `Feature: persistent-auth-session, Property 7: sign-out clears the store regardless of storage errors` |

**fast-check arbitraries** used:
- `fc.string()` for DID, displayName, handle, avatar values
- `fc.option(fc.string(), { nil: null })` for nullable fields
- `fc.oneof(fc.constant(''), fc.string().filter(s => s.trim() === ''))` for invalid DID values
- `fc.anything()` for malformed stored values

### Integration / App-level tests

The `App.svelte` restore-on-init flow is tested with example-based tests using mocked `BrowserOAuthClient` and `SessionStore`:

- App shows loading indicator while restore is in progress
- App shows authenticated view after successful restore
- App shows login page when store is empty (no restore attempted)
- App shows login page and clears store after restore failure
- `writeSession` is called with correct data after OAuth callback success
- `clearSession` is called before OAuth sign-out
