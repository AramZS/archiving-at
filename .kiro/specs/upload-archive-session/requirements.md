# Requirements Document

## Introduction

This feature adds an "Upload Archive Session" flow to the Archiver's ATmosphere Svelte SPA. A logged-in user can navigate from the home page to a dedicated upload view, fill in a form covering all fields defined by the `at.archiving.session` ATProto lexicon, and submit the record (including blob uploads) to their PDS. The feature must integrate with the existing OAuth session and the app's manual `history.pushState`-based router.

## Glossary

- **App**: The Archiver's ATmosphere Svelte 5 SPA.
- **UploadForm**: The Svelte component that renders the archive-session upload form.
- **UploadView**: The route (`/upload`) that hosts the UploadForm.
- **PDS**: The user's ATProto Personal Data Server, accessed via the authenticated OAuth session.
- **OAuthSession**: The active `@atproto/oauth-client-browser` session object used to make authenticated ATProto API calls.
- **ArchiveFile**: The primary archive blob (WARC, WARC+GZIP, WACZ, or ZIP) attached to the record.
- **CoverImage**: An optional image blob used as a thumbnail for the archive session record.
- **SameAs**: An array of URIs (AT-protocol or HTTPS) identifying the original resources covered by the archive.
- **BskyPostRef**: An optional strong reference (`com.atproto.repo.strongRef`) linking the record to a Bluesky post. The user provides only the AT-URI; the App resolves the corresponding CID automatically via `com.atproto.repo.getRecord` before creating the record.
- **Router**: The App's client-side routing mechanism using `history.pushState` and a `path` state variable.
- **Lexicon**: The `at.archiving.session` ATProto lexicon definition at `lexicons/at/archiving/session.json`.

---

## Requirements

### Requirement 1: Navigation Entry Point

**User Story:** As a logged-in user, I want a clearly visible button on the home page, so that I can navigate to the upload form without reloading the page.

#### Acceptance Criteria

1. WHILE a user is authenticated, THE App SHALL display an "Upload Archive Session" button on the home page.
2. WHEN the user activates the "Upload Archive Session" button, THE Router SHALL navigate to `/upload` using `history.pushState` without a full page reload.
3. WHILE a user is not authenticated, THE App SHALL NOT display the "Upload Archive Session" button.

---

### Requirement 2: Upload Route

**User Story:** As a logged-in user, I want a dedicated upload page at `/upload`, so that the form has its own URL I can return to.

#### Acceptance Criteria

1. WHEN the Router path is `/upload` and a user is authenticated, THE App SHALL render the UploadView.
2. WHEN the Router path is `/upload` and no user is authenticated, THE App SHALL redirect to the home page (`/`).
3. WHEN the user activates a "Back" or "Cancel" control within the UploadView, THE Router SHALL navigate back to `/` using `history.pushState`.
4. WHEN the browser's back button is used from `/upload`, THE Router SHALL restore the previous route correctly via the existing `popstate` listener.

---

### Requirement 3: Required Form Fields

**User Story:** As a logged-in user, I want to fill in all required fields for an archive session, so that I can create a valid `at.archiving.session` record on my PDS.

#### Acceptance Criteria

1. THE UploadForm SHALL include a text input for `title` (required, max 500 graphemes).
2. THE UploadForm SHALL include a file input for `archiveFile` (required) that accepts only `application/warc`, `application/warc+gzip`, `application/wacz`, and `application/zip` MIME types.
3. THE UploadForm SHALL include a dynamic list input for `sameAs` (required, at least one URI) where the user can add and remove individual URI entries.
4. THE UploadForm SHALL include a datetime-local input for `archiveDateCreatedAt` (required).
5. WHEN the user submits the form with any required field empty or invalid, THE UploadForm SHALL display a descriptive inline validation error for each offending field and SHALL NOT submit the record.

---

### Requirement 4: Optional Form Fields

**User Story:** As a logged-in user, I want to fill in optional metadata fields, so that I can enrich the archive session record with additional context.

#### Acceptance Criteria

