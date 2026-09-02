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
    flex: 1;
    min-height: var(--hit-min);
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface);
    color: var(--color-text);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-stimulus);
    font-size: var(--text-lg);
    letter-spacing: 0.05em;
    touch-action: manipulation;
  }

  button {
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
