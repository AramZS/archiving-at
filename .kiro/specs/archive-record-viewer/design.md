# Design: archive-record-viewer

## Overview

This feature adds a public `/view/<rkey>?did=<did>` route that lets anyone — authenticated or not — view an archived `at.archiving.session` record. The viewer fetches the record without OAuth (raw XRPC + PLC directory lookup), constructs a blob URL for the WACZ file, and embeds it in a `<replay-web-page>` custom element from ReplayWeb.page.

The home view is updated so each record card links to its viewer page.

---

## Architecture

### Component tree

```
App.svelte                          ← router (modified)
├── Callback.svelte                 (unchanged)
├── Login.svelte                    (unchanged)
├── UploadView.svelte               (unchanged)
├── RecordViewer.svelte             ← NEW — public viewer page
│   └── (replay-web-page custom element, loaded via <svelte:head>)
└── Home view (inline in App.svelte) ← modified: record cards become links
```

### Data flow

```
URL: /view/<rkey>?did=<did>
        │
        ▼
RecordViewer.svelte (mounts, reads URL params)
        │
        ▼
archiveRecord.ts :: fetchRecord(did, rkey)
  1. resolvePdsHost(did)
       └─ GET https://plc.directory/<did>   (did:plc only)
            └─ extract services[].serviceEndpoint where type === "AtprotoPersonalDataServer"
  2. GET https://{pds}/xrpc/com.atproto.repo.getRecord
           ?repo=<did>&collection=at.archiving.session&rkey=<rkey>
  3. Return { record, pdsHost } | Error
        │
        ▼
RecordViewer: derive blobUrl + originalUrl
  blobUrl  = buildBlobUrl(pdsHost, did, cid)   (archiveRecord.ts)
  original = resolveOriginalUrl(record.value.sameAs)
        │
        ▼
Render:
  <h1>{title}</h1>
  <p>{description}</p>
  <p>Original URL: {original}</p>
  <replay-web-page source={blobUrl} url={original}>
```

### Module responsibilities

| File | Role |
|---|---|
| `src/lib/archiveRecord.ts` | Pure TS — DID resolution, record fetch, URL helpers |
| `src/app/view/RecordViewer.svelte` | Svelte component — orchestrates fetch, renders UI |
| `src/app/App.svelte` | Modified — adds view route, adds links on home card list |

---

## New Files

| Path | Purpose |
|---|---|
| `src/lib/archiveRecord.ts` | AT Protocol helpers: `resolvePdsHost`, `fetchRecord`, `buildBlobUrl`, `resolveOriginalUrl`, `parseAtUri` |
| `src/app/view/RecordViewer.svelte` | Full-page viewer component for a single archive session record |
| `src/lib/archiveRecord.test.ts` | Vitest + fast-check tests for all pure functions in `archiveRecord.ts` |

---

## Modified Files

| Path | Changes |
|---|---|
| `src/app/App.svelte` | 1. Import `RecordViewer`. 2. Add view route branch before `{:else if did}`. 3. Replace raw `<li>` record cards with clickable `<a>` links. |

---

## Component Designs

### `src/lib/archiveRecord.ts`

Pure functions, no side effects beyond `fetch`. Suitable for unit and property-based testing with mocks.

