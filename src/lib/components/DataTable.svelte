<!-- Desktop table (≥ 900 px): sticky header, click-to-sort, 2-line clamps (PLAN §4.4). -->
<script lang="ts">
	import type { Column, Dataset } from '#lib/data/model.ts';
	import type { Sort } from '#lib/search/sort.ts';
	import { resolve } from '$app/paths';
	import Badges from './Badges.svelte';
	import Timestamp from './Timestamp.svelte';
	import Value from './Value.svelte';
	import VirtualList from './VirtualList.svelte';

	let {
		ds,
		order,
		columns,
		sort,
		active,
		selected,
		needles,
		pending,
		onsort,
		onopen
	}: {
		ds: Dataset;
		order: Int32Array;
		columns: Column[];
		sort: Sort | null;
		/** Position (in `order`) of the keyboard-active row. */
		active: number;
		selected: number | undefined;
		needles: string[];
		pending: Map<string, number>;
		onsort: (column: string) => void;
		onopen: (row: number, pos: number) => void;
	} = $props();

	const ROW = 58;
	// [minimum px, flex share]; no share = fixed width. The default columns' minimums fit the
	// results pane at the 900 px breakpoint (~627 px, less a classic scrollbar), so it only
	// scrolls sideways once extra columns are turned on.
	const WIDTHS: Record<string, [number, number?]> = {
		key: [200, 1.3],
		display_name: [140, 1],
		ecw_remarks: [160, 2],
		description: [130, 1.6],
		rank: [110, 0.8],
		category: [96],
		added: [112],
		expired: [112]
	};
	const widths = $derived(columns.map((c) => WIDTHS[c.id] ?? [120, 1]));
	const template = $derived(
		widths.map(([min, fr]) => (fr ? `minmax(${min}px, ${fr}fr)` : `${min}px`)).join(' ')
	);
	const minWidth = $derived(`${widths.reduce((sum, [min]) => sum + min, 0)}px`);

	let list: VirtualList | undefined = $state();
	export const scrollToIndex = (i: number) => list?.scrollToIndex(i);
	export const scrollToTop = () => list?.scrollToTop();

	const ariaSort = (c: Column) =>
		sort?.column === c.id ? (sort.desc ? 'descending' : 'ascending') : undefined;
</script>

<VirtualList
	bind:this={list}
	count={order.length}
	rowHeight={ROW}
	{minWidth}
	role="grid"
	aria-label="Item keys"
	aria-rowcount={order.length + 1}
	aria-colcount={columns.length}
>
	{#snippet header()}
		<div class="tr head" role="row" aria-rowindex={1} style:grid-template-columns={template}>
			{#each columns as c (c.id)}
				<div class="th" role="columnheader" aria-sort={ariaSort(c)}>
					<button onclick={() => onsort(c.id)}>
						{c.label}
						<span class="arrow" aria-hidden="true"
							>{sort?.column === c.id ? (sort.desc ? '▼' : '▲') : ''}</span
						>
					</button>
				</div>
			{/each}
		</div>
	{/snippet}
	{#snippet row(pos)}
		{@const i = order[pos]}
		<!-- Rows are clickable for convenience; the key link and ↑/↓/Enter are the keyboard path. -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="tr"
			class:active={pos === active}
			class:selected={i === selected}
			class:expired={ds.expired[i]}
			role="row"
			aria-rowindex={pos + 2}
			aria-selected={i === selected}
			tabindex="-1"
			style:grid-template-columns={template}
			onclick={() => onopen(i, pos)}
		>
			{#each columns as c (c.id)}
				{@const v = ds.rows[i][c.index]}
				<div class="td {c.type}" role="gridcell">
					{#if c.type === 'key'}
						<div class="key">
							<a
								href="{resolve('/')}?key={encodeURIComponent(ds.keys[i])}"
								class="mono"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									onopen(i, pos);
								}}><Value value={v} {needles} /></a
							>
						</div>
						<div class="badges"><Badges {ds} {i} pending={pending.get(ds.keys[i]) ?? 0} /></div>
					{:else if c.type === 'timestamp'}
						<Timestamp value={v} />
					{:else if c.type === 'enum'}
						{#if v}<span class="chip">{v}</span>{/if}
					{:else}
						<div class="clamp" class:lastknown={c.source === 'itemkeys' && ds.lastKnown[i]}>
							<Value value={v} {needles} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/snippet}
</VirtualList>

<style>
	.tr {
		display: grid;
		height: 100%;
		border-bottom: 1px solid var(--border);
		cursor: pointer;
	}
	.tr:hover {
		background: var(--bg-hover);
	}
	.tr.active {
		box-shadow: inset 3px 0 0 var(--accent);
		background: var(--bg-hover);
	}
	.tr.selected {
		background: var(--bg-active);
	}
	.tr.expired {
		color: var(--fg-muted);
	}
	.head {
		height: auto;
		background: var(--bg-soft);
		cursor: default;
	}
	.head:hover {
		background: var(--bg-soft);
	}
	.th button {
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		padding: 0.5rem 0.6rem;
		font-weight: 600;
		font-size: 12px;
		color: var(--fg-muted);
		white-space: nowrap;
	}
	.arrow {
		font-size: 9px;
	}
	.td {
		padding: 0.4rem 0.6rem;
		overflow: hidden;
		min-width: 0;
	}
	.key {
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.key a {
		color: var(--fg);
		text-decoration: none;
		font-weight: 600;
	}
	.badges {
		display: flex;
		gap: 0.25rem;
		margin-top: 2px;
		overflow: hidden;
	}
	.clamp {
		white-space: pre-line;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.lastknown {
		font-style: italic;
	}
	.timestamp {
		font-variant-numeric: tabular-nums;
		color: var(--fg-muted);
		white-space: nowrap;
	}
</style>
