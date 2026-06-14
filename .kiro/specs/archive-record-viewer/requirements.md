# Requirements Document

## Introduction

This feature adds a public archive record viewer page to the Archiver's ATmosphere Svelte SPA. Currently, each activity record in the authenticated home view displays its AT URI as plain text. This feature makes each URI a clickable in-app link that navigates to a full-width, publicly accessible viewer page. The viewer fetches the record from the AT Protocol PDS without requiring authentication, constructs a blob URL for the WACZ archive file, and renders it using the `<replay-web-page>` custom element from the ReplayWeb.page library.

## Glossary

- **AT_URI**: An AT Protocol URI in the format `at://did:plc:xxx/at.archiving.session/rkey` that uniquely identifies a record on a PDS.
- **DID**: A Decentralized Identifier (e.g. `did:plc:xxx`) extracted from the authority segment of an AT_URI.
- **rkey**: The record key — the final path segment of an AT_URI (e.g. `3abc123`), used to identify a specific record within a collection.
- **PDS**: Personal Data Server — the AT Protocol server that hosts a user's records and blobs.
- **PDS_Host**: The hostname of the PDS resolved from a DID document (e.g. `bsky.social`), used to construct API and blob URLs.
- **CID**: Content Identifier — a hash-based identifier stored in `record.value.archiveFile.ref.$link` that addresses the archive blob on the PDS.
- **Blob_URL**: The HTTPS URL constructed from PDS_Host, DID, and CID that points to the archive blob via the `com.atproto.sync.getBlob` XRPC endpoint.
- **ArchiveSession_Record**: A record conforming to the `at.archiving.session` lexicon, containing `title`, `archiveFile`, `sameAs`, and optional `description`.
- **Viewer_Page**: The full-width SPA route at `/view/<rkey>?did=<did>` that displays the `<replay-web-page>` element for a given archive record.
- **ReplayWebPage_Element**: The `<replay-web-page>` custom HTML element from the ReplayWeb.page library that renders WACZ archive content in-browser.
- **DID_Document**: A JSON document resolved from the AT Protocol identity resolution service that contains the PDS service endpoint URL.
- **App_Router**: The client-side routing logic in `App.svelte` that maps URL paths to rendered Svelte components.

## Requirements

### Requirement 1: Clickable Record Links in Home View

**User Story:** As an authenticated user, I want each activity record in the home view to show a clickable link, so that I can navigate to the full record viewer for any of my archives.

#### Acceptance Criteria

1. WHEN the authenticated home view renders the activity records list and a record's `value.title` is present and non-empty, THE App_Router SHALL display the title as a navigable anchor element that links to the Viewer_Page route for that record.
2. WHEN the authenticated home view renders the activity records list and a record's `value.title` is absent or empty, THE App_Router SHALL display the record's AT_URI as a navigable anchor element that links to the Viewer_Page route for that record.
3. WHEN a user clicks a record link and `history.pushState` succeeds, THE App_Router SHALL navigate in-app to the Viewer_Page route without a full browser reload.
4. IF `history.pushState` throws an exception, THEN THE App_Router SHALL fall back to setting `window.location.href` to the Viewer_Page URL.
5. THE App_Router SHALL construct the Viewer_Page URL from the AT_URI in the format `/view/<rkey>?did=<did>`, where `<rkey>` is the final path segment of the AT_URI and `<did>` is the authority segment.
6. IF a record's AT_URI cannot be parsed into a DID and rkey, THEN THE App_Router SHALL render the URI as plain non-linked text in place of the anchor element.

---

### Requirement 2: Public Viewer Page Route

**User Story:** As a member of the public, I want to access an archive viewer page directly by URL, so that I can view a shared archive without needing an account.

#### Acceptance Criteria

