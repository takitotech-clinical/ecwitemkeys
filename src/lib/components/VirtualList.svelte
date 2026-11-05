<!--
	Fixed-row-height virtualizer: only visible rows plus overscan are in the DOM (PLAN §4.4).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		count: number;
		rowHeight: number;
		overscan?: number;
		/** Rendered inside the scroll container above the rows (e.g. a sticky header). */
		header?: Snippet;
		row: Snippet<[number]>;
		/** Minimum content width, for horizontally scrolling tables. */
		minWidth?: string;
	}

	let { count, rowHeight, overscan = 6, header, row, minWidth = '0', ...rest }: Props = $props();

	let viewport: HTMLDivElement | undefined = $state();
	let scrollTop = $state(0);
	let height = $state(600);
	let headerHeight = $state(0);

	const start = $derived(
		Math.max(0, Math.floor((scrollTop - headerHeight) / rowHeight) - overscan)
	);
	const end = $derived(
		Math.min(count, Math.ceil((scrollTop - headerHeight + height) / rowHeight) + overscan)
	);
	const visible = $derived(Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i));

	/** Scrolls the minimum amount needed to show row `i`. */
	export function scrollToIndex(i: number) {
		if (!viewport) return;
		const top = headerHeight + i * rowHeight;
		const viewTop = viewport.scrollTop + headerHeight;
		if (top < viewTop) viewport.scrollTop = top - headerHeight;
		else if (top + rowHeight > viewport.scrollTop + height) {
			viewport.scrollTop = top + rowHeight - height;
		}
	}

	export function scrollToTop() {
		if (viewport) viewport.scrollTop = 0;
	}
</script>

<div
	class="viewport"
	bind:this={viewport}
	bind:clientHeight={height}
	onscroll={() => (scrollTop = viewport!.scrollTop)}
	{...rest}
>
	<div class="content" style:min-width={minWidth}>
		{#if header}
			<div class="header" bind:clientHeight={headerHeight}>{@render header()}</div>
		{/if}
		<div class="rows" style:height="{count * rowHeight}px">
			{#each visible as i (i)}
				<div
					class="row"
					style:transform="translateY({i * rowHeight}px)"
					style:height="{rowHeight}px"
				>
					{@render row(i)}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.viewport {
		position: relative;
		overflow: auto;
		height: 100%;
		overscroll-behavior: contain;
	}
	.header {
		position: sticky;
		top: 0;
		z-index: 2;
	}
	.rows {
		position: relative;
	}
	.row {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		contain: layout style;
	}
</style>
