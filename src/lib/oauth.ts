import { BrowserOAuthClient } from "@atproto/oauth-client-browser";

const LOG_PREFIX = "[oauth]";

/**
 * If we're on localhost, redirect to 127.0.0.1 before any OAuth client code
 * runs. Doing it here (rather than relying on the constructor) means the
 * BrowserOAuthClient is never instantiated on the localhost origin.
 */
if (location.hostname === "localhost") {
  console.info(`${LOG_PREFIX} redirecting localhost to 127.0.0.1`, {
    from: location.href,
    to: location.href.replace("localhost", "127.0.0.1"),
  });
  location.replace(location.href.replace("localhost", "127.0.0.1"));
}

let _client: Promise<BrowserOAuthClient> | null = null;

const REMOTE_CLIENT_ID = "https://archiving.at/.well-known/oauth-client-metadata.json";

function isArchivingDomain(hostname: string): boolean {
  const matches = hostname === "archiving.at" || hostname.endsWith(".archiving.at");
  console.debug(`${LOG_PREFIX} checked archiving domain`, { hostname, matches });
  return matches;
}

function getConfiguredClientId(): string | undefined {
  const clientId = import.meta.env.VITE_CLIENT_ID as string | undefined;

  if (clientId) {
    console.info(`${LOG_PREFIX} using client id from VITE_CLIENT_ID`, { clientId });
    return clientId;
  }

  if (isArchivingDomain(location.hostname)) {
    console.info(`${LOG_PREFIX} using hosted client id for archiving domain`, {
      hostname: location.hostname,
      clientId: REMOTE_CLIENT_ID,
    });
    return REMOTE_CLIENT_ID;
  }

  console.info(`${LOG_PREFIX} no configured client id; using loopback client metadata`, {
    hostname: location.hostname,
  });

  return undefined;
}

export function hasWriteScopeClient(): boolean {
  const enabled = Boolean(getConfiguredClientId());
  console.debug(`${LOG_PREFIX} write-scope client availability`, { enabled });
  return enabled;
}

export const WRITE_SCOPE = "atproto blob:application/zip blob:application/warc repo:test.record.activity repo:test.foo.bar?action=create&action=update rpc:app.bsky.actor.getProfile?aud=did%3Aweb%3Aapi.bsky.app%23bsky_appview";

export function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (_client) {
    console.debug(`${LOG_PREFIX} reusing cached BrowserOAuthClient promise`);
    return _client;
  }

  const configuredClientId = getConfiguredClientId();
  const options = {
    handleResolver:
      (import.meta.env.VITE_HANDLE_RESOLVER as string | undefined) ??
      "https://bsky.social",
  };

  console.info(`${LOG_PREFIX} creating BrowserOAuthClient`, {
    configuredClientId,
    handleResolver: options.handleResolver,
    location: location.href,
  });

  _client = configuredClientId
    ? BrowserOAuthClient.load({ clientId: configuredClientId, ...options })
    : Promise.resolve(new BrowserOAuthClient(options));

  _client = _client
    .then((client) => {
      console.info(`${LOG_PREFIX} BrowserOAuthClient ready`, {
        mode: configuredClientId ? "remote-metadata" : "loopback",
        configuredClientId,
      });
      return client;
    })
    .catch((error) => {
      console.error(`${LOG_PREFIX} failed to create BrowserOAuthClient`, error);
      _client = null;
      throw error;
    });

  return _client;
}
