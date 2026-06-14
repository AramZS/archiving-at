import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseAtUri, buildBlobUrl, resolveOriginalUrl } from './archiveRecord';
import { isValidSameAsUri } from './validation';

// ---------------------------------------------------------------------------
// Unit tests — parseAtUri
// ---------------------------------------------------------------------------

describe('parseAtUri', () => {
  it('parses a well-formed AT-URI', () => {
    const result = parseAtUri('at://did:plc:abc123/at.archiving.session/mykey');
    expect(result).toEqual({
      did: 'did:plc:abc123',
      collection: 'at.archiving.session',
      rkey: 'mykey',
    });
  });

  it('returns null for a string missing the at:// scheme', () => {
    expect(parseAtUri('https://example.com')).toBeNull();
  });

  it('returns null for at:// with only two components', () => {
    expect(parseAtUri('at://did:plc:abc/at.archiving.session')).toBeNull();
  });

  it('returns null for at:// with an empty did component', () => {
    expect(parseAtUri('at:///collection/rkey')).toBeNull();
  });

  it('returns null for at:// with an empty collection component', () => {
    expect(parseAtUri('at://did:plc:abc//rkey')).toBeNull();
  });

  it('returns null for at:// with an empty rkey component', () => {
    expect(parseAtUri('at://did:plc:abc/collection/')).toBeNull();
  });

  it('returns null for at:// with four components (extra slash)', () => {
    expect(parseAtUri('at://did:plc:abc/col/rkey/extra')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseAtUri('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — buildBlobUrl
// ---------------------------------------------------------------------------

describe('buildBlobUrl', () => {
  it('builds the correct URL from clean inputs', () => {
    const url = buildBlobUrl(
      'https://pds.example.com',
      'did:plc:abc',
      'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
    );
    expect(url).toBe(
      'https://pds.example.com/xrpc/com.atproto.sync.getBlob' +
        '?did=did%3Aplc%3Aabc&cid=bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
    );
  });

  it('strips a trailing slash from pdsHost', () => {
    const url = buildBlobUrl('https://pds.example.com/', 'did:plc:abc', 'cid1');
    expect(url.startsWith('https://pds.example.com/xrpc/')).toBe(true);
  });

  it('strips multiple trailing slashes from pdsHost', () => {
    const url = buildBlobUrl('https://pds.example.com///', 'did:plc:abc', 'cid1');
    expect(url.startsWith('https://pds.example.com/xrpc/')).toBe(true);
  });

  it('percent-encodes did and cid in query params', () => {
    const url = buildBlobUrl('https://pds.example.com', 'did:plc:a b', 'cid a/b');
    expect(url).toContain('did=did%3Aplc%3Aa%20b');
    expect(url).toContain('cid=cid%20a%2Fb');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — resolveOriginalUrl
// ---------------------------------------------------------------------------

describe('resolveOriginalUrl', () => {
  it('returns the first valid entry', () => {
    expect(resolveOriginalUrl(['https://example.com', 'at://did:plc:abc/col/rk'])).toBe(
      'https://example.com'
    );
  });

  it('skips invalid entries and returns the first valid one', () => {
    expect(resolveOriginalUrl(['http://bad.com', 'https://good.com'])).toBe(
      'https://good.com'
    );
  });

  it('returns null for an empty array', () => {
    expect(resolveOriginalUrl([])).toBeNull();
  });

  it('returns null when all entries are invalid', () => {
    expect(resolveOriginalUrl(['http://bad.com', 'ftp://worse.com'])).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(resolveOriginalUrl(undefined)).toBeNull();
  });

  it('accepts at:// entries as valid', () => {
    expect(resolveOriginalUrl(['at://did:plc:abc/col/rk'])).toBe('at://did:plc:abc/col/rk');
  });

  it('rejects http:// entries', () => {
    expect(resolveOriginalUrl(['http://example.com'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Property 1: parseAtUri round-trip reconstructs the view path
 * Validates: Requirements 1.1, 2.1
 * Tag: Feature: archive-record-viewer, Property 1: parseAtUri round-trip
 */
describe('Property 1: parseAtUri round-trip reconstructs the view path', () => {
  it('for any valid at://<did>/<collection>/<rkey>, parseAtUri returns non-null and the view path matches', () => {
    // Arbitraries: non-empty strings with no forward slashes
    const component = fc.string({ minLength: 1 }).map((s) => s.replace(/\//g, 'x'));

    fc.assert(
      fc.property(component, component, component, (did, collection, rkey) => {
        const uri = `at://${did}/${collection}/${rkey}`;
        const parsed = parseAtUri(uri);

        // Must return non-null
        expect(parsed).not.toBeNull();

        // Components must be non-empty
        expect(parsed!.did.length).toBeGreaterThan(0);
        expect(parsed!.rkey.length).toBeGreaterThan(0);

        // View path reconstruction
        const viewPath = `/view/${rkey}?did=${did}`;
        expect(`/view/${parsed!.rkey}?did=${parsed!.did}`).toBe(viewPath);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: buildBlobUrl always produces a valid HTTPS URL with correct query params
 * Validates: Requirements 4.1
 * Tag: Feature: archive-record-viewer, Property 2: buildBlobUrl HTTPS URL
 */
describe('Property 2: buildBlobUrl always produces a valid HTTPS URL with correct query params', () => {
  it('for any non-empty pdsHost, did, and cid, the result is a valid HTTPS URL with getBlob and correct params', () => {
    // Generate a valid pdsHost: use fc.webUrl with https scheme, then optionally append trailing slashes.
    // fc.webUrl() generates well-formed URLs so new URL() will always succeed.
    const pdsHostArb = fc
      .tuple(
        fc.webUrl({ validSchemes: ['https'] }),
        fc.array(fc.constant('/'), { maxLength: 3 })
      )
      .map(([base, slashes]) => {
        // Strip any path/query from the generated URL so we have a clean host-only base,
        // then optionally tack on trailing slashes.
        const u = new URL(base);
        return `https://${u.host}${slashes.join('')}`;
      });

    // did and cid can be arbitrary non-empty strings
    const nonEmptyStr = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(pdsHostArb, nonEmptyStr, nonEmptyStr, (pdsHost, did, cid) => {
        const result = buildBlobUrl(pdsHost, did, cid);

        // Must parse as a URL without throwing
        let parsed: URL;
        expect(() => {
          parsed = new URL(result);
        }).not.toThrow();

        parsed = new URL(result);

        // Must be HTTPS
        expect(parsed.protocol).toBe('https:');

        // Pathname must contain getBlob
        expect(parsed.pathname).toContain('getBlob');

        // Query params must round-trip exactly
        expect(parsed.searchParams.get('did')).toBe(did);
        expect(parsed.searchParams.get('cid')).toBe(cid);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: resolveOriginalUrl returns the first valid entry or null
 * Validates: Requirements 5.1
 * Tag: Feature: archive-record-viewer, Property 3: resolveOriginalUrl first valid entry
 */
describe('Property 3: resolveOriginalUrl returns the first valid entry or null', () => {
  it('for any string[], result is the first element satisfying isValidSameAsUri, or null if none', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (sameAs) => {
        const result = resolveOriginalUrl(sameAs);

        const firstValid = sameAs.find((s) => isValidSameAsUri(s)) ?? null;

        expect(result).toBe(firstValid);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 4: fetchRecord state machine
// ---------------------------------------------------------------------------

/**
 * Property 4: fetchRecord state machine — exactly one terminal state, success implies valid CID
 * Validates: Requirements 3.1, 3.2, 4.1
 * Tag: Feature: archive-record-viewer, Property 4: fetchRecord state machine
 */
import { vi, afterEach, beforeEach } from 'vitest';
import { resolvePdsHost, fetchRecord } from './archiveRecord';

describe('Property 4: fetchRecord state machine — exactly one terminal state, success implies valid CID', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('result.status is always "success" or "error"; when success, archiveFile.ref.$link is non-empty', async () => {
    // Arbitraries
    const nonEmptyStr = fc.string({ minLength: 1 });

    // Arbitrary for a valid $link (non-empty string)
    const validLink = fc.string({ minLength: 1 });

    // Arbitrary for mock scenario — one of several outcomes
    const scenarioArb = fc.oneof(
      // Scenario A: DID resolution fails (non-OK HTTP)
      fc.record({
        kind: fc.constant('did-resolution-failure' as const),
        status: fc.integer({ min: 400, max: 599 }),
      }),
      // Scenario B: getRecord fails (non-OK HTTP)
      fc.record({
        kind: fc.constant('record-fetch-failure' as const),
        didStatus: fc.integer({ min: 200, max: 200 }),
        recordStatus: fc.integer({ min: 400, max: 599 }),
        pdsHost: fc.webUrl({ validSchemes: ['https'] }),
      }),
      // Scenario C: missing archiveFile.ref.$link
      fc.record({
        kind: fc.constant('missing-link' as const),
        pdsHost: fc.webUrl({ validSchemes: ['https'] }),
      }),
      // Scenario D: success with a valid link
      fc.record({
        kind: fc.constant('success' as const),
        pdsHost: fc.webUrl({ validSchemes: ['https'] }),
        link: validLink,
      }),
    );

    await fc.assert(
      fc.asyncProperty(nonEmptyStr, nonEmptyStr, scenarioArb, async (did, rkey, scenario) => {
        // Build a mock fetch function for this scenario
        const didDoc = {
          service: [
            {
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: scenario.kind !== 'did-resolution-failure'
                ? (scenario as { pdsHost: string }).pdsHost
                : 'https://fallback.example.com',
            },
          ],
        };

        const mockFetch = vi.fn();

        if (scenario.kind === 'did-resolution-failure') {
          mockFetch.mockResolvedValue({
            ok: false,
            status: scenario.status,
            json: async () => ({}),
          });
        } else if (scenario.kind === 'record-fetch-failure') {
          mockFetch
            .mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => didDoc,
            })
            .mockResolvedValueOnce({
              ok: false,
              status: scenario.recordStatus,
              json: async () => ({}),
            });
        } else if (scenario.kind === 'missing-link') {
          mockFetch
            .mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => didDoc,
            })
            .mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => ({
                uri: `at://${did}/at.archiving.session/${rkey}`,
                cid: 'bafy123',
                value: {
                  title: 'Test',
                  archiveFile: { $type: 'blob', ref: {}, mimeType: 'application/wacz', size: 100 },
                  sameAs: [],
                  archiveDateCreatedAt: '2024-01-01',
                },
              }),
            });
        } else {
          // success
          mockFetch
            .mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => didDoc,
            })
            .mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => ({
                uri: `at://${did}/at.archiving.session/${rkey}`,
                cid: 'bafy123',
                value: {
                  title: 'Test',
                  archiveFile: {
                    $type: 'blob',
                    ref: { $link: scenario.link },
                    mimeType: 'application/wacz',
                    size: 100,
                  },
                  sameAs: [],
                  archiveDateCreatedAt: '2024-01-01',
                },
              }),
            });
        }

        vi.stubGlobal('fetch', mockFetch);

        const result = await fetchRecord(did, rkey);

        // Invariant 1: status is exactly 'success' or 'error'
        expect(result.status === 'success' || result.status === 'error').toBe(true);

        // Invariant 2: when success, archiveFile.ref.$link is non-empty
        if (result.status === 'success') {
          expect(result.record.value.archiveFile.ref.$link.length).toBeGreaterThan(0);
        }

        vi.unstubAllGlobals();
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — resolvePdsHost
// ---------------------------------------------------------------------------

describe('resolvePdsHost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts serviceEndpoint from a realistic did:plc DID document', async () => {
    const didDoc = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:plc:abc123',
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://puffball.us-east.host.bsky.network',
        },
      ],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => didDoc,
    }));

    const result = await resolvePdsHost('did:plc:abc123');
    expect(result).toBe('https://puffball.us-east.host.bsky.network');
  });

  it('throws with HTTP status when the PLC directory returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    await expect(resolvePdsHost('did:plc:notfound')).rejects.toThrow(
      'Could not resolve DID document for `did:plc:notfound`: HTTP 404'
    );
  });

  it('throws when DID document has no AtprotoPersonalDataServer service', async () => {
    const didDoc = {
      id: 'did:plc:abc123',
      service: [
        { id: '#other', type: 'SomethingElse', serviceEndpoint: 'https://example.com' },
      ],
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => didDoc,
    }));

    await expect(resolvePdsHost('did:plc:abc123')).rejects.toThrow(
      'No PDS service found in DID document for `did:plc:abc123`'
    );
  });

  it('handles did:web scheme — fetches from /.well-known/did.json', async () => {
    const didDoc = {
      id: 'did:web:example.com',
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://pds.example.com',
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => didDoc,
    });

    vi.stubGlobal('fetch', mockFetch);

    const result = await resolvePdsHost('did:web:example.com');
    expect(result).toBe('https://pds.example.com');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/.well-known/did.json');
  });

  it('throws for unsupported DID methods', async () => {
    await expect(resolvePdsHost('did:key:z6Mk')).rejects.toThrow(
      'Unsupported DID method: "did:key:z6Mk"'
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — fetchRecord
// ---------------------------------------------------------------------------

describe('fetchRecord', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const DID = 'did:plc:testuser';
  const RKEY = 'tid123';
  const PDS_HOST = 'https://pds.example.com';

  const didDoc = {
    id: DID,
    service: [
      {
        id: '#atproto_pds',
        type: 'AtprotoPersonalDataServer',
        serviceEndpoint: PDS_HOST,
      },
    ],
  };

  const successRecord = {
    uri: `at://${DID}/at.archiving.session/${RKEY}`,
    cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    value: {
      title: 'My Archive',
      archiveFile: {
        $type: 'blob',
        ref: { $link: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' },
        mimeType: 'application/wacz',
        size: 12345,
      },
      sameAs: ['https://example.com/page'],
      archiveDateCreatedAt: '2024-01-15T10:00:00Z',
    },
  };

  it('returns success with record and pdsHost on a happy path', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => didDoc })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => successRecord })
    );

    const result = await fetchRecord(DID, RKEY);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.pdsHost).toBe(PDS_HOST);
      expect(result.record).toEqual(successRecord);
    }
  });

  it('returns error when DID resolution fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));

    const result = await fetchRecord(DID, RKEY);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('Could not resolve DID document');
      expect(result.message).toContain(DID);
    }
  });

  it('returns error when getRecord fetch fails with HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => didDoc })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    );

    const result = await fetchRecord(DID, RKEY);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('not found or could not be fetched');
      expect(result.message).toContain(RKEY);
    }
  });

  it('returns error when getRecord throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => didDoc })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    );

    const result = await fetchRecord(DID, RKEY);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('not found or could not be fetched');
    }
  });

  it('returns error when archiveFile.ref.$link is missing', async () => {
    const recordNoLink = {
      ...successRecord,
      value: {
        ...successRecord.value,
        archiveFile: {
          $type: 'blob' as const,
          ref: {},
          mimeType: 'application/wacz',
          size: 100,
        },
      },
    };

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => didDoc })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => recordNoLink })
    );

    const result = await fetchRecord(DID, RKEY);

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toBe('Record is missing archiveFile blob reference');
    }
  });

  it('never throws — always returns a discriminated union', async () => {
    // Even with a completely broken fetch, fetchRecord must not throw
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('total network failure')));

    await expect(fetchRecord(DID, RKEY)).resolves.toMatchObject({ status: 'error' });
  });
});
