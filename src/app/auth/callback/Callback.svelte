<script lang="ts">
  import type { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

  export type AuthResult = {
    did: string;
    profile: ProfileViewDetailed | null;
  };

  type Props = {
    onSuccess: (result: AuthResult) => void;
  };

  let { onSuccess }: Props = $props();

  let error = $state<string | null>(null);

  async function handleCallback() {
    const { getOAuthClient } = await import("../../../lib/oauth");
    const client = await getOAuthClient();

    // init() automatically detects OAuth callback params in the URL,
    // resolves the matching redirect_uri, and exchanges the code for a session.
    const result = await client.init();

    if (!result?.session) {
      error = "Authentication completed but no session was returned.";
      return;
    }

    const { session } = result;

    const { Agent } = await import("@atproto/api");
    const agent = new Agent(session);
    let profile: ProfileViewDetailed | null = null;
    try {
      const res = await agent.getProfile({ actor: session.sub });
      profile = res.data;
    } catch (err) {
      console.warn("[Callback] profile fetch failed:", err);
    }

    onSuccess({ did: session.sub, profile });
  }

  handleCallback().catch((err: unknown) => {
    console.error("[Callback] unhandled error:", err);
    error =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred during sign-in.";
  });
</script>

<main class="callback-page">
  <div class="card">
    {#if error}
      <h1>Sign-in failed</h1>
      <p class="error" role="alert">{error}</p>
      <a href="/" class="back-link">← Back to login</a>
    {:else}
      <div class="spinner" aria-label="Completing sign-in…"></div>
      <p>Completing sign-in…</p>
    {/if}
  </div>
</main>

<style>
  .callback-page {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .card {
    width: 100%;
    max-width: 380px;
    padding: 2rem;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    text-align: center;
  }

  h1 { margin: 0 0 0.75rem; font-size: 1.25rem; }

  p { margin: 0.5rem 0 0; color: #6b7280; }

  .error {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    font-size: 0.875rem;
    text-align: left;
  }

  .back-link {
    display: inline-block;
    margin-top: 1rem;
    color: #6366f1;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back-link:hover { text-decoration: underline; }

  .spinner {
    width: 2.5rem;
    height: 2.5rem;
    margin: 0 auto 1rem;
    border: 3px solid #e5e7eb;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
