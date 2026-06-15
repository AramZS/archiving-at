/**
 * Pure AT Protocol helpers for the archive-record-viewer feature.
 * The async functions (resolvePdsHost, fetchRecord) have network side effects;
 * everything else is pure and fully unit/property-testable.
 */

import { isValidSameAsUri } from './validation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedAtUri {
  did: string;
  collection: string;
  rkey: string;
}

export interface ArchiveRecordValue {
  title: string;
  archiveFile: {
    $type: 'blob';
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
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

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Parse an AT-URI into its components.
 * Returns null for malformed URIs (missing scheme, missing components, empty components).
 */
export function parseAtUri(uri: string): ParsedAtUri | null {
  if (!uri.startsWith('at://')) return null;
  const withoutScheme = uri.slice('at://'.length);
  const parts = withoutScheme.split('/');
  if (parts.length !== 3) return null;
  const [did, collection, rkey] = parts;
  if (!did || !collection || !rkey) return null;
  return { did, collection, rkey };
}

/**
 * Build the getBlob URL for a WACZ blob.
 * Strips trailing slashes from pdsHost and percent-encodes did and cid.
 */
export function buildBlobUrl(pdsHost: string, did: string, cid: string): string {
  const base = pdsHost.replace(/\/+$/, '');
  return (
    `${base}/xrpc/com.atproto.sync.getBlob` +
    `?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
  );
}

/**
 * Return the first entry in sameAs that passes isValidSameAsUri, or null.
 */
export function resolveOriginalUrl(sameAs: string[] | undefined): string | null {
  if (!sameAs) return null;
  for (const entry of sameAs) {
    if (isValidSameAsUri(entry)) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Async (network) helpers — stubbed for future tasks
// ---------------------------------------------------------------------------

/**
 * Resolve the PDS host URL for a given DID.
 * Supports did:plc (via https://plc.directory/<did>) and
 * did:web (via https://<hostname>/.well-known/did.json).
 */
export async function resolvePdsHost(did: string): Promise<string> {
  let url: string;
  if (did.startsWith('did:plc:')) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length);
    url = `https://${host}/.well-known/did.json`;
  } else {
    throw new Error(`Unsupported DID method: "${did}"`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not resolve DID document for \`${did}\`: HTTP ${response.status}`
    );
  }

  const doc = await response.json();
  const service = (doc.service as Array<{ type: string; serviceEndpoint: string }> | undefined)?.find(
    (s) => s.type === 'AtprotoPersonalDataServer'
  );
  if (!service) {
    throw new Error(`No PDS service found in DID document for \`${did}\``);
  }

  return service.serviceEndpoint;
}

/**
 * Fetch a user's public profile (displayName + handle) from the Bluesky AppView.
 * No auth required. Returns null silently on any failure.
 */
export async function fetchPublicProfile(
  did: string
): Promise<{ displayName: string | null; handle: string | null } | null> {
  try {
    const url = `https://api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      displayName: (data.displayName as string | undefined) ?? null,
      handle: (data.handle as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}
export async function fetchRecord(did: string, rkey: string): Promise<FetchRecordResult> {
  let pdsHost: string;
  try {
    pdsHost = await resolvePdsHost(did);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const atUri = `at://${did}/at.archiving.session/${rkey}`;
  const recordUrl =
    `${pdsHost}/xrpc/com.atproto.repo.getRecord` +
    `?repo=${encodeURIComponent(did)}&collection=at.archiving.session&rkey=${encodeURIComponent(rkey)}`;

  let response: Response;
  try {
    response = await fetch(recordUrl);
  } catch (err) {
    return {
      status: 'error',
      message: `Record \`${atUri}\` not found or could not be fetched`,
    };
  }

  if (!response.ok) {
    return {
      status: 'error',
      message: `Record \`${atUri}\` not found or could not be fetched`,
    };
  }

  let data: FetchedRecord;
  try {
    data = await response.json();
  } catch {
    return {
      status: 'error',
      message: `Record \`${atUri}\` not found or could not be fetched`,
    };
  }

  const link = data?.value?.archiveFile?.ref?.$link;
  if (!link) {
    return {
      status: 'error',
      message: 'Record is missing archiveFile blob reference',
    };
  }

  return { status: 'success', record: data, pdsHost };
}
