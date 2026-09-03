<script lang="ts">
  import { t } from '$lib/i18n';

  type Props = {
    disabled?: boolean;
    placeholder?: string;
    onsubmit: (value: string, atMs: number) => void;
  };

  const { disabled = false, placeholder = '', onsubmit }: Props = $props();

  let value = $state('');
  let field = $state<HTMLInputElement | null>(null);

  export function focus() {
    field?.focus();
  }

  function submit(atMs: number) {
    const text = value.trim();
    if (text === '') return;
    onsubmit(text, atMs);
    value = '';
  }
</script>

<form
  class="text-input"
  onsubmit={(e) => {
    const at = performance.now();
    e.preventDefault();
    submit(at);
  }}
>
  <!--
    autocapitalize/autocomplete/autocorrect/spellcheck sind Pflicht (§7.2),
    sonst schlägt die Autokorrektur bei Anagrammen zu.
  -->
  <input
    bind:this={field}
    bind:value
    type="text"
    inputmode="text"
    autocapitalize="off"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    enterkeyhint="done"
    {placeholder}
    {disabled}
  />
  <button type="submit" {disabled}>{t('input.text.submit')}</button>
</form>

<style>
  .text-input {
    display: flex;
    gap: var(--space-2);
    width: 100%;
    max-width: 28rem;
  }

  input {
    flex: 1 1 auto;
    /*
     * Ohne `min-width: 0` schrumpft ein Flex-Element nie unter seine
     * intrinsische Breite – und ein <input> bringt rund 20 Zeichen mit.
     * Auf schmalen Schirmen wurde der Bestätigen-Knopf dadurch rechts aus
     * dem Bild gedrückt und die ganze Seite breiter als der Viewport.
     */
    min-width: 0;
    min-height: var(--hit-min);
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-stimulus);
    /* Unter 16px zoomt iOS beim Fokussieren automatisch hinein. */
    font-size: var(--text-lg);
    letter-spacing: 0.05em;
    touch-action: manipulation;
  }

  button {
    flex: 0 0 auto;
    min-height: var(--hit-min);
    padding: 0 var(--space-4);
    background: var(--color-accent);
    color: var(--color-accent-text);
    border: none;
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
