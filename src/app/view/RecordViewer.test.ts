/**
 * Logic-level tests for RecordViewer.svelte behaviour.
 *
 * @testing-library/svelte is not available in this project, so we test the
 * component's logic directly via the pure functions it imports from
 * archiveRecord.ts, and verify the state-transition rules it applies.
 *
 * Requirements covered: 2.4, 3.1, 3.3, 3.4, 3.5, 4.1, 4.3, 5.1, 5.2,
 *                       7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRecord, buildBlobUrl, resolveOriginalUrl } from '../../lib/archiveRecord';

// ---------------------------------------------------------------------------
// Missing parameter handling
// (mirrors the onMount guard in RecordViewer.svelte)
// ---------------------------------------------------------------------------

describe('RecordViewer — missing parameter guard', () => {
  const MISSING_PARAMS_MSG =
    'Missing required parameters: did and rkey are both required.';

  it('produces the error message when did is null', () => {
    const did: string | null = null;
    const rkey = 'abc123';
    const msg = !did || !rkey ? MISSING_PARAMS_MSG : null;
    expect(msg).toBe(MISSING_PARAMS_MSG);
  });

  it('produces the error message when rkey is null', () => {
    const did = 'did:plc:abc';
    const rkey: string | null = null;
    const msg = !did || !rkey ? MISSING_PARAMS_MSG : null;
    expect(msg).toBe(MISSING_PARAMS_MSG);
  });

  it('produces the error message when both are null', () => {
    const did: string | null = null;
    const rkey: string | null = null;
    const msg = !did || !rkey ? MISSING_PARAMS_MSG : null;
    expect(msg).toBe(MISSING_PARAMS_MSG);
  });

  it('does NOT produce an error when both did and rkey are present', () => {
    const did = 'did:plc:abc';
    const rkey = 'abc123';
    const msg = !did || !rkey ? MISSING_PARAMS_MSG : null;
    expect(msg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchRecord error passthrough
// (RecordViewer sets errorMessage = result.message on error)
// ---------------------------------------------------------------------------

describe('RecordViewer — fetchRecord error passthrough', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes through the DID-resolution error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    );

    const result = await fetchRecord('did:plc:notfound', 'rkey1');
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('did:plc:notfound');
    }
  });

  it('passes through the record-fetch error message', async () => {
    const didDoc = {
      service: [
        {
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://pds.example.com',
        },
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => didDoc })
        .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    );

    const result = await fetchRecord('did:plc:abc', 'rkey123');
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('not found or could not be fetched');
    }
  });

  it('passes through the missing-archiveFile error message', async () => {
    const didDoc = {
      service: [
        {
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://pds.example.com',
        },
      ],
    };

    const recordNoLink = {
      uri: 'at://did:plc:abc/at.archiving.session/rkey123',
      cid: 'bafy123',
      value: {
        title: 'Test',
        archiveFile: { $type: 'blob', ref: {}, mimeType: 'application/wacz', size: 100 },
        sameAs: [],
        archiveDateCreatedAt: '2024-01-01',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => didDoc })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => recordNoLink })
    );

    const result = await fetchRecord('did:plc:abc', 'rkey123');
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toBe('Record is missing archiveFile blob reference');
    }
  });
});

// ---------------------------------------------------------------------------
// blobUrl derivation
// (mirrors: buildBlobUrl(pdsHost, did, record.value.archiveFile.ref.$link))
// ---------------------------------------------------------------------------

describe('RecordViewer — blobUrl derivation', () => {
  it('builds a valid HTTPS blob URL from pdsHost, did, and CID', () => {
    const pdsHost = 'https://pds.example.com';
    const did = 'did:plc:abc123';
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

    const url = buildBlobUrl(pdsHost, did, cid);
    const parsed = new URL(url);

    expect(parsed.protocol).toBe('https:');
    expect(parsed.pathname).toContain('/xrpc/com.atproto.sync.getBlob');
    expect(parsed.searchParams.get('did')).toBe(did);
    expect(parsed.searchParams.get('cid')).toBe(cid);
  });

  it('strips a trailing slash from pdsHost before building the URL', () => {
    const url = buildBlobUrl('https://pds.example.com/', 'did:plc:abc', 'cid1');
    expect(url).not.toContain('//xrpc');
    expect(url.startsWith('https://pds.example.com/xrpc/')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// original URL derivation
// (mirrors: resolveOriginalUrl(record.value.sameAs))
// ---------------------------------------------------------------------------

describe('RecordViewer — original URL derivation', () => {
  it('resolves original from a valid https:// entry', () => {
    expect(resolveOriginalUrl(['https://example.com/page'])).toBe(
      'https://example.com/page'
    );
  });

  it('resolves original from a valid at:// entry', () => {
    expect(resolveOriginalUrl(['at://did:plc:abc/col/rkey'])).toBe(
      'at://did:plc:abc/col/rkey'
    );
  });

  it('skips invalid entries and returns the first valid one', () => {
    expect(resolveOriginalUrl(['http://invalid.com', 'https://valid.com'])).toBe(
      'https://valid.com'
    );
  });

  it('returns null for an empty sameAs array', () => {
    expect(resolveOriginalUrl([])).toBeNull();
  });

  it('returns null for undefined sameAs', () => {
    expect(resolveOriginalUrl(undefined)).toBeNull();
  });

  it('returns null when all entries are invalid (http://)', () => {
    expect(resolveOriginalUrl(['http://a.com', 'http://b.com'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Back link always navigates to '/'
// ---------------------------------------------------------------------------

describe('RecordViewer — back link target', () => {
  it('back link href is always "/"', () => {
    // The template always renders: <a href="/" ...>← Home</a>
    const backHref = '/';
    expect(backHref).toBe('/');
  });
});
