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

export function getOAuthClient(): BrowserOAuthClient {
  if (_client) return _client;

  const isLoopback =
    location.hostname === "127.0.0.1" || location.hostname === "[::1]";

  _client = new BrowserOAuthClient({
    handleResolver:
      (import.meta.env.VITE_HANDLE_RESOLVER as string | undefined) ??
      "https://bsky.social",
    clientMetadata: isLoopback
      ? undefined
      : (import.meta.env.VITE_CLIENT_ID as string),
  });

  return _client;
}