```typescript
// Types

export interface ParsedAtUri {
  did: string;       // e.g. "did:plc:abc123"
  collection: string;
  rkey: string;
}

export interface ArchiveRecordValue {
  title: string;
  archiveFile: { $type: 'blob'; ref: { $link: string }; mimeType: string; size: number };
  sameAs: string[];
  archiveDateCreatedAt: string;
  description?: string;
  tags?: string[];
  uploadedAt?: string;
}

export interface FetchedRecord {
  uri: string;
  cid: string;
  value: ArchiveRecordValue;
}

export type FetchRecordResult =
  | { status: 'success'; record: FetchedRecord; pdsHost: string }
  | { status: 'error'; message: string };

// Signatures

/**
 * Parse an AT-URI into its components.
 * Returns null for malformed URIs (missing scheme, missing components, empty components).
 */
export function parseAtUri(uri: string): ParsedAtUri | null

/**
 * Given a DID, return the PDS host URL (e.g. "https://puffball.us-east.host.bsky.network").
 * Supports did:plc via https://plc.directory/<did>.
 * Throws if the DID document cannot be fetched or has no AtprotoPersonalDataServer service.
 */
export async function resolvePdsHost(did: string): Promise<string>

/**
 * Fetch a single at.archiving.session record without auth.
 * Performs DID resolution then getRecord. Returns a discriminated union result.
 */
export async function fetchRecord(did: string, rkey: string): Promise<FetchRecordResult>

/**
 * Build the getBlob URL for a WACZ blob.
 * Returns a valid HTTPS URL string.
 */
export function buildBlobUrl(pdsHost: string, did: string, cid: string): string

/**
 * Return the first entry in sameAs that is a valid at:// or https:// URI.
 * Returns null if the array is empty or contains no valid entries.
 * Reuses isValidSameAsUri from validation.ts.
 */
export function resolveOriginalUrl(sameAs: string[] | undefined): string | null
```

**`resolvePdsHost` pseudocode:**
```
1. if did starts with "did:plc:"
     url = "https://plc.directory/" + did
   else if did starts with "did:web:"
     // did:web:<hostname> → https://<hostname>/.well-known/did.json
     host = did.slice("did:web:".length)
     url = "https://" + host + "/.well-known/did.json"
   else throw "Unsupported DID method"

2. response = await fetch(url)
   if !response.ok throw "DID resolution failed: HTTP " + status

3. doc = await response.json()
4. service = doc.service?.find(s => s.type === "AtprotoPersonalDataServer")
   if !service throw "No AtprotoPersonalDataServer in DID document"

5. return service.serviceEndpoint  // already a full URL
```

**`buildBlobUrl` pseudocode:**
```
// Normalise pdsHost — strip trailing slash
base = pdsHost.replace(/\/$/, '')
return base + "/xrpc/com.atproto.sync.getBlob?did=" + encodeURIComponent(did)
            + "&cid=" + encodeURIComponent(cid)
```

---

### `src/app/view/RecordViewer.svelte`

**Props:**
```typescript
interface Props {
  navigate: (to: string) => void;
}
```

**State:**
```typescript
let status = $state<'loading' | 'success' | 'error'>('loading');
let record = $state<FetchedRecord | null>(null);
let pdsHost = $state<string | null>(null);
let errorMessage = $state<string | null>(null);
```

**Derived values** (computed in script, not stored in state):
```typescript
// Parsed from location.pathname + location.search on mount
const rkey: string
const did: string

// Derived after successful fetch
const blobUrl  = buildBlobUrl(pdsHost, did, record.value.archiveFile.ref.$link)
const original = resolveOriginalUrl(record.value.sameAs)
```

**Key logic — `onMount`:**
```
1. Parse rkey from location.pathname: /view/<rkey>
   Parse did from new URLSearchParams(location.search).get('did')

2. if !did || !rkey
     status = 'error'
     errorMessage = "Missing did or rkey parameter"
     return

3. result = await fetchRecord(did, rkey)

4. if result.status === 'error'
     status = 'error'
     errorMessage = result.message
   else
     record = result.record
     pdsHost = result.pdsHost
     status = 'success'
```

**ReplayWeb.page timeout/error handling:**
```
// After status → 'success' and the custom element is in the DOM:
// Set a 30-second timeout
const timer = setTimeout(() => {
  if (status === 'success' && !replayLoaded) {
    replayError = "Archive viewer timed out after 30 seconds."
  }
}, 30_000)

// Listen for the custom element's error event
replayEl.addEventListener('error', (e) => {
  clearTimeout(timer)
  replayError = "Archive viewer failed to load: " + (e.message ?? "unknown error")
})

// On successful load signal
replayEl.addEventListener('load', () => {
  clearTimeout(timer)
  replayLoaded = true
})
```

