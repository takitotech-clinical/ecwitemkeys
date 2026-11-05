<script lang="ts">
	import type { Facet, Filters } from '#lib/search/facets.ts';

	let {
		facets,
		filters,
		ontoggle,
		onreset
	}: {
		facets: Facet[];
		filters: Filters;
		ontoggle: (facet: string, value: string) => void;
		onreset: () => void;
	} = $props();

	const chips = $derived(
		facets.flatMap((f) =>
			(filters[f.id] ?? []).map((value) => ({
				facet: f.id,
				value,
				text: `${f.label}: ${f.values.find((v) => v.value === value)?.label ?? value}`
			}))
		)
	);
	const isDefault = $derived(
		chips.length === 1 && chips[0].facet === 'status' && chips[0].value === 'active'
	);
</script>

{#if chips.length > 0}
	<ul class="chips" aria-label="Active filters">
		{#each chips as c (c.facet + c.value)}
			<li>
				<button class="chip-btn" onclick={() => ontoggle(c.facet, c.value)}>
					{c.text}<span aria-hidden="true" class="x">×</span><span class="sr-only">(remove)</span>
				</button>
			</li>
		{/each}
		{#if !isDefault}
			<li><button class="reset" onclick={onreset}>Reset filters</button></li>
		{/if}
	</ul>
{/if}

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.chip-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-soft);
		font-size: 12px;
	}
	.chip-btn:hover {
		background: var(--bg-hover);
	}
	.x {
		color: var(--fg-muted);
		font-size: 14px;
		line-height: 1;
	}
	.reset {
		border: 0;
		background: none;
		color: var(--accent);
		font-size: 12px;
	}
</style>
