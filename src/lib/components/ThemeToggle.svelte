<!--
	Theme switch: cycles System → Light → Dark. The icon shows the current choice.
-->
<script lang="ts">
	import { theme, type ThemeChoice } from '#lib/state/theme.svelte.ts';

	const LABEL: Record<ThemeChoice, string> = {
		system: 'System theme',
		light: 'Light theme',
		dark: 'Dark theme'
	};
</script>

<button
	type="button"
	class="theme"
	onclick={() => theme.set(theme.next)}
	aria-label="{LABEL[theme.choice]}. Switch to {LABEL[theme.next].toLowerCase()}."
	title="{LABEL[theme.choice]} · click for {LABEL[theme.next].toLowerCase()}"
	data-testid="theme-toggle"
	data-choice={theme.choice}
>
	<svg viewBox="0 0 20 20" aria-hidden="true">
		{#if theme.choice === 'light'}
			<circle cx="10" cy="10" r="3.5" />
			<path
				d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"
			/>
		{:else if theme.choice === 'dark'}
			<path d="M15.5 12.3A6.5 6.5 0 0 1 7.7 4.5a6.5 6.5 0 1 0 7.8 7.8Z" />
		{:else}
			<rect x="2.75" y="3.75" width="14.5" height="10" rx="1.75" />
			<path d="M7 17h6M10 13.75V17" />
		{/if}
	</svg>
</button>

<style>
	.theme {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--tint);
		color: var(--fg-muted);
	}
	.theme:hover {
		color: var(--fg);
		background: var(--tint-hover);
	}
	svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