**Template structure:**
```svelte
<svelte:head>
  <script src="https://cdn.jsdelivr.net/npm/replaywebpage@2.1.0/ui.js"></script>
</svelte:head>

<div class="viewer-layout">
  <!-- Back link: ALWAYS visible regardless of state -->
  <a href="/" class="back-link" onclick={...}>← Home</a>

  {#if status === 'loading'}
    <p class="loading">Loading archive record…</p>

  {:else if status === 'error'}
    <div class="error-card" role="alert">
      <p>{errorMessage}</p>
    </div>

  {:else if status === 'success' && record}
    <h1>{record.value.title}</h1>
    {#if record.value.description}
      <p class="description">{record.value.description}</p>
    {/if}

    {#if original}
      <p class="original-url">Original URL: <a href={original} target="_blank">{original}</a></p>
    {:else}
      <p class="no-original">Original URL not available.</p>
    {/if}

    {#if replayError}
      <div class="error-card" role="alert">{replayError}</div>
    {:else if original}
      <replay-web-page
        source={blobUrl}
        url={original}
        class="replay-embed"
      ></replay-web-page>
    {/if}
  {/if}
</div>
```

**Styling:** Full-width layout for the `<replay-web-page>` element. Card-style container for metadata above it. Matches the existing app palette (`#f4f6f8` background, `#1f2937` text, indigo accent `#6366f1`).

---

## Data Flow — Sequence Diagram

```
Browser                RecordViewer        archiveRecord.ts         plc.directory         PDS
   │                        │                      │                      │                 │
   │ navigate /view/rkey    │                      │                      │                 │
   │───────────────────────>│                      │                      │                 │
   │                        │ onMount              │                      │                 │
   │                        │ parse rkey, did      │                      │                 │
   │                        │ fetchRecord(did,rkey)│                      │                 │
   │                        │─────────────────────>│                      │                 │
   │                        │                      │ GET /plc.directory/<did>               │
   │                        │                      │─────────────────────>│                 │
   │                        │                      │<─────────────────────│                 │
   │                        │                      │ extract pdsHost      │                 │
   │                        │                      │ GET /xrpc/com.atproto.repo.getRecord   │
   │                        │                      │──────────────────────────────────────>│
   │                        │                      │<──────────────────────────────────────│
   │                        │<─────────────────────│                      │                 │
   │                        │ derive blobUrl        │                      │                 │
   │                        │ derive original       │                      │                 │
   │                        │ render replay-web-page│                      │                 │
   │<───────────────────────│                      │                      │                 │
   │                        │ replay-web-page       │                      │                 │
   │                        │ fetches blob via      │                      │                 │
   │                        │ blobUrl (browser-side)│                      │                 │
```

---

## AT Protocol Integration

### DID Resolution

For `did:plc` DIDs, the PLC directory endpoint is:
```
GET https://plc.directory/<did>
```
Response is a DID document JSON. The PDS host is extracted from:
```json
{
  "service": [
    { "id": "#atproto_pds", "type": "AtprotoPersonalDataServer", "serviceEndpoint": "https://puffball.us-east.host.bsky.network" }
  ]
}
```
No auth is required for this call.

### Record Fetch

```
GET https://{pdsHost}/xrpc/com.atproto.repo.getRecord
    ?repo=<did>
    &collection=at.archiving.session
    &rkey=<rkey>
```
No `Authorization` header. Returns:
```json
{ "uri": "at://...", "cid": "...", "value": { ... } }
```

### Blob URL Construction

```
https://{pdsHost}/xrpc/com.atproto.sync.getBlob?did=<did>&cid=<cid>
```
`cid` is taken from `record.value.archiveFile.ref.$link`.

---

## ReplayWeb.page Integration

### Script Loading

Loaded once via `<svelte:head>` in `RecordViewer.svelte`:
```html
<script src="https://cdn.jsdelivr.net/npm/replaywebpage@2.1.0/ui.js"></script>
```
This registers the `<replay-web-page>` custom element globally. It will only be injected when `RecordViewer` is mounted, and removed when it unmounts.

### Custom Element Usage

```html
<replay-web-page
  source="https://{pds}/xrpc/com.atproto.sync.getBlob?did=...&cid=..."
  url="https://original-page.example.com"
  style="width: 100%; height: 80vh; display: block;"
></replay-web-page>
```

### Timeout and Error Handling

