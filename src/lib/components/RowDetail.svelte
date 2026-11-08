<!--
	All fields of one row: a side panel on desktop, a full-screen sheet on mobile (PLAN §4.4).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Dataset } from '#lib/data/model.ts';
	import Badges from './Badges.svelte';
	import Timestamp from './Timestamp.svelte';
	import Value from './Value.svelte';

	let {
		ds,
		i,
		needles,
		pending = 0,
		onclose,
		children
	}: {
		ds: Dataset;
		i: number;
		needles: string[];
		pending?: number;
		onclose: () => void;
		/** Extra sections: proposals, discussion. */
		children?: Snippet;
	} = $props();

	const key = $derived(ds.keys[i]);
	const fields = $derived(ds.columns.filter((c) => c.type !== 'key'));
	let copied = $state(false);
	let closeBtn: HTMLButtonElement | undefined = $state();

	$effect(() => {
		void key;
		closeBtn?.focus();
	});

	function whitespaceNote(v: string | null): string | null {
		if (!v) return null;
		const lead = /^\s/.test(v);
		const trail = /\s$/.test(v);
		if (!lead && !trail) return null;
		return `␣ ${[lead && 'leading', trail && 'trailing'].filter(Boolean).join(' and ')} space`;
	}

	async function copyKey() {
		try {
			await navigator.clipboard.writeText(key);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	}
</script>

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<div class="panel" role="dialog" aria-modal="false" aria-labelledby="detail-title">
	<div class="head">
		<h2 id="detail-title" class="mono">{key}</h2>
		<button class="btn" onclick={copyKey} aria-live="polite"
			>{copied ? 'Copied' : 'Copy key'}</button
		>
		<button class="btn close" bind:this={closeBtn} onclick={onclose} aria-label="Close details"
			>✕</button
		>
	</div>
	<div class="badges"><Badges {ds} {i} {pending} /></div>
	{#if whitespaceNote(key)}<p class="ws">{whitespaceNote(key)} in key</p>{/if}

	<dl>
		{#each fields as c (c.id)}
			{@const v = ds.rows[i][c.index]}
			<dt>
				{c.label}
				{#if c.source === 'itemkeys' && ds.lastKnown[i]}<span class="lk">last known</span>{/if}
			</dt>
			<dd class:empty={v === ''}>
				{#if c.type === 'timestamp'}
					{#if v}<Timestamp value={v} full />{:else}<span class="null">—</span>{/if}
				{:else if v === ''}
					<span class="null">(empty)</span>
				{:else}
					<div class="value"><Value value={v} {needles} /></div>
					{#if whitespaceNote(v)}<div class="ws">{whitespaceNote(v)}</div>{/if}
				{/if}
			</dd>
		{/each}
	</dl>

	{@render children?.()}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0 0 var(--footer-h);
		background: var(--backdrop);
		z-index: 20;
	}
	.panel {
		position: fixed;
		z-index: 21;
		top: 0;
		right: 0;
		bottom: var(--footer-h);
		width: min(560px, 100vw);
		background: var(--bg);
		box-shadow: var(--shadow);
		overflow: auto;
		padding: max(1rem, env(safe-area-inset-top)) 1.25rem 2rem;
	}
	@media (max-width: 899px) {
		.backdrop {
			display: none;
		}
		.panel {
			left: 0;
			width: auto;
			box-shadow: none;
		}
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}
	h2 {
		flex: 1;
		margin: 0;
		font-size: 17px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.close {
		padding: 0.35em 0.6em;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0.4rem 0;
	}
	dl {
		margin: 1rem 0;
	}
	dt {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-top: 0.9rem;
	}
	dd {
		margin: 0.15rem 0 0;
	}
	.value {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.lk {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		font-style: italic;
		margin-left: 0.3rem;
	}
	.ws {
		font-size: 12px;
		color: var(--warn);
		margin: 0.15rem 0 0;
	}
</style>
