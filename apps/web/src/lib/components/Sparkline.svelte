<script lang="ts">
  /** Kleiner Score-Verlauf. Rein dekorativ, daher aria-hidden. */
  type Props = { values: number[]; width?: number; height?: number };
  const { values, width = 120, height = 32 }: Props = $props();

  const path = $derived.by(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / span) * height;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  });
</script>

{#if path}
  <svg {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
    <path d={path} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
  </svg>
{/if}

<style>
  svg {
    color: var(--color-accent);
    display: block;
  }
</style>