The custom element emits a DOM `error` event on failure. The 30-second timeout is managed with `setTimeout`/`clearTimeout` in a Svelte `$effect` that runs after `status === 'success'`. Both paths set `replayError` (a separate state variable from the fetch `errorMessage`) to display an inline error without removing the metadata above.

TypeScript type declaration for the custom element is added via a `svelteHTML` namespace augmentation or a local `.d.ts` file so the compiler does not complain about the unknown element tag.

---

## Routing Change

**Exact change to `App.svelte`:**

```svelte
// Add import at top of <script>:
import RecordViewer from './view/RecordViewer.svelte';

// Add route branch — insert BEFORE the {:else if did} block:
{:else if path.startsWith('/view/')}
  <RecordViewer {navigate} />
```

The `path.startsWith('/view/')` check is placed **before** `{:else if did}` so unauthenticated users can reach the viewer. The full routing block becomes:

```svelte
{#if isCallback}
  <Callback onSuccess={onAuthSuccess} />
{:else if restoring}
  <main class="center"><div class="card"><p>Restoring session…</p></div></main>
{:else if did && path === '/upload'}
  <UploadView {session} {navigate} />
{:else if path.startsWith('/view/')}
  <RecordViewer {navigate} />
{:else if did}
  <!-- home view -->
{:else}
  <Login />
{/if}
```

**Home view record link change** (in the `{:else if did}` block):

Replace:
```svelte
{#each activityRecords as record}
  <li>
    <p class="record-uri">{record.uri}</p>
    <pre>{JSON.stringify(record.value, null, 2)}</pre>
  </li>
{/each}
```

With:
```svelte
{#each activityRecords as record}
  <li>
    {@const parsed = parseAtUri(record.uri)}
    {#if parsed}
      <a
        href="/view/{parsed.rkey}?did={parsed.did}"
        class="record-link"
        onclick={(e) => {
          e.preventDefault();
          try {
            navigate(`/view/${parsed.rkey}?did=${parsed.did}`);
          } catch {
            window.location.href = `/view/${parsed.rkey}?did=${parsed.did}`;
          }
        }}
      >
        {String(record.value?.title ?? record.uri)}
      </a>
    {:else}
      <p class="record-uri">{record.uri}</p>
    {/if}
  </li>
{/each}
```

`parseAtUri` is imported from the new `src/lib/archiveRecord.ts`. Also add the `getBskyData.ts` import of `parseAtUri` to App.svelte's existing import.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This feature is well-suited for property-based testing because it introduces several pure functions (`parseAtUri`, `buildBlobUrl`, `resolveOriginalUrl`) with clearly defined input/output contracts and large input spaces, plus a fetch state machine whose invariants must hold regardless of the network response.

The property-based testing library used is **fast-check** (already in `devDependencies`). Each property test runs a minimum of **100 iterations**.

---

### Property 1: `parseAtUri` round-trip reconstructs the view path

For any valid AT-URI string `at://<did>/<collection>/<rkey>` where did, collection, and rkey are all non-empty and slash-free, `parseAtUri` must return a non-null result whose `did` and `rkey` fields are non-empty and reconstruct exactly to the path `/view/<rkey>?did=<did>`.

**For any** valid AT-URI `at://<did>/<collection>/<rkey>`, `parseAtUri(uri)` shall return `{ did, rkey }` both non-empty, and `"/view/" + rkey + "?did=" + did` shall equal the expected view path.

**Validates: Requirements 1.1, 2.1**

---

### Property 2: `buildBlobUrl` always produces a valid HTTPS URL with correct query params

For any combination of pdsHost, did, and cid strings, `buildBlobUrl` must return a string that parses as a valid HTTPS URL, whose path ends with `/xrpc/com.atproto.sync.getBlob`, and whose `did` and `cid` query parameters exactly match the inputs.

**For any** non-empty `pdsHost` (with `https://` scheme), `did`, and `cid` strings, `buildBlobUrl(pdsHost, did, cid)` shall produce a URL where `new URL(result).protocol === "https:"`, the pathname contains `getBlob`, and `searchParams.get("did") === did` and `searchParams.get("cid") === cid`.

**Validates: Requirements 4.1**

---

### Property 3: `resolveOriginalUrl` returns the first valid entry or null

