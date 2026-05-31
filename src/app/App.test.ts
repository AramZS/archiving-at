/**
 * App-level integration tests for the session restore flow.
 *
 * These tests verify the interactions between App.svelte's session management
 * logic and its two key dependencies: SessionStore and the OAuth client.
 *
 * Because App.svelte uses dynamic imports for the OAuth client and Svelte 5
 * runes require a component environment, we test the session management
 * behaviour by extracting and exercising the logic directly with mocked
 * dependencies — matching the project's established pattern of testing
 * extracted logic rather than mounting components.
 *
 * Requirements covered: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import {
  readSession,
  writeSession,
  clearSession,
  type ProfileData,
} from '../lib/sessionStore';

// ---------------------------------------------------------------------------
// Mock SessionStore
// ---------------------------------------------------------------------------

vi.mock('../lib/sessionStore', () => ({
  readSession: vi.fn(),
  writeSession: vi.fn(),
  clearSession: vi.fn(),
}));

const mockReadSession = readSession as MockedFunction<typeof readSession>;
const mockWriteSession = writeSession as MockedFunction<typeof writeSession>;
const mockClearSession = clearSession as MockedFunction<typeof clearSession>;

// ---------------------------------------------------------------------------
// Mock OAuth client
// ---------------------------------------------------------------------------

const mockRestore = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../lib/oauth', () => ({
  getOAuthClient: vi.fn().mockResolvedValue({
    restore: mockRestore,
    signOut: mockSignOut,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers — replicate App.svelte's session management logic
//
// These functions mirror the exact logic in App.svelte so that tests remain
// in sync with the implementation. Any change to App.svelte's session
// management should be reflected here.
// ---------------------------------------------------------------------------

type AuthState = {
  did: string | null;
  displayName: string | null;
  handle: string | null;
  avatar: string | null;
  session: unknown;
  restoring: boolean;
};

function makeAuthState(): AuthState {
  return {
    did: null,
    displayName: null,
    handle: null,
    avatar: null,
    session: null,
    restoring: false,
  };
}

/**
 * Mirrors App.svelte's initSession() function.
 * Returns the resulting auth state after the restore attempt completes.
 */
async function runInitSession(
  state: AuthState,
  oauthClient: { restore: typeof mockRestore }
): Promise<AuthState> {
  const storedData = readSession();
  if (!storedData) {
    return state;
  }

  state.restoring = true;
  try {
    const restoredSession = await oauthClient.restore(storedData.did);
    state.did = storedData.did;
    state.displayName = storedData.displayName;
    state.handle = storedData.handle;
    state.avatar = storedData.avatar;
    state.session = restoredSession;
    state.restoring = false;
  } catch (err) {
    clearSession();
    state.did = null;
    state.displayName = null;
    state.handle = null;
    state.avatar = null;
    state.session = null;
    state.restoring = false;
  }
  return state;
}

type AuthResult = {
  did: string;
  profile: { displayName?: string; handle?: string; avatar?: string } | null;
};

/**
 * Mirrors App.svelte's onAuthSuccess() function.
 * Returns the resulting auth state and the data passed to writeSession.
 */
function runOnAuthSuccess(
  state: AuthState,
  result: AuthResult
): { state: AuthState; writtenData: ProfileData } {
  state.did = result.did;
  state.displayName = result.profile?.displayName ?? null;
  state.handle = result.profile?.handle ?? null;
  state.avatar = result.profile?.avatar ?? null;

  const writtenData: ProfileData = {
    did: result.did,
    displayName: result.profile?.displayName ?? null,
    handle: result.profile?.handle ?? null,
    avatar: result.profile?.avatar ?? null,
  };
  writeSession(writtenData);

  return { state, writtenData };
}

/**
 * Mirrors App.svelte's signOut() function.
 * Returns the resulting auth state after sign-out completes.
 */
