<script lang="ts">
  import type { OAuthSession } from '@atproto/oauth-client-browser';
  import UploadForm from '../../components/UploadForm.svelte';

  interface Props {
    session: OAuthSession | null;
    navigate: (to: string) => void;
  }
  let { session, navigate }: Props = $props();

  $effect(() => {
    if (session === null) {
      navigate('/');
    }
  });
</script>

{#if session !== null}
  <UploadForm {session} {navigate} />
{/if}
