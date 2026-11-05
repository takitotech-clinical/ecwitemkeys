<!-- "Latest export: +12 new, 3 expired" — clicking applies the matching filter (PLAN §4.4). -->
<script lang="ts">
	import type { LastSync } from '#lib/data/join.ts';
	import { formatLocalDate } from '#lib/data/dates.ts';
	import { readPref, writePref } from '#lib/state/prefs.ts';

	let {
		lastSync,
		onshow
	}: { lastSync: LastSync | null; onshow: (kind: 'added' | 'expired') => void } = $props();

	let dismissed = $state(readPref<string | null>('dismissedSync', null));
	const visible = $derived(
		lastSync !== null &&
			dismissed !== lastSync.at &&
			lastSync.added.length + lastSync.expired.length > 0
	);
</script>

{#if visible && lastSync}
	<div class="changes" role="status">
		<span>Latest export ({formatLocalDate(lastSync.at)}):</span>
		{#if lastSync.added.length > 0}
			<button class="link" onclick={() => onshow('added')}>+{lastSync.added.length} new</button>
		{/if}
		{#if lastSync.expired.length > 0}
			<button class="link" onclick={() => onshow('expired')}
				>{lastSync.expired.length} expired</button
			>
		{/if}
		{#if lastSync.possibleRenames.length > 0}
			<span class="muted">({lastSync.possibleRenames.length} possible renames)</span>
		{/if}
		<button
			class="close"
			aria-label="Dismiss"
			onclick={() => {
				dismissed = lastSync.at;
				writePref('dismissedSync', lastSync.at);
			}}>×</button
		>
	</div>
{/if}

<style>
	.changes {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-soft);
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		color: var(--accent);
		font-weight: 600;
	}
	.muted {
		color: var(--fg-muted);
	}
	.close {
		margin-left: auto;
		border: 0;
		background: none;
		font-size: 18px;
		line-height: 1;
		color: var(--fg-muted);
	}
</style>