1. THE UploadForm SHALL include a textarea for `description` (optional, max 3000 graphemes).
2. THE UploadForm SHALL include a file input for `coverImage` (optional) that accepts only `image/*` MIME types.
3. THE UploadForm SHALL include a text input for `bskyPostRef` (optional) that accepts a single AT-URI string; THE App SHALL resolve the corresponding CID automatically via `com.atproto.repo.getRecord` (or equivalent) before constructing the strong reference for the record.
4. THE UploadForm SHALL include a dynamic list input for `tags` (optional) where the user can add and remove individual tag strings.
5. THE UploadForm SHALL include a datetime-local input for `uploadedAt` (optional).

---

### Requirement 5: Client-Side Validation

**User Story:** As a logged-in user, I want immediate feedback when I enter invalid data, so that I can correct mistakes before submitting.

#### Acceptance Criteria

1. WHEN the `title` field value exceeds 500 graphemes, THE UploadForm SHALL display an inline error indicating the grapheme limit.
2. WHEN the `description` field value exceeds 3000 graphemes, THE UploadForm SHALL display an inline error indicating the grapheme limit.
3. WHEN a selected `archiveFile` exceeds 52,428,800 bytes (50 MB), THE UploadForm SHALL display an inline error and SHALL NOT include the file in the submission.
4. WHEN a selected `coverImage` exceeds 1,000,000 bytes (1 MB), THE UploadForm SHALL display an inline error and SHALL NOT include the file in the submission.
5. WHEN a `sameAs` entry does not match a valid URI format (AT-URI `at://` or HTTPS `https://`), THE UploadForm SHALL display an inline error on that entry.
6. WHEN the `bskyPostRef` field is non-empty and does not match a valid AT-URI format (`at://`), THE UploadForm SHALL display an inline error on that field.
7. WHEN the `bskyPostRef` AT-URI cannot be resolved to a record via `com.atproto.repo.getRecord`, THEN THE UploadForm SHALL display an inline error indicating the post could not be found and SHALL NOT proceed to record creation.

---

### Requirement 6: Blob Upload

**User Story:** As a logged-in user, I want the app to upload my archive file and optional cover image to my PDS, so that the blobs are stored before the record is created.

#### Acceptance Criteria

1. WHEN the user submits a valid form, THE UploadForm SHALL upload the `archiveFile` blob to the PDS via `com.atproto.repo.uploadBlob` using the OAuthSession before creating the record.
2. WHEN a `coverImage` is provided and the form is valid, THE UploadForm SHALL upload the `coverImage` blob to the PDS via `com.atproto.repo.uploadBlob` using the OAuthSession before creating the record.
3. IF a blob upload fails, THEN THE UploadForm SHALL display an error message describing the failure and SHALL NOT proceed to record creation.

---

### Requirement 7: Record Creation

**User Story:** As a logged-in user, I want the app to create the `at.archiving.session` record on my PDS after all blobs are uploaded, so that the archive session is persisted in my repository.

#### Acceptance Criteria

1. WHEN all blob uploads succeed, THE UploadForm SHALL create an `at.archiving.session` record on the PDS via `com.atproto.repo.createRecord` using the OAuthSession, including all provided field values and blob references.
2. WHEN record creation succeeds, THE UploadForm SHALL display a success message containing the resulting AT-URI of the new record.
3. IF record creation fails, THEN THE UploadForm SHALL display an error message describing the failure and SHALL allow the user to retry.
4. WHILE a submission is in progress, THE UploadForm SHALL disable the submit button and display a loading indicator to prevent duplicate submissions.

---

### Requirement 8: Submission State and Reset

**User Story:** As a logged-in user, I want to be able to upload another archive session after a successful submission, so that I can create multiple records in one session.

#### Acceptance Criteria

1. WHEN record creation succeeds, THE UploadForm SHALL offer the user an option to reset the form and upload another archive session.
2. WHEN the user chooses to reset after a successful submission, THE UploadForm SHALL clear all field values and return to the initial empty form state.
