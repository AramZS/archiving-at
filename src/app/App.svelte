<script lang="ts">
  import { getActivityRecords, type RepoRecord } from "../lib/getBskyData";
  import Login from "./auth/login/Login.svelte";
  import Callback, { type AuthResult } from "./auth/callback/Callback.svelte";

  let path = $state(location.pathname);
  // True when the current page load looks like an OAuth callback response
  let isCallback = $state(
    location.pathname.startsWith("/auth/callback") ||
    location.hash.startsWith("#state=") ||
    location.search.includes("state=")
  );

  /**
   * Performs in-app navigation by updating the browser history and local route state.
   * Also clears callback mode so normal route rendering can resume.
   */
  function navigate(to: string) {
    history.pushState({}, "", to);
    path = to;
    isCallback = false;
  }

  window.addEventListener("popstate", () => {
    path = location.pathname;
  });

  let did = $state<string | null>(null);
  let displayName = $state<string | null>(null);
  let handle = $state<string | null>(null);
  let avatar = $state<string | null>(null);
  let activityRecords = $state<RepoRecord[]>([]);
  let recordsLoading = $state(false);
  let recordsError = $state<string | null>(null);

  async function loadActivityRecords(currentDid: string) {
    recordsLoading = true;
    recordsError = null;

    try {
      const { getOAuthClient } = await import("../lib/oauth");
      const client = await getOAuthClient();
      const session = await client.restore(currentDid);
      activityRecords = await getActivityRecords(session);
	  console.log('[App] got activity records', activityRecords)
    } catch (err) {
      console.error("[App] failed to load activity records:", err);
      activityRecords = [];
      recordsError = err instanceof Error ? err.message : "Failed to load records.";
    } finally {
      recordsLoading = false;
    }
  }

  /**
   * Applies a successful OAuth result to local user state and returns the app to the home route.
   */
  function onAuthSuccess(result: AuthResult) {
    console.log("[onAuthSuccess] result:", result);
    console.log("[onAuthSuccess] did:", result.did);
    console.log("[onAuthSuccess] profile:", result.profile);
    did = result.did;
    displayName = result.profile?.displayName ?? null;
    handle = result.profile?.handle ?? null;
    avatar = result.profile?.avatar ?? null;
    void loadActivityRecords(result.did);
    console.log("[onAuthSuccess] state after set — did:", did, "displayName:", displayName, "handle:", handle);
    navigate("/");
    console.log("[onAuthSuccess] navigated to /, path is now:", path);
  }

  /**
   * Signs out the active DID session if available, then clears local profile/session state.
   * Sign-out errors are intentionally ignored to keep this action best-effort.
   */
  async function signOut() {
    const { getOAuthClient } = await import("../lib/oauth");
    if (!did) return;
    try {
      const client = await getOAuthClient();
      const session = await client.restore(did);
      await session.signOut();
    } catch {
      // best-effort
    }
    did = null;
    displayName = null;
    handle = null;
    avatar = null;
    activityRecords = [];
    recordsLoading = false;
    recordsError = null;
  }
</script>

<svelte:head>
  <title>Archiver's ATmosphere</title>
</svelte:head>

{#if isCallback}
  <Callback onSuccess={onAuthSuccess} />
{:else if did}
  <main class="center">
    <div class="card">
      {#if avatar}
        <img class="avatar" src={avatar} alt="{displayName ?? handle}'s avatar" />
      {/if}
      <h1>{displayName ?? handle ?? "Welcome"}</h1>
      {#if handle}
        <p class="handle">@{handle}</p>
      {/if}
      <p class="did"><code>{did}</code></p>
      <div class="list-records">
        <h2>Activity Records</h2>
        {#if recordsLoading}
          <p class="records-status">Loading records...</p>
        {:else if recordsError}
          <p class="records-error" role="alert">{recordsError}</p>
        {:else if activityRecords.length === 0}
          <p class="records-status">No test.record.activity records found.</p>
        {:else}
          <ul>
            {#each activityRecords as record}
              <li>
                <p class="record-uri">{record.uri}</p>
                <pre>{JSON.stringify(record.value, null, 2)}</pre>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <button onclick={signOut}>Sign out</button>
    </div>
  </main>
{:else}
  <Login />
{/if}

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    background: #f4f6f8;
    color: #1f2937;
  }

  .center {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 1rem;
  }

  .card {
    width: 100%;
    max-width: 420px;
    padding: 2rem;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    text-align: center;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    object-fit: cover;
    margin-bottom: 1rem;
  }

  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

  .handle {
    margin: 0 0 0.25rem;
    color: #6b7280;
    font-size: 0.95rem;
  }

  .did {
    margin: 0 0 1.5rem;
    color: #9ca3af;
    font-size: 0.75rem;
    word-break: break-all;
  }

  .list-records {
    margin: 0 0 1.5rem;
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    text-align: left;
  }

  .list-records h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .list-records ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.75rem;
  }

  .list-records li {
    padding: 0.75rem;
    border-radius: 8px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
  }

  .record-uri {
    margin: 0 0 0.5rem;
    color: #374151;
    font-size: 0.75rem;
    word-break: break-all;
  }

  .records-status {
    margin: 0;
    color: #6b7280;
    font-size: 0.9rem;
  }

  .records-error {
    margin: 0;
    color: #dc2626;
    font-size: 0.9rem;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.75rem;
    color: #1f2937;
    font-family: ui-monospace, monospace;
  }

  code {
    font-family: ui-monospace, monospace;
  }

  button {
    padding: 0.6rem 1.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    color: #374151;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  button:hover { background: #f9fafb; }
</style>
