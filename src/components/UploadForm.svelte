<script lang="ts">
  import type { OAuthSession } from '@atproto/oauth-client-browser';
  import { validateFormFields, initialFormState } from '../lib/formValidation';
  import { uploadBlob, resolveStrongRef, createArchiveSession } from '../lib/uploadSession';
  import type { BlobRef, ArchiveSessionRecord } from '../lib/uploadSession';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------

  interface Props {
    session: OAuthSession;
    navigate: (to: string) => void;
  }
  let { session, navigate }: Props = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let title = $state('');
  let description = $state('');
  let archiveFile = $state<File | null>(null);
  let coverImage = $state<File | null>(null);
  let bskyPostRef = $state('');
  let sameAs = $state<string[]>(['']);
  let tags = $state<string[]>([]);
  let archiveDateCreatedAt = $state('');
  let uploadedAt = $state('');
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let successUri = $state<string | null>(null);
  let errors = $state<Record<string, string>>({});

  // Retained blob refs so the user can retry record creation without re-uploading
  let archiveBlobRef = $state<BlobRef | null>(null);
  let coverBlobRef = $state<BlobRef | null>(null);

  // ---------------------------------------------------------------------------
  // Dynamic list helpers
  // ---------------------------------------------------------------------------

  function addSameAs() {
    sameAs = [...sameAs, ''];
  }

  function removeSameAs(i: number) {
    sameAs = sameAs.filter((_, idx) => idx !== i);
  }

  function addTag() {
    tags = [...tags, ''];
  }

  function removeTag(i: number) {
    tags = tags.filter((_, idx) => idx !== i);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const result = validateFormFields({
      title,
      description,
      archiveFile,
      coverImage,
      bskyPostRef,
      sameAs,
      tags,
      archiveDateCreatedAt,
      uploadedAt,
    });
    errors = result;
    return Object.keys(result).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    submitting = true;
    submitError = null;

    if (!validate()) {
      submitting = false;
      return;
    }

    try {
      // Upload archive blob (retain on retry)
      if (!archiveBlobRef) {
        archiveBlobRef = await uploadBlob(session, archiveFile!);
      }

      // Upload cover image blob if provided (retain on retry)
      if (coverImage && !coverBlobRef) {
        coverBlobRef = await uploadBlob(session, coverImage);
      }

      // Resolve bskyPostRef strong ref if provided
      let resolvedBskyPostRef: { uri: string; cid: string } | undefined;
      if (bskyPostRef.trim()) {
        try {
          resolvedBskyPostRef = await resolveStrongRef(session, bskyPostRef.trim());
        } catch (err) {
          errors = {
            ...errors,
            bskyPostRef: err instanceof Error ? err.message : 'Could not resolve Bluesky post reference.',
          };
          submitting = false;
          return;
        }
      }

      // Build the record
      const record: ArchiveSessionRecord = {
        $type: 'at.archiving.session',
        title: title.trim(),
        archiveFile: archiveBlobRef,
        sameAs: sameAs.filter((s) => s.trim() !== ''),
        archiveDateCreatedAt,
      };

      if (description.trim()) record.description = description.trim();
      if (coverBlobRef) record.coverImage = coverBlobRef;
      if (resolvedBskyPostRef) record.bskyPostRef = resolvedBskyPostRef;
      if (tags.filter((t) => t.trim()).length > 0) {
        record.tags = tags.filter((t) => t.trim() !== '');
      }
      if (uploadedAt.trim()) record.uploadedAt = uploadedAt.trim();

      // Create the record
      const uri = await createArchiveSession(session, record);
      successUri = uri;
    } catch (err) {
      submitError = err instanceof Error ? err.message : 'An unexpected error occurred.';
    } finally {
      submitting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  function reset() {
    const initial = initialFormState();
    title = initial.title;
    description = initial.description;
    archiveFile = initial.archiveFile;
    coverImage = initial.coverImage;
    bskyPostRef = initial.bskyPostRef;
    sameAs = initial.sameAs;
    tags = initial.tags;
    archiveDateCreatedAt = initial.archiveDateCreatedAt;
    uploadedAt = initial.uploadedAt;
    submitting = initial.submitting;
    submitError = initial.submitError;
    successUri = initial.successUri;
    errors = initial.errors;
    archiveBlobRef = initial.archiveBlobRef as BlobRef | null;
    coverBlobRef = initial.coverBlobRef as BlobRef | null;
  }
</script>

{#if successUri}
  <!-- Success panel -->
  <main class="center">
    <div class="card">
      <h1>Upload Successful</h1>
      <p class="success-label">Your archive session was created:</p>
      <p class="success-uri"><code>{successUri}</code></p>
      <div class="button-row">
        <button onclick={reset}>Upload another</button>
        <button onclick={() => navigate('/')}>Back to home</button>
      </div>
    </div>
  </main>
{:else}
  <!-- Upload form -->
  <main class="center">
    <div class="card form-card">
      <div class="form-header">
        <button class="back-btn" onclick={() => navigate('/')}>← Back</button>
        <h1>Upload Archive Session</h1>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>

        <!-- ---------------------------------------------------------------- -->
        <!-- Required fields                                                   -->
        <!-- ---------------------------------------------------------------- -->
        <section class="field-section">
          <h2 class="section-heading">Required</h2>

          <!-- Title -->
          <div class="field-group">
            <label for="title">Title <span class="required">*</span></label>
            <input
              id="title"
              type="text"
              bind:value={title}
              placeholder="Archive title"
              aria-describedby={errors.title ? 'title-error' : undefined}
            />
            {#if errors.title}
              <p id="title-error" class="field-error" role="alert">{errors.title}</p>
            {/if}
          </div>

          <!-- Archive file -->
          <div class="field-group">
            <label for="archiveFile">Archive File <span class="required">*</span></label>
            <input
              id="archiveFile"
              type="file"
              accept="application/warc,application/warc+gzip,application/wacz,application/zip,.wacz"
              onchange={(e) => {
                const input = e.currentTarget as HTMLInputElement;
                archiveFile = input.files?.[0] ?? null;
                archiveBlobRef = null;
              }}
              aria-describedby={errors.archiveFile ? 'archiveFile-error' : undefined}
            />
            {#if errors.archiveFile}
              <p id="archiveFile-error" class="field-error" role="alert">{errors.archiveFile}</p>
            {/if}
          </div>

          <!-- sameAs dynamic list -->
          <div class="field-group">
            <label>URLs (sameAs) <span class="required">*</span></label>
            {#if errors.sameAs}
              <p class="field-error" role="alert">{errors.sameAs}</p>
            {/if}
            {#each sameAs as url, i}
              <div class="list-row">
                <input
                  type="text"
                  bind:value={sameAs[i]}
                  placeholder="at://... or https://..."
                  aria-label="URL {i + 1}"
                  aria-describedby={errors[`sameAs_${i}`] ? `sameAs-error-${i}` : undefined}
                />
                <button
                  type="button"
                  class="remove-btn"
                  onclick={() => removeSameAs(i)}
                  aria-label="Remove URL {i + 1}"
                >Remove</button>
              </div>
              {#if errors[`sameAs_${i}`]}
                <p id="sameAs-error-{i}" class="field-error" role="alert">{errors[`sameAs_${i}`]}</p>
              {/if}
            {/each}
            <button type="button" class="add-btn" onclick={addSameAs}>+ Add URL</button>
          </div>

          <!-- archiveDateCreatedAt -->
          <div class="field-group">
            <label for="archiveDateCreatedAt">Archive Created At <span class="required">*</span></label>
            <input
              id="archiveDateCreatedAt"
              type="datetime-local"
              bind:value={archiveDateCreatedAt}
              aria-describedby={errors.archiveDateCreatedAt ? 'archiveDateCreatedAt-error' : undefined}
            />
            {#if errors.archiveDateCreatedAt}
              <p id="archiveDateCreatedAt-error" class="field-error" role="alert">{errors.archiveDateCreatedAt}</p>
            {/if}
          </div>
        </section>

        <!-- ---------------------------------------------------------------- -->
        <!-- Optional fields                                                   -->
        <!-- ---------------------------------------------------------------- -->
        <section class="field-section">
          <h2 class="section-heading">Optional</h2>

          <!-- Description -->
          <div class="field-group">
            <label for="description">Description</label>
            <textarea
              id="description"
              bind:value={description}
              placeholder="Brief description or excerpt from the archive"
              rows="4"
              aria-describedby={errors.description ? 'description-error' : undefined}
            ></textarea>
            {#if errors.description}
              <p id="description-error" class="field-error" role="alert">{errors.description}</p>
            {/if}
          </div>

          <!-- Cover image -->
          <div class="field-group">
            <label for="coverImage">Cover Image</label>
            <input
              id="coverImage"
              type="file"
              accept="image/*"
              onchange={(e) => {
                const input = e.currentTarget as HTMLInputElement;
                coverImage = input.files?.[0] ?? null;
                coverBlobRef = null;
              }}
              aria-describedby={errors.coverImage ? 'coverImage-error' : undefined}
            />
            {#if errors.coverImage}
              <p id="coverImage-error" class="field-error" role="alert">{errors.coverImage}</p>
            {/if}
          </div>

          <!-- bskyPostRef -->
          <div class="field-group">
            <label for="bskyPostRef">Bluesky Post Reference</label>
            <input
              id="bskyPostRef"
              type="text"
              bind:value={bskyPostRef}
              placeholder="at://did:plc:.../app.bsky.feed.post/..."
              aria-describedby={errors.bskyPostRef ? 'bskyPostRef-error' : undefined}
            />
            {#if errors.bskyPostRef}
              <p id="bskyPostRef-error" class="field-error" role="alert">{errors.bskyPostRef}</p>
            {/if}
          </div>

          <!-- Tags dynamic list -->
          <div class="field-group">
            <label>Tags</label>
            {#each tags as tag, i}
              <div class="list-row">
                <input
                  type="text"
                  bind:value={tags[i]}
                  placeholder="Tag"
                  aria-label="Tag {i + 1}"
                  aria-describedby={errors[`tag_${i}`] ? `tag-error-${i}` : undefined}
                />
                <button
                  type="button"
                  class="remove-btn"
                  onclick={() => removeTag(i)}
                  aria-label="Remove tag {i + 1}"
                >Remove</button>
              </div>
              {#if errors[`tag_${i}`]}
                <p id="tag-error-{i}" class="field-error" role="alert">{errors[`tag_${i}`]}</p>
              {/if}
            {/each}
            <button type="button" class="add-btn" onclick={addTag}>+ Add Tag</button>
          </div>

          <!-- uploadedAt -->
          <div class="field-group">
            <label for="uploadedAt">Original Upload Date</label>
            <input
              id="uploadedAt"
              type="datetime-local"
              bind:value={uploadedAt}
            />
          </div>
        </section>

        <!-- ---------------------------------------------------------------- -->
        <!-- Global error banner + submit                                      -->
        <!-- ---------------------------------------------------------------- -->
        {#if submitError}
          <div class="error-banner" role="alert">
            <strong>Submission failed:</strong> {submitError}
          </div>
        {/if}

        <div class="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Uploading…' : 'Upload Archive Session'}
          </button>
          <button type="button" onclick={() => navigate('/')}>Cancel</button>
        </div>

      </form>
    </div>
  </main>
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
    place-items: start center;
    min-height: 100vh;
    padding: 1rem;
  }

  .card {
    width: 100%;
    max-width: 560px;
    padding: 2rem;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  }

  .form-card {
    text-align: left;
    margin: 2rem auto;
  }

  .form-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .form-header h1 {
    margin: 0;
    font-size: 1.4rem;
  }

  .back-btn {
    padding: 0.4rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    color: #374151;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .back-btn:hover { background: #f9fafb; }

  .field-section {
    margin-bottom: 1.5rem;
  }

  .section-heading {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin: 0 0 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .field-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    font-size: 0.9rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.35rem;
  }

  .required {
    color: #dc2626;
  }

  input[type="text"],
  input[type="datetime-local"],
  input[type="file"],
  textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9rem;
    color: #1f2937;
    background: #fff;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  input[type="file"] {
    padding: 0.4rem 0.75rem;
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  textarea {
    resize: vertical;
    font-family: inherit;
  }

  .list-row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
    align-items: center;
  }

  .list-row input {
    flex: 1;
    margin-bottom: 0;
  }

  .remove-btn {
    padding: 0.4rem 0.65rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    color: #6b7280;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }

  .remove-btn:hover {
    background: #fee2e2;
    color: #dc2626;
    border-color: #fca5a5;
  }

  .add-btn {
    padding: 0.4rem 0.75rem;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    background: #f9fafb;
    color: #6b7280;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 0.25rem;
  }

  .add-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .field-error {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: #dc2626;
  }

  .error-banner {
    padding: 0.75rem 1rem;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    background: #fef2f2;
    color: #dc2626;
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  button[type="submit"] {
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 8px;
    background: #6366f1;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  button[type="submit"]:hover:not(:disabled) {
    background: #4f46e5;
  }

  button[type="submit"]:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  button[type="button"] {
    padding: 0.6rem 1.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    color: #374151;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  button[type="button"]:hover {
    background: #f9fafb;
  }

  /* Success panel */
  .success-label {
    color: #6b7280;
    margin: 0 0 0.5rem;
  }

  .success-uri {
    word-break: break-all;
    margin: 0 0 1.5rem;
    font-size: 0.85rem;
    color: #374151;
  }

  .button-row {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }

  code {
    font-family: ui-monospace, monospace;
  }
</style>
