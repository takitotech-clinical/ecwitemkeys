<!-- Data diagnostics and the latest sync (PLAN §3.3 step 4). -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Dataset } from '#lib/data/model.ts';
	import { formatLocalDateTime, parseCompletionTime } from '#lib/data/dates.ts';
	import Timestamp from './Timestamp.svelte';

	let { ds }: { ds: Dataset } = $props();

	const b = $derived(ds.bundle);
	const d = $derived(b.diagnostics);
	const expiredCount = $derived(ds.expired.reduce((n, v) => n + v, 0));
	const exported = $derived(b.exportedAt ? parseCompletionTime(b.exportedAt) : null);
	const outOfSync = $derived(
		d.syncState.missingActiveRow.length + d.syncState.activeNotInItemkeys.length
	);
</script>

<h1>Data health</h1>

<section>
	<table class="stats">
		<tbody>
			<tr><th>Total keys</th><td>{ds.n.toLocaleString()}</td></tr>
			<tr><th>Active</th><td>{(ds.n - expiredCount).toLocaleString()}</td></tr>
			<tr><th>Expired</th><td>{expiredCount.toLocaleString()}</td></tr>
			<tr
				><th>Data exported</th><td
					>{exported ? formatLocalDateTime(exported) : 'unknown'}
					{#if b.exportedAt}<span class="muted mono">({b.exportedAt})</span>{/if}</td
				></tr
			>
			<tr><th>Site built</th><td><Timestamp value={b.generatedAt} full /></td></tr>
			<tr><th>Keys with discussion</th><td>{Object.keys(b.discussions).length}</td></tr>
		</tbody>
	</table>
</section>

<section>
	<h2>Latest sync</h2>
	{#if b.lastSync}
		<p><Timestamp value={b.lastSync.at} full /></p>
		{#each [['Added', b.lastSync.added], ['Expired', b.lastSync.expired]] as const as [title, keys] (title)}
			<details open={keys.length > 0 && keys.length <= 20}>
				<summary>{title} ({keys.length})</summary>
				<ul class="keys">
					{#each keys as k (k)}<li>
							<a class="mono" href="{resolve('/')}?status=all&key={encodeURIComponent(k)}"
								>{JSON.stringify(k)}</a
							>
						</li>{/each}
				</ul>
			</details>
		{/each}
		{#if b.lastSync.possibleRenames.length > 0}
			<h3>Possible renames</h3>
			<ul class="keys">
				{#each b.lastSync.possibleRenames as [a, e] (a + e)}
					<li class="mono">{JSON.stringify(e)} → {JSON.stringify(a)}</li>
				{/each}
			</ul>
		{/if}
		<p class="muted">Returned keys are listed in the sync commit and its job summary on GitHub.</p>
	{:else}
		<p class="muted">No keys have been added or expired since the initial import.</p>
	{/if}
</section>

<section>
	<h2>Diagnostics</h2>
	<ul class="diag">
		<li class:bad={outOfSync > 0}>
			Sync state: {outOfSync === 0
				? 'additional.rpt matches itemkeys.rpt'
				: `${outOfSync} keys out of sync — run pnpm data:sync`}
		</li>
		<li class:bad={d.collisions.length > 0}>
			Case or whitespace collisions: {d.collisions.length}
			{#each d.collisions as g (g.join())}<div class="mono">
					{g.map((k) => JSON.stringify(k)).join(', ')}
				</div>{/each}
		</li>
		<li class:warn={d.expiredWithoutLastKnown.length > 0}>
			Expired keys without last-known values: {d.expiredWithoutLastKnown.length}
		</li>
	</ul>
	{#each [['Keys with surrounding whitespace', d.whitespaceKeys.map( (k) => ({ key: k, column: 'key' }) )], ['Values with surrounding whitespace', d.whitespaceValues], ['Multi-line values', d.multilineValues]] as const as [title, refs] (title)}
		<details>
			<summary>{title} ({refs.length})</summary>
			<ul class="keys">
				{#each refs as r (r.key + r.column)}
					<li>
						<a class="mono" href="{resolve('/')}?status=all&key={encodeURIComponent(r.key)}"
							>{JSON.stringify(r.key)}</a
						>
						<span class="muted">{r.column}</span>
					</li>
				{/each}
			</ul>
		</details>
	{/each}
</section>

<style>
	.stats th {
		text-align: left;
		font-weight: 500;
		color: var(--fg-muted);
		padding: 0.2rem 1.5rem 0.2rem 0;
	}
	.muted {
		color: var(--fg-muted);
	}
	.keys {
		max-height: 18rem;
		overflow: auto;
		padding-left: 1.2rem;
	}
	.diag li {
		margin: 0.3rem 0;
	}
	.bad {
		color: var(--danger);
	}
	.warn {
		color: var(--warn);
	}
	details {
		margin: 0.4rem 0;
	}
	summary {
		cursor: pointer;
	}
</style>
