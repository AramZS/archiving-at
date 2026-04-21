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

  const configuredClientId = import.meta.env.VITE_CLIENT_ID as string | undefined;
  const redirectUri = `${location.origin}/auth/callback`;

  _client = new BrowserOAuthClient({
    handleResolver:
      (import.meta.env.VITE_HANDLE_RESOLVER as string | undefined) ??
      "https://bsky.social",
    // Burn metadata in when configured; otherwise use loopback defaults for local dev.
    clientMetadata: configuredClientId
      ? {
          client_id: configuredClientId,
          client_name: "Archiver's ATmosphere",
          client_uri: location.origin,
          redirect_uris: [redirectUri],
          scope: [
            "atproto",
            "transition:com.atproto.repo.applyWrites",
            "transition:com.atproto.repo.createRecord",
            "transition:com.atproto.repo.uploadBlob",
          ].join(" "),
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          application_type: "web",
          dpop_bound_access_tokens: true,
        }
      : undefined,
  });

  return _client;
}
