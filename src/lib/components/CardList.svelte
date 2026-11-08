<!-- Mobile layout (< 900 px): one card per row (PLAN §4.4). -->
<script lang="ts">
	import type { Dataset } from '#lib/data/model.ts';
	import { resolve } from '$app/paths';
	import Badges from './Badges.svelte';
	import Value from './Value.svelte';
	import VirtualList from './VirtualList.svelte';

	let {
		ds,
		order,
		active,
		selected,
		needles,
		pending,
		hidden,
		onopen
	}: {
		ds: Dataset;
		order: Int32Array;
		active: number;
		selected: number | undefined;
		needles: string[];
		pending: Map<string, number>;
		/** Column ids hidden with the Columns menu (shared with the table). */
		hidden: string[];
		onopen: (row: number, pos: number) => void;
	} = $props();

	const ROW = 124;
	const iDisplay = $derived(ds.byId.get('display_name')!.index);
	const iRemarks = $derived(ds.byId.get('ecw_remarks')!.index);
	const enums = $derived(ds.columns.filter((c) => c.type === 'enum' && !hidden.includes(c.id)));
	const showDisplay = $derived(!hidden.includes('display_name'));
	const showRemarks = $derived(!hidden.includes('ecw_remarks'));

	let list: VirtualList | undefined = $state();
	export const scrollToIndex = (i: number) => list?.scrollToIndex(i);
	export const scrollToTop = () => list?.scrollToTop();
</script>

<VirtualList
	bind:this={list}
	count={order.length}
	rowHeight={ROW}
	role="list"
	aria-label="Item keys"
>
	{#snippet row(pos)}
		{@const i = order[pos]}
		<div role="listitem" class="wrap">
			<a
				class="card"
				class:active={pos === active}
				class:selected={i === selected}
				class:expired={ds.expired[i]}
				href="{resolve('/')}?key={encodeURIComponent(ds.keys[i])}"
				onclick={(e) => {
					e.preventDefault();
					onopen(i, pos);
				}}
			>
				<div class="top">
					<span class="key mono"><Value value={ds.keys[i]} {needles} /></span>
					{#each enums as c (c.id)}
						{#if ds.rows[i][c.index]}<span class="chip">{ds.rows[i][c.index]}</span>{/if}
					{/each}
				</div>
				{#if showDisplay}
					<div class="display"><Value value={ds.rows[i][iDisplay]} {needles} /></div>
				{/if}
				{#if showRemarks}
					<div class="remarks" class:lastknown={ds.lastKnown[i]} class:tall={!showDisplay}>
						<Value value={ds.rows[i][iRemarks]} {needles} />
					</div>
				{/if}
				<div class="badges"><Badges {ds} {i} pending={pending.get(ds.keys[i]) ?? 0} /></div>
			</a>
		</div>
	{/snippet}
</VirtualList>

<style>
	.wrap {
		height: 100%;
		padding: 4px 10px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 2px;
		height: 100%;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: inherit;
		text-decoration: none;
		overflow: hidden;
	}
	.card.active,
	.card.selected {
		border-color: var(--accent);
	}
	.card.expired {
		color: var(--fg-muted);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.key {
		font-weight: 600;
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
	.display {
		color: var(--fg-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 13px;
	}
	.remarks {
		white-space: pre-line;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	/* Remarks take the display name's line when it is hidden. */
	.remarks.tall {
		-webkit-line-clamp: 3;
		line-clamp: 3;
	}
	.lastknown {
		font-style: italic;
	}
	.badges {
		display: flex;
		gap: 0.25rem;
		margin-top: auto;
	}
</style>
