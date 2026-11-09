<script lang="ts">
	import type { Facet, Filters } from '#lib/search/facets.ts';

	let {
		facets,
		counts,
		filters,
		ontoggle
	}: {
		facets: Facet[];
		counts: Map<string, Int32Array>;
		filters: Filters;
		ontoggle: (facet: string, value: string) => void;
	} = $props();

	const LIMIT = 6;
	let expanded = $state<Record<string, boolean>>({});
</script>

<div class="facets">
	{#each facets as f (f.id)}
		{@const c = counts.get(f.id)}
		{@const sel = filters[f.id] ?? []}
		{@const shown = expanded[f.id] ? f.values : f.values.slice(0, LIMIT)}
		<fieldset>
			<legend>{f.label}</legend>
			{#each shown as v, vi (v.value)}
				{@const n = c?.[vi] ?? 0}
				<label class:zero={n === 0 && !sel.includes(v.value)}>
					<input
						type="checkbox"
						checked={sel.includes(v.value)}
						onchange={() => ontoggle(f.id, v.value)}
					/>
					<span class="label" title={v.label}>{v.label}</span>
					<span class="count">{n.toLocaleString()}</span>
				</label>
			{/each}
			{#if f.values.length > LIMIT}
				<button class="more" onclick={() => (expanded[f.id] = !expanded[f.id])}>
					{expanded[f.id] ? 'Show fewer' : `Show all ${f.values.length}`}
				</button>
			{/if}
		</fieldset>
	{/each}
</div>

<style>
	.facets {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		/* Fieldsets default to min-content width, which would let long labels widen the sidebar. */
		min-width: 0;
	}
	legend {
		font-weight: 600;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-muted);
		margin-bottom: 0.25rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.12rem 0.25rem;
		border-radius: 4px;
		cursor: pointer;
	}
	label:hover {
		background: var(--bg-hover);
	}
	label.zero {
		color: var(--fg-faint);
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-variant-numeric: tabular-nums;
		color: var(--fg-muted);
		font-size: 12px;
	}
	.more {
		border: 0;
		background: none;
		color: var(--accent);
		padding: 0.2rem 0.25rem;
		font-size: 13px;
	}
</style>
