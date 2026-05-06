import { BrowserOAuthClient } from "@atproto/oauth-client-browser";

/**
 * If we're on localhost, redirect to 127.0.0.1 before any OAuth client code
 * runs. Doing it here (rather than relying on the constructor) means the
 * BrowserOAuthClient is never instantiated on the localhost origin.
 */
if (location.hostname === "localhost") {
  location.replace(location.href.replace("localhost", "127.0.0.1"));
}

let _client: BrowserOAuthClient | null = null;

const REMOTE_CLIENT_ID = "https://archiving.at/.well-known/oauth-client-metadata.json";

function getConfiguredClientId(): string | undefined {
  const clientId = import.meta.env.VITE_CLIENT_ID as string | undefined;

  if (clientId) return clientId;
  if (location.hostname === "archiving.at") return REMOTE_CLIENT_ID;

  return undefined;
}

export function hasWriteScopeClient(): boolean {
  return Boolean(getConfiguredClientId());
}

export const WRITE_SCOPE = [
  "atproto",
  "transition:com.atproto.repo.applyWrites",
  "transition:com.atproto.repo.createRecord",
  "transition:com.atproto.repo.uploadBlob",
].join(" ");

export function getOAuthClient(): BrowserOAuthClient {
  if (_client) return _client;

  const configuredClientId = getConfiguredClientId();

  _client = new BrowserOAuthClient({
    handleResolver:
      (import.meta.env.VITE_HANDLE_RESOLVER as string | undefined) ??
      "https://bsky.social",
    // Use remote metadata URL when configured; otherwise use loopback defaults for local dev.
    clientMetadata: configuredClientId
      ? { client_id: configuredClientId }
      : undefined,
  });

  return _client;
}
