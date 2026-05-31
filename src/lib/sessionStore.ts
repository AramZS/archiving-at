const LOG_PREFIX = "[sessionStore]";

export type ProfileData = {
  did: string;
  displayName: string | null;
  handle: string | null;
  avatar: string | null;
};

const STORAGE_KEY = "archivers-at:session";

// ---------------------------------------------------------------------------
// Backing store selection
// On module load, probe localStorage with a test write/read. If it throws
// (e.g. private browsing with storage blocked), fall back to an in-memory
// variable for the lifetime of the page session.
// ---------------------------------------------------------------------------

type BackingStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

let _memoryStore: string | null = null;

const memoryBacking: BackingStore = {
  getItem(_key: string): string | null {
    return _memoryStore;
  },
  setItem(_key: string, value: string): void {
    _memoryStore = value;
  },
  removeItem(_key: string): void {
    _memoryStore = null;
  },
};

function probeLocalStorage(): BackingStore {
  const TEST_KEY = "__archivers_at_probe__";
  try {
    localStorage.setItem(TEST_KEY, "1");
    const result = localStorage.getItem(TEST_KEY);
    localStorage.removeItem(TEST_KEY);
    if (result !== "1") {
      throw new Error("localStorage probe read/write mismatch");
    }
    return localStorage;
  } catch {
    console.warn(
      `${LOG_PREFIX} localStorage is unavailable; session persistence is disabled for this page session`
    );
    return memoryBacking;
  }
}

let _store: BackingStore = probeLocalStorage();

/**
 * Replaces the backing store. Intended for use in tests only.
 * @internal
 */
export function _setBackingStore(store: BackingStore): void {
  _store = store;
}

/**
 * Resets the in-memory fallback variable. Intended for use in tests only.
 * @internal
 */
export function _resetMemoryStore(): void {
  _memoryStore = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialises ProfileData to JSON and writes it to the backing store under
 * the fixed application key. Only the four allowed fields are persisted —
 * no tokens or credentials. Write errors are caught and logged.
 */
export function writeSession(data: ProfileData): void {
  const payload: ProfileData = {
    did: data.did,
    displayName: data.displayName,
    handle: data.handle,
    avatar: data.avatar,
  };
  try {
    _store.setItem(STORAGE_KEY, JSON.stringify(payload));
    console.debug(`${LOG_PREFIX} session written`, { did: data.did });
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to write session`, err);
  }
}

/**
 * Reads and JSON-parses the stored ProfileData. Validates that `did` is a
 * non-empty string (after trimming). Removes the entry and returns null on
 * parse failure or invalid DID. Returns null if the store is empty.
 */
export function readSession(): ProfileData | null {
  let raw: string | null;
  try {
    raw = _store.getItem(STORAGE_KEY);
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to read session`, err);
    return null;
  }

  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`${LOG_PREFIX} stored session is malformed JSON; removing entry`);
    _removeEntry();
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).did !== "string" ||
    ((parsed as Record<string, unknown>).did as string).trim() === ""
  ) {
    console.warn(`${LOG_PREFIX} stored session has invalid DID; removing entry`);
    _removeEntry();
    return null;
  }

  const record = parsed as Record<string, unknown>;
  return {
    did: record.did as string,
    displayName: typeof record.displayName === "string" ? record.displayName : null,
    handle: typeof record.handle === "string" ? record.handle : null,
    avatar: typeof record.avatar === "string" ? record.avatar : null,
  };
}

/**
 * Removes the stored ProfileData entry from the backing store.
 * Errors are caught and logged; they do not propagate to callers.
 */
export function clearSession(): void {
  _removeEntry();
}

function _removeEntry(): void {
  try {
    _store.removeItem(STORAGE_KEY);
    console.debug(`${LOG_PREFIX} session cleared`);
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to clear session`, err);
  }
}
