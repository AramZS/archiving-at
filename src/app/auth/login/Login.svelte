<script lang="ts">
  import { WRITE_SCOPE, hasWriteScopeClient } from "../../../lib/oauth";

  type Props = {
    onSuccess?: (did: string) => void;
  };

  let { onSuccess }: Props = $props();

  let handle = $state("");
  let error = $state<string | null>(null);
  let loading = $state(false);

  // Request base ATProto access plus explicit write transitions when the hosted metadata is available.
  const oauthScope = hasWriteScopeClient() ? WRITE_SCOPE : "atproto";

  /**
   * Handles login form submission by starting the OAuth sign-in redirect flow.
   * Updates local UI state for loading/error and normalizes non-Error failures.
   */
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    loading = true;

    try {
      const { getOAuthClient } = await import("../../../lib/oauth");
      // signIn redirects the browser — promise only rejects on cancel/back
      await getOAuthClient().signIn(handle.trim(), {
        scope: oauthScope,
      });
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Sign-in was cancelled or failed. Please try again.";
    } finally {
      loading = false;
    }
  }
</script>

<main class="login-page">
  <div class="card">
    <h1>Sign in</h1>
    <p class="subtitle">Enter your ATProto handle to continue</p>

    <form onsubmit={handleSubmit}>
      <label for="handle">Handle</label>
      <input
        id="handle"
        type="text"
        bind:value={handle}
        placeholder="you.bsky.social"
        autocomplete="username"
        autocapitalize="none"
        spellcheck={false}
        disabled={loading}
        required
      />

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <button type="submit" disabled={loading || !handle.trim()}>
        {loading ? "Redirecting…" : "Sign in with ATProto"}
      </button>
    </form>
  </div>
</main>

<style>
  .login-page {
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
  }

  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

  .subtitle {
    margin: 0 0 1.5rem;
    color: #6b7280;
    font-size: 0.9rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  input {
    padding: 0.6rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  input:disabled {
    background: #f9fafb;
    color: #9ca3af;
  }

  .error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    font-size: 0.875rem;
  }

  button {
    padding: 0.65rem 1rem;
    border: none;
    border-radius: 8px;
    background: #6366f1;
    color: #fff;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
  }

  button:hover:not(:disabled) { background: #4f46e5; }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