1. WHEN the App_Router path matches `/view/<rkey>` (where `<rkey>` is a non-empty string of 1–512 characters from the AT Protocol record key character set), THE App_Router SHALL render the Viewer_Page regardless of whether an OAuth session exists.
2. WHEN a user navigates directly to a Viewer_Page URL by following a shared link, THE App_Router SHALL render the Viewer_Page without redirecting to the login page.
3. WHEN a user navigates directly to a Viewer_Page URL in a browser, THE SPA shell SHALL be served so the App_Router can handle the route — both in development (via the Vite dev server fallback) and in production (via the static host's SPA redirect rule).
4. IF the `did` query parameter is absent or the `rkey` path segment is absent from the Viewer_Page URL, THEN THE Viewer_Page SHALL display an error message indicating the record cannot be identified and SHALL NOT attempt to fetch or render any record data.

---

### Requirement 3: Unauthenticated Record Fetch

**User Story:** As the Viewer_Page, I want to fetch the archive record from the PDS without requiring a user session, so that public visitors can view the record data.

#### Acceptance Criteria

1. WHEN the Viewer_Page loads with a non-empty `did` query parameter and a non-empty `rkey` path segment, THE Viewer_Page SHALL resolve the PDS_Host by fetching the DID document from the AT Protocol identity resolution service (`https://plc.directory/<did>` for `did:plc` DIDs, or the equivalent method-specific endpoint), then use the resolved PDS_Host to fetch the ArchiveSession_Record via the unauthenticated `com.atproto.repo.getRecord` XRPC endpoint.
2. THE Viewer_Page SHALL derive the DID from the `did` query parameter and the rkey from the final path segment of the current URL.
3. IF the record fetch returns an HTTP error response or a network-level failure, THEN THE Viewer_Page SHALL display a human-readable error message that includes the AT_URI and SHALL NOT attempt to render the ReplayWebPage_Element.
4. IF the DID or rkey is missing from the Viewer_Page URL, THEN THE Viewer_Page SHALL display an error message indicating the record could not be identified and SHALL NOT initiate any network request.
5. IF the DID document resolution request fails (HTTP error or network-level failure), THEN THE Viewer_Page SHALL display a human-readable error message that includes the DID as provided and SHALL NOT attempt to fetch the record or render the ReplayWebPage_Element.

---

### Requirement 4: Blob URL Construction

**User Story:** As the Viewer_Page, I want to construct a direct HTTPS URL for the archive blob, so that the ReplayWeb.page element can stream the WACZ file directly from the PDS.

#### Acceptance Criteria

1. WHEN a valid ArchiveSession_Record has been fetched, THE Viewer_Page SHALL extract the CID from `record.value.archiveFile.ref.$link` and derive the PDS_Host from the resolved DID document.
2. THE Viewer_Page SHALL construct the Blob_URL in the format `https://{PDS_Host}/xrpc/com.atproto.sync.getBlob?did={DID}&cid={CID}`, using the DID from the `did` query parameter and the CID from criterion 1.
3. IF `record.value.archiveFile.ref.$link` is absent or empty, THEN THE Viewer_Page SHALL display an error message stating the archive file reference is missing and SHALL NOT attempt to render the ReplayWebPage_Element.

---

### Requirement 5: Original URL Resolution

**User Story:** As the Viewer_Page, I want to identify the original URL of the archived page, so that the ReplayWeb.page element can replay the archive from the correct entry point.

#### Acceptance Criteria

1. WHEN constructing the ReplayWebPage_Element attributes, THE Viewer_Page SHALL use the first element of `record.value.sameAs` as the `url` attribute value, provided it is a non-empty string matching a valid `at://` or `https://` URI format.
2. IF `record.value.sameAs` is absent, empty, or its first element does not match a valid `at://` or `https://` URI format, THEN THE Viewer_Page SHALL render a notice in place of the ReplayWebPage_Element informing the user that no original URL is available, and SHALL NOT render the ReplayWebPage_Element.

---

### Requirement 6: ReplayWeb.page Rendering

**User Story:** As a visitor to the Viewer_Page, I want to see the archived web page rendered interactively, so that I can browse the archived content.

#### Acceptance Criteria

1. THE Viewer_Page SHALL load the ReplayWeb.page UI script from `https://cdn.jsdelivr.net/npm/replaywebpage@2.1.0/ui.js` via a `<script>` tag before the ReplayWebPage_Element is inserted into the DOM.
2. IF the Blob_URL has been constructed and `record.value.sameAs` is non-empty and its first element is a valid `at://` or `https://` URI, THEN THE Viewer_Page SHALL render a `<replay-web-page>` element with `source` set to the Blob_URL and `url` set to the first entry in `record.value.sameAs`.
3. IF `record.value.sameAs` is absent, empty, or its first element is not a valid URI, THEN THE Viewer_Page SHALL NOT render the `<replay-web-page>` element and SHALL display a notice in its place.
4. THE Viewer_Page SHALL be full-width and SHALL NOT apply the card layout or `max-width` constraint used by other pages in the app.
5. IF the `<replay-web-page>` element emits an error event, or if the element has not emitted a load or ready event within 30 seconds of insertion, THEN THE Viewer_Page SHALL replace the element with an error message indicating the archive replay could not be started.

---

### Requirement 7: Archive Metadata Display

**User Story:** As a visitor to the Viewer_Page, I want to see the archive's title and other metadata, so that I can understand what I am viewing before the replay loads.

#### Acceptance Criteria

1. WHEN the record fetch completes successfully, THE Viewer_Page SHALL display `record.value.title` in an `<h1>` element as the primary heading of the page.
2. WHERE `record.value.description` is present and non-empty, THE Viewer_Page SHALL display the description below the title.
3. WHERE `record.value.sameAs` contains at least one entry, THE Viewer_Page SHALL display the first entry as a URL preceded by the label "Original URL".
4. WHILE the record fetch is in progress, THE Viewer_Page SHALL display a loading indicator and SHALL NOT display any metadata fields.
5. IF the record fetch fails, THEN THE Viewer_Page SHALL NOT display any metadata fields and SHALL display an error message.

---

### Requirement 8: Error and Loading States

**User Story:** As a visitor to the Viewer_Page, I want clear feedback when the record cannot be loaded, so that I understand what went wrong.

#### Acceptance Criteria

1. WHILE the record is being fetched, THE Viewer_Page SHALL display a loading indicator and SHALL NOT display any error message or record content.
2. IF the network request to resolve the DID document fails, THEN THE Viewer_Page SHALL dismiss the loading indicator and SHALL display an error message that includes the DID exactly as provided, even if malformed.
3. IF the network request to fetch the record fails, THEN THE Viewer_Page SHALL dismiss the loading indicator and SHALL display an error message that includes the AT_URI exactly as provided, even if malformed.
4. THE Viewer_Page SHALL display a navigation link back to the home page (`/`) in all states, including while loading, on error, and on success.
