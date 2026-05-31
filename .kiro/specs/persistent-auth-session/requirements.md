# Requirements Document

## Introduction

This feature adds persistent authentication session state to the Archiver's ATmosphere application. Currently, when a user logs in via AT Protocol (Bluesky) OAuth, their authenticated state (DID, display name, handle, avatar) is held only in Svelte component memory. Refreshing the page or navigating away and returning forces the user to log in again.

The goal is to persist enough session identity data (the authenticated DID and associated profile fields) across page reloads and browser sessions, using `localStorage` or cookies as the backing store. On page load, the app should detect a previously stored DID, attempt to restore the OAuth session via the existing `BrowserOAuthClient.restore()` API, and resume the authenticated state without requiring the user to sign in again — for as long as the stored credential remains valid.

## Glossary

- **Session_Store**: The browser-side persistence layer (localStorage or a cookie) responsible for reading and writing the authenticated user's identity data.
- **Auth_State**: The in-memory Svelte state representing the currently authenticated user, including `did`, `displayName`, `handle`, `avatar`, and `session`.
- **DID**: Decentralized Identifier — the unique, stable identifier for an AT Protocol account (e.g. `did:plc:abc123`).
- **BrowserOAuthClient**: The `@atproto/oauth-client-browser` client used to initiate sign-in, handle OAuth callbacks, and restore existing sessions.
- **Restore**: The process of calling `BrowserOAuthClient.restore(did)` to rehydrate a live OAuth session from the client's internal token store using a known DID.
- **Profile_Data**: The subset of user profile fields persisted to the Session_Store: `did`, `displayName`, `handle`, and `avatar`.
- **Session_Lifetime**: The duration for which stored session identity data is considered valid, bounded by the OAuth token expiry managed by the BrowserOAuthClient.

---

## Requirements

### Requirement 1: Persist Authenticated Identity on Login

**User Story:** As a returning user, I want my login state to be saved when I sign in, so that I do not have to re-authenticate every time I open the app.

#### Acceptance Criteria

1. WHEN a user successfully completes OAuth authentication, THE Session_Store SHALL write the authenticated user's Profile_Data (DID, displayName, handle, avatar) to persistent browser storage.
2. WHEN Profile_Data is written to the Session_Store, THE Session_Store SHALL store the data in `localStorage` under a fixed, application-specific key.
3. WHEN Profile_Data is written to the Session_Store, THE Session_Store SHALL NOT store OAuth tokens, refresh tokens, or any credential material beyond the DID — token management remains the responsibility of the BrowserOAuthClient.

---

### Requirement 2: Restore Session on Page Load

**User Story:** As a returning user, I want the app to automatically restore my session when I revisit the page, so that I am not shown the login screen unnecessarily.

#### Acceptance Criteria

1. WHEN the application initialises and the Session_Store contains a previously saved DID, THE App SHALL attempt to restore the OAuth session by calling `BrowserOAuthClient.restore(did)`.
2. WHEN the restore call succeeds, THE App SHALL populate Auth_State with the stored Profile_Data and the restored OAuth session without redirecting the user to the login page.
3. WHEN the restore call fails (e.g. token expired, revoked, or network error), THE App SHALL clear the Session_Store and display the login page.
4. WHILE a session restore is in progress, THE App SHALL display a loading indicator and SHALL NOT render the authenticated view or the login form.
5. WHEN the application initialises and the Session_Store contains no saved DID, THE App SHALL display the login page immediately without attempting a restore.

---

### Requirement 3: Clear Persisted State on Sign-Out

**User Story:** As a user, I want signing out to fully remove my saved session data, so that the next person to use the browser is not automatically signed in as me.

#### Acceptance Criteria

1. WHEN a user initiates sign-out, THE Session_Store SHALL remove all stored Profile_Data from persistent browser storage before the sign-out flow completes.
2. WHEN sign-out completes, THE App SHALL clear Auth_State and display the login page.
3. IF the Session_Store removal operation fails, THEN THE App SHALL log the error and continue with the sign-out flow, ensuring Auth_State is cleared regardless.

---

### Requirement 4: Handle Storage Unavailability

**User Story:** As a user in a restricted browser environment (e.g. private/incognito mode with storage blocked), I want the app to still function, so that I can log in and use the app for the current session even if persistence is unavailable.

#### Acceptance Criteria

1. IF `localStorage` is unavailable or throws when accessed, THEN THE Session_Store SHALL fall back to in-memory storage for the duration of the page session.
2. WHEN the Session_Store is operating in in-memory fallback mode, THE App SHALL function identically to the normal authenticated flow for the current page session.
3. IF `localStorage` is unavailable or throws when accessed, THEN THE Session_Store SHALL log a warning indicating that session persistence is disabled.

---

### Requirement 5: Session Validity and Expiry

**User Story:** As a user, I want stale or expired session data to be cleaned up automatically, so that I am not left in a broken half-authenticated state.

#### Acceptance Criteria

1. WHEN the App attempts to restore a session and the BrowserOAuthClient indicates the session is expired or invalid, THE App SHALL treat this as a restore failure and apply the behaviour defined in Requirement 2, Criterion 3.
2. WHEN Profile_Data is read from the Session_Store on page load, THE App SHALL validate that the stored DID is a non-empty string before attempting a restore.
3. IF the stored DID fails validation, THEN THE Session_Store SHALL remove the invalid entry and THE App SHALL display the login page.