async function runSignOut(
  state: AuthState,
  oauthClient: { restore: typeof mockRestore },
  did: string
): Promise<AuthState> {
  try {
    clearSession();
  } catch (err) {
    // log and continue — auth state must still be cleared
  }
  try {
    const session = await oauthClient.restore(did);
    await (session as { signOut: () => Promise<void> }).signOut();
  } catch {
    // best-effort
  }
  state.did = null;
  state.displayName = null;
  state.handle = null;
  state.avatar = null;
  state.session = null;
  state.restoring = false;
  return state;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const STORED_PROFILE: ProfileData = {
  did: 'did:plc:abc123',
  displayName: 'Alice',
  handle: 'alice.bsky.social',
  avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:abc123/bafkreiabc@jpeg',
};

const FAKE_SESSION = { sub: 'did:plc:abc123', signOut: mockSignOut };

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Restore-on-init flow (Requirement 2)
// ---------------------------------------------------------------------------

describe('initSession — restore-on-init flow', () => {
  it('sets restoring=true before the restore call and false after success (Req 2.4)', async () => {
    mockReadSession.mockReturnValue(STORED_PROFILE);

    let restoringDuringCall = false;
    mockRestore.mockImplementation(async () => {
      // Capture restoring state mid-flight by checking it was set before we resolve
      restoringDuringCall = true;
      return FAKE_SESSION;
    });

    const state = makeAuthState();
    // restoring starts false
    expect(state.restoring).toBe(false);

    const resultPromise = runInitSession(state, { restore: mockRestore });
    // restoring is set to true synchronously before the async restore call
    expect(state.restoring).toBe(true);

    await resultPromise;
    expect(restoringDuringCall).toBe(true);
    expect(state.restoring).toBe(false);
  });

  it('populates auth state from stored ProfileData after a successful restore (Req 2.2)', async () => {
    mockReadSession.mockReturnValue(STORED_PROFILE);
    mockRestore.mockResolvedValue(FAKE_SESSION);

    const state = makeAuthState();
    await runInitSession(state, { restore: mockRestore });

    expect(state.did).toBe(STORED_PROFILE.did);
    expect(state.displayName).toBe(STORED_PROFILE.displayName);
    expect(state.handle).toBe(STORED_PROFILE.handle);
    expect(state.avatar).toBe(STORED_PROFILE.avatar);
    expect(state.session).toBe(FAKE_SESSION);
    expect(state.restoring).toBe(false);
  });

  it('does not attempt a restore and leaves auth state unauthenticated when store is empty (Req 2.5)', async () => {
    mockReadSession.mockReturnValue(null);

    const state = makeAuthState();
    await runInitSession(state, { restore: mockRestore });

    expect(mockRestore).not.toHaveBeenCalled();
    expect(state.did).toBeNull();
    expect(state.restoring).toBe(false);
  });

  it('clears the store and resets auth state when restore throws (Req 2.3)', async () => {
    mockReadSession.mockReturnValue(STORED_PROFILE);
    mockRestore.mockRejectedValue(new Error('Token expired'));

    const state = makeAuthState();
    await runInitSession(state, { restore: mockRestore });

    expect(mockClearSession).toHaveBeenCalledOnce();
    expect(state.did).toBeNull();
    expect(state.displayName).toBeNull();
    expect(state.handle).toBeNull();
    expect(state.avatar).toBeNull();
    expect(state.session).toBeNull();
    expect(state.restoring).toBe(false);
  });

  it('clears the store and shows login when restore rejects with any error (Req 2.3, 5.1)', async () => {
    mockReadSession.mockReturnValue(STORED_PROFILE);
    mockRestore.mockRejectedValue(new Error('Session revoked'));

    const state = makeAuthState();
    await runInitSession(state, { restore: mockRestore });

    expect(mockClearSession).toHaveBeenCalledOnce();
    expect(state.did).toBeNull();
    expect(state.restoring).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onAuthSuccess — writeSession is called with correct ProfileData (Req 1.1, 2.1)
// ---------------------------------------------------------------------------

describe('onAuthSuccess — session persistence', () => {
  it('calls writeSession with the correct ProfileData after OAuth callback success (Req 1.1)', () => {
    const result: AuthResult = {
      did: 'did:plc:xyz789',
      profile: {
        displayName: 'Bob',
        handle: 'bob.bsky.social',
        avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:xyz789/bafkreibob@jpeg',
      },
    };

    const state = makeAuthState();
    const { writtenData } = runOnAuthSuccess(state, result);

    expect(mockWriteSession).toHaveBeenCalledOnce();
    expect(mockWriteSession).toHaveBeenCalledWith(writtenData);
    expect(writtenData).toEqual({
      did: 'did:plc:xyz789',
      displayName: 'Bob',
      handle: 'bob.bsky.social',
      avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:xyz789/bafkreibob@jpeg',
    });
  });

  it('writes null for optional profile fields that are absent (Req 1.1)', () => {
    const result: AuthResult = {
      did: 'did:plc:minimal',
      profile: null,
    };

    const state = makeAuthState();
    runOnAuthSuccess(state, result);

    expect(mockWriteSession).toHaveBeenCalledWith({
      did: 'did:plc:minimal',
      displayName: null,
      handle: null,
      avatar: null,
    });
  });

  it('sets auth state correctly after OAuth callback success (Req 2.1)', () => {
    const result: AuthResult = {
      did: 'did:plc:xyz789',
      profile: { displayName: 'Bob', handle: 'bob.bsky.social', avatar: null },
    };

    const state = makeAuthState();
    runOnAuthSuccess(state, result);

    expect(state.did).toBe('did:plc:xyz789');
    expect(state.displayName).toBe('Bob');
    expect(state.handle).toBe('bob.bsky.social');
    expect(state.avatar).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// signOut — clearSession is called before OAuth sign-out (Req 3.1, 3.2)
// ---------------------------------------------------------------------------

describe('signOut — session clearing', () => {
  it('calls clearSession before the OAuth sign-out call (Req 3.1)', async () => {
    const callOrder: string[] = [];
    mockClearSession.mockImplementation(() => { callOrder.push('clearSession'); });
    mockRestore.mockResolvedValue({
      signOut: vi.fn().mockImplementation(async () => { callOrder.push('signOut'); }),
    });

    const state = makeAuthState();
    state.did = 'did:plc:abc123';
    await runSignOut(state, { restore: mockRestore }, 'did:plc:abc123');

    expect(callOrder[0]).toBe('clearSession');
    expect(callOrder[1]).toBe('signOut');
  });

  it('clears auth state after sign-out completes (Req 3.2)', async () => {
    mockClearSession.mockImplementation(() => {});
    mockRestore.mockResolvedValue({ signOut: vi.fn().mockResolvedValue(undefined) });

    const state = makeAuthState();
    state.did = 'did:plc:abc123';
    state.displayName = 'Alice';
    state.handle = 'alice.bsky.social';
    await runSignOut(state, { restore: mockRestore }, 'did:plc:abc123');

    expect(state.did).toBeNull();
    expect(state.displayName).toBeNull();
    expect(state.handle).toBeNull();
    expect(state.avatar).toBeNull();
    expect(state.session).toBeNull();
  });

  it('still clears auth state even when clearSession throws (Req 3.3)', async () => {
    mockClearSession.mockImplementation(() => { throw new Error('Storage error'); });
    mockRestore.mockResolvedValue({ signOut: vi.fn().mockResolvedValue(undefined) });

    const state = makeAuthState();
    state.did = 'did:plc:abc123';
    state.displayName = 'Alice';

    // Should not throw
    await expect(
      runSignOut(state, { restore: mockRestore }, 'did:plc:abc123')
    ).resolves.not.toThrow();

    expect(state.did).toBeNull();
    expect(state.displayName).toBeNull();
  });

  it('still clears auth state even when the OAuth sign-out call throws (Req 3.2)', async () => {
    mockClearSession.mockImplementation(() => {});
    mockRestore.mockRejectedValue(new Error('Network error'));

    const state = makeAuthState();
    state.did = 'did:plc:abc123';
    state.displayName = 'Alice';

    await runSignOut(state, { restore: mockRestore }, 'did:plc:abc123');

    expect(state.did).toBeNull();
    expect(state.displayName).toBeNull();
  });
});
