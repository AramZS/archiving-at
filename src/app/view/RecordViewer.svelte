<script lang="ts">
  import { onMount } from 'svelte';
  import {
    fetchRecord,
    fetchPublicProfile,
    buildBlobUrl,
    resolveOriginalUrl,
    type FetchedRecord,
  } from '../../lib/archiveRecord';

  // ---------------------------------------------------------------------------
  // TypeScript declaration for the <replay-web-page> custom element
  // ---------------------------------------------------------------------------
  declare global {
    namespace svelteHTML {
      interface IntrinsicElements {
        'replay-web-page': {
          source?: string;
          url?: string;
          class?: string;
          style?: string;
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  interface Props {
    navigate: (to: string) => void;
    /** rkey passed from App router (in-app navigation). Falls back to location if absent. */
    rkey?: string | null;
    /** did passed from App router (in-app navigation). Falls back to location if absent. */
    did?: string | null;
  }
  let { navigate, rkey: rkeyProp = null, did: didProp = null }: Props = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let status = $state<'loading' | 'success' | 'error'>('loading');
  let record = $state<FetchedRecord | null>(null);
  let pdsHost = $state<string | null>(null);
  let errorMessage = $state<string | null>(null);
  let replayError = $state<string | null>(null);
  let replayLoaded = $state(false);
  let replayEl = $state<Element | null>(null);
  let authorDisplayName = $state<string | null>(null);
  let authorHandle = $state<string | null>(null);

  // Resolved URL params — props take priority (in-app nav), location as fallback (direct hit)
  let did = $state<string | null>(null);
  let rkey = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  let blobUrl = $derived(
    status === 'success' && record && pdsHost && did
      ? buildBlobUrl(pdsHost, did, record.value.archiveFile.ref.$link)
      : ''
  );

  let original = $derived(
    status === 'success' && record
      ? resolveOriginalUrl(record.value.sameAs)
      : null
  );

  // ---------------------------------------------------------------------------
  // Mount: resolve URL params and fetch record
  // ---------------------------------------------------------------------------
  onMount(async () => {
    // Props (set by App router for in-app navigation) take priority.
    // Fall back to location for direct URL hits.
    const pathParts = location.pathname.split('/');
    rkey = rkeyProp || pathParts[pathParts.length - 1] || null;
    did = didProp || new URLSearchParams(location.search).get('did');

    if (!did || !rkey) {
      status = 'error';
      errorMessage = 'Missing required parameters: did and rkey are both required.';
      return;
    }

    const [result, profile] = await Promise.all([
      fetchRecord(did, rkey),
      fetchPublicProfile(did),
    ]);
    if (result.status === 'error') {
      status = 'error';
      errorMessage = result.message;
    } else {
      record = result.record;
      pdsHost = result.pdsHost;
      authorDisplayName = profile?.displayName ?? null;
      authorHandle = profile?.handle ?? null;
      status = 'success';
    }
  });

  // ---------------------------------------------------------------------------
  // Effect: attach replay-web-page timeout + event listeners
  // ---------------------------------------------------------------------------
  $effect(() => {
    if (status !== 'success' || !replayEl) return;

    const el = replayEl;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onLoad = () => {
      if (timer) clearTimeout(timer);
      replayLoaded = true;
    };

    const onError = () => {
      if (timer) clearTimeout(timer);
      replayError = 'Archive viewer failed to load.';
    };

    timer = setTimeout(() => {
      if (!replayLoaded) {
        //replayError = 'Archive viewer timed out after 30 seconds.';
        // This is not detecting the archive active or not. 
      }
    }, 30_000);

    el.addEventListener('load', onLoad);
    el.addEventListener('error', onError);

    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('load', onLoad);
      el.removeEventListener('error', onError);
    };
  });
</script>

<svelte:head>
  <!-- ReplayWeb.page registers the <replay-web-page> custom element -->
  
</svelte:head>

<div class="viewer-layout">
  <!-- Back link: always visible in all states -->
  <a
    href="/"
    class="back-link"
    onclick={(e) => { e.preventDefault(); navigate('/'); }}
  >← Home</a>

  {#if status === 'loading'}
    <p class="loading" aria-live="polite">Loading archive record…</p>

  {:else if status === 'error'}
    <div class="error-card" role="alert">
      <p>{errorMessage}</p>
    </div>

  {:else if status === 'success' && record}
    <div class="meta-panel">
      <h1>{record.value.title}</h1>
      {#if record.value.description}
        <p class="description">{record.value.description}</p>
      {/if}
      {#if original}
        <p class="original-url">
          Original URL: <a href={original} target="_blank" rel="noopener noreferrer">{original}</a>
        </p>
      {:else}
        <p class="no-original">Original URL not available.</p>
      {/if}
      <hr />
      {#if authorDisplayName || authorHandle}
        <p class="author">
          <span>Archived by: </span>
          {#if authorDisplayName}<span class="author-name">{authorDisplayName}</span>{/if}
          {#if authorDisplayName && authorHandle}<span class="separator"> | </span>{/if}
          {#if authorHandle}<span class="author-handle"><a href="https://bsky.app/profile/{authorHandle}" target="_blank">@{authorHandle}</a></span>{/if}
          {#if did}<span class="separator"> | </span><span class="did-link"><a href="https://pdsls.dev/at://{did}/at.archiving.session" target="_blank">User's archives on PDSls</a></span>{/if}
        </p>
      {/if}
    </div>

    {#if original}
      {#if replayError}
        <div class="error-card" role="alert">{replayError}</div>
      {/if}
      <replay-web-page
        bind:this={replayEl}
        source={blobUrl}
        url={original}
        class="replay-embed"
        embed="replay-with-info"
      ></replay-web-page>
    {/if}
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    background: #f4f6f8;
    color: #1f2937;
  }

  .viewer-layout {
    min-height: 100vh;
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .back-link {
    display: inline-block;
    color: #6366f1;
    text-decoration: none;
    font-size: 0.9rem;
    padding: 0.4rem 0;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .loading {
    color: #6b7280;
    font-size: 0.95rem;
  }

  .error-card {
    padding: 0.75rem 1rem;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    background: #fef2f2;
    color: #dc2626;
    font-size: 0.9rem;
  }

  .error-card p {
    margin: 0;
  }

  .meta-panel {
    padding: 1rem 1.5rem;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
  }

  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    color: #1f2937;
  }

  .author {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0 0 0.5rem;
    flex-wrap: wrap;
  }

  p.author span {
    font-size: 0.9rem;
    color: #374151;
    font-weight: 500;
  }

  .author-handle {
    font-size: 0.85rem;
    color: #6b7280;
  }

  .description {
    margin: 0 0 0.5rem;
    color: #374151;
    font-size: 0.95rem;
  }

  .original-url {
    margin: 0;
    font-size: 0.85rem;
    color: #6b7280;
    word-break: break-all;
  }

  .original-url a {
    color: #6366f1;
    text-decoration: none;
  }

  .original-url a:hover {
    text-decoration: underline;
  }

  .no-original {
    margin: 0;
    font-size: 0.85rem;
    color: #9ca3af;
  }

  .replay-embed {
    width: 100%;
    height: 80vh;
    display: block;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
</style>
