import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @atproto/api
// ---------------------------------------------------------------------------

const mockUploadBlob = vi.fn();
const mockGetRecord = vi.fn();
const mockCreateRecord = vi.fn();

// assertDid is a getter — we expose it as a plain property on the mock instance
const mockAssertDid = 'did:plc:testuser123';

vi.mock('@atproto/api', () => {
  // Must use a real function (not arrow) so it can be called with `new`
  function MockAgent() {
    return {
      assertDid: mockAssertDid,
      com: {
        atproto: {
          repo: {
            uploadBlob: mockUploadBlob,
            getRecord: mockGetRecord,
            createRecord: mockCreateRecord,
          },
        },
      },
    };
  }
  return { Agent: MockAgent };
});

// Import after mock is set up
import { uploadBlob, resolveStrongRef, createArchiveSession } from './uploadSession';
import type { ArchiveSessionRecord, BlobRef } from './uploadSession';

// A minimal fake OAuthSession — the mock Agent ignores it
const fakeSession = {} as Parameters<typeof uploadBlob>[0];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlobRef(overrides: Partial<BlobRef> = {}): BlobRef {
  return {
    $type: 'blob',
    ref: { $link: 'bafyreiabc123' },
    mimeType: 'application/wacz',
    size: 1024,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ArchiveSessionRecord> = {}): ArchiveSessionRecord {
  return {
    $type: 'at.archiving.session',
    title: 'Test Archive',
    archiveFile: makeBlobRef(),
    sameAs: ['https://example.com'],
    archiveDateCreatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests — resolveStrongRef
// ---------------------------------------------------------------------------

describe('resolveStrongRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses AT-URI components and calls getRecord with the correct repo, collection, and rkey', async () => {
    const atUri = 'at://did:plc:abc123/app.bsky.feed.post/3jxtttklmak24';
    mockGetRecord.mockResolvedValueOnce({
      data: { uri: atUri, cid: 'bafyreiabc123' },
    });

    const result = await resolveStrongRef(fakeSession, atUri);

    expect(mockGetRecord).toHaveBeenCalledOnce();
    expect(mockGetRecord).toHaveBeenCalledWith({
      repo: 'did:plc:abc123',
      collection: 'app.bsky.feed.post',
      rkey: '3jxtttklmak24',
    });
    expect(result).toEqual({ uri: atUri, cid: 'bafyreiabc123' });
  });

  it('throws a descriptive error when getRecord throws (record not found)', async () => {
    const atUri = 'at://did:plc:abc123/app.bsky.feed.post/notfound';
    mockGetRecord.mockRejectedValueOnce(new Error('Record not found'));

    await expect(resolveStrongRef(fakeSession, atUri)).rejects.toThrow(
      /Record not found for AT-URI/
    );
  });

  it('throws a descriptive error for a malformed AT-URI (missing rkey)', async () => {
    const atUri = 'at://did:plc:abc123/app.bsky.feed.post';

    await expect(resolveStrongRef(fakeSession, atUri)).rejects.toThrow(
      /Malformed AT-URI/
    );
    expect(mockGetRecord).not.toHaveBeenCalled();
  });

  it('throws a descriptive error for a URI that does not start with at://', async () => {
    const atUri = 'https://example.com/not-an-at-uri';

    await expect(resolveStrongRef(fakeSession, atUri)).rejects.toThrow(
      /Invalid AT-URI/
    );
    expect(mockGetRecord).not.toHaveBeenCalled();
  });

  it('throws when getRecord returns a response without uri or cid', async () => {
    const atUri = 'at://did:plc:abc123/app.bsky.feed.post/rkey1';
    mockGetRecord.mockResolvedValueOnce({
      data: { uri: '', cid: '' },
    });

    await expect(resolveStrongRef(fakeSession, atUri)).rejects.toThrow(
      /did not return a valid uri and cid/
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — createArchiveSession
// ---------------------------------------------------------------------------

describe('createArchiveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createRecord with the correct repo, collection, and record payload', async () => {
    const expectedUri = 'at://did:plc:testuser123/at.archiving.session/rkey1';
    mockCreateRecord.mockResolvedValueOnce({ data: { uri: expectedUri, cid: 'bafyreiabc123' } });

    const record = makeRecord();
    const result = await createArchiveSession(fakeSession, record);

    expect(mockCreateRecord).toHaveBeenCalledOnce();
    expect(mockCreateRecord).toHaveBeenCalledWith({
      repo: mockAssertDid,
      collection: 'at.archiving.session',
      record,
    });
    expect(result).toBe(expectedUri);
  });

  it('returns the AT-URI from the response', async () => {
    const expectedUri = 'at://did:plc:testuser123/at.archiving.session/abc456';
    mockCreateRecord.mockResolvedValueOnce({ data: { uri: expectedUri, cid: 'bafyreiabc456' } });

    const result = await createArchiveSession(fakeSession, makeRecord());
    expect(result).toBe(expectedUri);
  });

  it('propagates errors from createRecord', async () => {
    mockCreateRecord.mockRejectedValueOnce(new Error('PDS error'));

    await expect(createArchiveSession(fakeSession, makeRecord())).rejects.toThrow('PDS error');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Property 8: Record payload contains all provided field values
 * Validates: Requirements 7.1
 */
describe('Property 8: createArchiveSession record payload contains all provided field values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any valid field values, the payload contains each provided value and omits absent optional fields', async () => {
    // Arbitrary for BlobRef
    const blobRefArb = fc.record({
      $type: fc.constant('blob' as const),
      ref: fc.record({ $link: fc.string({ minLength: 1 }) }),
      mimeType: fc.constantFrom('application/wacz', 'application/warc', 'image/jpeg'),
      size: fc.integer({ min: 1, max: 52_428_800 }),
    });

    // Arbitrary for StrongRef
    const strongRefArb = fc.record({
      uri: fc.string({ minLength: 1 }),
      cid: fc.string({ minLength: 1 }),
    });

    // Arbitrary for a non-empty sameAs array
    const sameAsArb = fc.array(
      fc.oneof(
        fc.string({ minLength: 1 }).map((s) => `at://${s}`),
        fc.string({ minLength: 1 }).map((s) => `https://${s}`)
      ),
      { minLength: 1 }
    );

    // Arbitrary for optional fields presence
    const optionalFieldsArb = fc.record({
      description: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      coverImage: fc.option(blobRefArb, { nil: undefined }),
      bskyPostRef: fc.option(strongRefArb, { nil: undefined }),
      tags: fc.option(fc.array(fc.string({ minLength: 1 }), { minLength: 1 }), { nil: undefined }),
      uploadedAt: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),   // title
        blobRefArb,                     // archiveFile
        sameAsArb,                      // sameAs
        fc.string({ minLength: 1 }),   // archiveDateCreatedAt
        optionalFieldsArb,              // optional fields
        async (title, archiveFile, sameAs, archiveDateCreatedAt, optionals) => {
          vi.clearAllMocks();

          const expectedUri = 'at://did:plc:testuser123/at.archiving.session/rkey1';
          mockCreateRecord.mockResolvedValueOnce({ data: { uri: expectedUri, cid: 'bafyreiabc123' } });

          // Build the record, only including optional fields that are defined
          const record: ArchiveSessionRecord = {
            $type: 'at.archiving.session',
            title,
            archiveFile: archiveFile as BlobRef,
            sameAs,
            archiveDateCreatedAt,
          };

          if (optionals.description !== undefined) record.description = optionals.description;
          if (optionals.coverImage !== undefined) record.coverImage = optionals.coverImage as BlobRef;
          if (optionals.bskyPostRef !== undefined) record.bskyPostRef = optionals.bskyPostRef;
          if (optionals.tags !== undefined) record.tags = optionals.tags;
          if (optionals.uploadedAt !== undefined) record.uploadedAt = optionals.uploadedAt;

          await createArchiveSession(fakeSession, record);

          expect(mockCreateRecord).toHaveBeenCalledOnce();
          const callArgs = mockCreateRecord.mock.calls[0][0];
          const payload = callArgs.record as ArchiveSessionRecord;

          // Required fields are present with correct values
          expect(payload.$type).toBe('at.archiving.session');
          expect(payload.title).toBe(title);
          expect(payload.archiveFile).toEqual(archiveFile);
          expect(payload.sameAs).toEqual(sameAs);
          expect(payload.archiveDateCreatedAt).toBe(archiveDateCreatedAt);

          // Optional fields: present iff provided
          if (optionals.description !== undefined) {
            expect(payload.description).toBe(optionals.description);
          } else {
            expect(payload).not.toHaveProperty('description');
          }

          if (optionals.coverImage !== undefined) {
            expect(payload.coverImage).toEqual(optionals.coverImage);
          } else {
            expect(payload).not.toHaveProperty('coverImage');
          }

          if (optionals.bskyPostRef !== undefined) {
            expect(payload.bskyPostRef).toEqual(optionals.bskyPostRef);
          } else {
            expect(payload).not.toHaveProperty('bskyPostRef');
          }

          if (optionals.tags !== undefined) {
            expect(payload.tags).toEqual(optionals.tags);
          } else {
            expect(payload).not.toHaveProperty('tags');
          }

          if (optionals.uploadedAt !== undefined) {
            expect(payload.uploadedAt).toBe(optionals.uploadedAt);
          } else {
            expect(payload).not.toHaveProperty('uploadedAt');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
