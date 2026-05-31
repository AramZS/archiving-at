import { Agent } from '@atproto/api';
import type { OAuthSession } from '@atproto/oauth-client-browser';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface BlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface StrongRef {
  uri: string;
  cid: string;
}

export interface ArchiveSessionRecord {
  $type: 'at.archiving.session';
  title: string;
  archiveFile: BlobRef;
  sameAs: string[];
  archiveDateCreatedAt: string;
  description?: string;
  coverImage?: BlobRef;
  bskyPostRef?: StrongRef;
  tags?: string[];
  uploadedAt?: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the correct MIME type for a file, falling back to extension-based
 * detection when the browser reports a generic type (e.g. application/octet-stream
 * for .wacz files) or an empty string.
 */
function resolveEncoding(file: File): string {
  const reported = file.type;
  if (reported && reported !== 'application/octet-stream') {
    return reported;
  }
  // Fall back to extension-based MIME type
  const name = file.name.toLowerCase();
  if (name.endsWith('.wacz')) return 'application/wacz';
  if (name.endsWith('.warc.gz')) return 'application/warc+gzip';
  if (name.endsWith('.warc')) return 'application/warc';
  if (name.endsWith('.zip')) return 'application/zip';
  // Return whatever the browser reported as a last resort
  return reported;
}

/**
 * Upload a blob to the PDS and return the blob ref from the response.
 *
 * @param session - OAuth session obtained from the OAuth client
 * @param file - The file to upload
 * @returns The blob ref from the PDS response
 */
export async function uploadBlob(session: OAuthSession, file: File): Promise<BlobRef> {
  const agent = new Agent(session);
  const encoding = resolveEncoding(file);
  const response = await agent.com.atproto.repo.uploadBlob(file, { encoding });
  return response.data.blob as unknown as BlobRef;
}

/**
 * Resolve an AT-URI to a strong reference { uri, cid } via getRecord.
 *
 * @param session - OAuth session obtained from the OAuth client
 * @param atUri - AT-URI in the format at://<authority>/<collection>/<rkey>
 * @returns A strong reference with uri and cid
 * @throws Error if the URI is malformed or the record is not found
 */
export async function resolveStrongRef(
  session: OAuthSession,
  atUri: string
): Promise<StrongRef> {
  if (!atUri.startsWith('at://')) {
    throw new Error(`Invalid AT-URI: expected format at://<authority>/<collection>/<rkey>, got "${atUri}"`);
  }

  const withoutScheme = atUri.slice('at://'.length);
  const parts = withoutScheme.split('/');

  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error(
      `Malformed AT-URI: expected at://<authority>/<collection>/<rkey> with all three components non-empty, got "${atUri}"`
    );
  }

  const [authority, collection, rkey] = parts;

  const agent = new Agent(session);
  let response;
  try {
    response = await agent.com.atproto.repo.getRecord({ repo: authority, collection, rkey });
  } catch (err) {
    throw new Error(
      `Record not found for AT-URI "${atUri}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.data.uri || !response.data.cid) {
    throw new Error(`Record at "${atUri}" did not return a valid uri and cid`);
  }

  return { uri: response.data.uri, cid: response.data.cid };
}

/**
 * Create an at.archiving.session record in the authenticated user's repo.
 *
 * @param session - OAuth session obtained from the OAuth client
 * @param record - The archive session record to create
 * @returns The AT-URI of the newly created record
 */
export async function createArchiveSession(
  session: OAuthSession,
  record: ArchiveSessionRecord
): Promise<string> {
  const agent = new Agent(session);
  const response = await agent.com.atproto.repo.createRecord({
    repo: agent.assertDid,
    collection: 'at.archiving.session',
    record,
  });
  return response.data.uri;
}