For any array of strings, `resolveOriginalUrl` must return the first element that passes `isValidSameAsUri` (i.e. starts with `at://` or `https://` with non-empty content after the scheme), or `null` if no such element exists.

**For any** array of strings `sameAs`, `resolveOriginalUrl(sameAs)` shall return the first element `s` such that `isValidSameAsUri(s) === true`, or `null` if no such element exists.

**Validates: Requirements 5.1**

---

### Property 4: `fetchRecord` state machine — exactly one terminal state, success implies valid CID

The `fetchRecord` function implements a loading → (success | error) state machine. For any (did, rkey) pair with any mocked fetch responses, the returned result must have `status` equal to exactly `'success'` or `'error'` — never both, never neither. When status is `'success'`, `result.record.value.archiveFile.ref.$link` must be a non-empty string.

**For any** `did` and `rkey` strings passed to `fetchRecord` with mocked network responses, the result shall have `status` of either `'success'` or `'error'` (never an unexpected value), and when `status === 'success'`, `result.record.value.archiveFile.ref.$link` shall be non-empty.

**Validates: Requirements 3.1, 3.2, 4.1**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| URL missing `did` or `rkey` param | Immediately set `status = 'error'` with message "Missing required parameters: did and rkey are both required." |
| DID resolution HTTP error | `status = 'error'`, message includes the DID: "Could not resolve DID document for `<did>`: HTTP `<status>`" |
| DID document has no PDS service | `status = 'error'`, message: "No PDS service found in DID document for `<did>`" |
| `getRecord` HTTP error | `status = 'error'`, message includes rkey: "Record `<at_uri>` not found or could not be fetched" |
| Missing `archiveFile.ref.$link` | `status = 'error'`, message: "Record is missing archiveFile blob reference" |
| `<replay-web-page>` error event | Set `replayError` string; metadata remains visible; back link remains visible |
| 30-second timeout | Set `replayError = "Archive viewer timed out after 30 seconds."` |
| Malformed AT-URI in home view | `parseAtUri` returns `null`; record renders as plain `<p>` with no link |

All error messages containing user-supplied values (DID, AT-URI) include the exact value to aid debugging per requirement 8.1.

---

## Testing Strategy

### Unit tests (`archiveRecord.test.ts`)

- `parseAtUri`: valid URIs parse correctly; malformed URIs return null (missing scheme, empty components, too few parts, extra slashes)
- `buildBlobUrl`: correct URL structure with known inputs; trailing slash on pdsHost is stripped
- `resolveOriginalUrl`: first valid entry returned; null for empty array; null for all-invalid array; `at://` entries accepted; `http://` entries rejected
- `resolvePdsHost`: correct extraction from a realistic DID document fixture; throws on HTTP error; throws on missing service
- `fetchRecord`: success path with mocked fetch; error path for DID resolution failure; error path for getRecord failure

### Property-based tests (`archiveRecord.test.ts`, Vitest + fast-check, ≥100 runs each)

- **Property 1** — `parseAtUri` round-trip (tag: `Feature: archive-record-viewer, Property 1: parseAtUri round-trip`)
- **Property 2** — `buildBlobUrl` URL correctness (tag: `Feature: archive-record-viewer, Property 2: buildBlobUrl HTTPS URL`)
- **Property 3** — `resolveOriginalUrl` first-valid-or-null (tag: `Feature: archive-record-viewer, Property 3: resolveOriginalUrl first valid entry`)
- **Property 4** — `fetchRecord` state machine invariants (tag: `Feature: archive-record-viewer, Property 4: fetchRecord state machine`)

### Component tests

- `RecordViewer.svelte`: loading state renders spinner; error state renders message and back link; success state renders title, description, original URL, and `<replay-web-page>`; back link present in all states
- `App.svelte` routing: unauthenticated user on `/view/rkey?did=…` renders `RecordViewer` not `Login`

### Approach

Unit and property tests cover the pure library functions exhaustively. Component tests use Vitest with `@testing-library/svelte` (following the existing project test patterns) and mock `fetchRecord` to exercise all rendering branches. No real network calls in tests — `fetch` is mocked via `vi.stubGlobal('fetch', ...)`.
