<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MediaQuery } from 'svelte/reactivity';
	import CardList from '#lib/components/CardList.svelte';
	import ChangesSummary from '#lib/components/ChangesSummary.svelte';
	import DataTable from '#lib/components/DataTable.svelte';
	import Discussion from '#lib/components/Discussion.svelte';
	import FacetPanel from '#lib/components/FacetPanel.svelte';
	import FilterChips from '#lib/components/FilterChips.svelte';
	import RowDetail from '#lib/components/RowDetail.svelte';
	import RowProposals from '#lib/components/RowProposals.svelte';
	import SearchBar from '#lib/components/SearchBar.svelte';
	import { formatLocalDate, parseCompletionTime } from '#lib/data/dates.ts';
	import { applyFilters, buildFacets, DEFAULT_FILTERS, type Filters } from '#lib/search/facets.ts';
	import { matchQuery, parseQuery, rankResults } from '#lib/search/search.ts';
	import { sortResults } from '#lib/search/sort.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { readPref, writePref } from '#lib/state/prefs.ts';
	import { parseViewState, viewStateToSearch, type ViewState } from '#lib/state/url-state.ts';

	const wide = new MediaQuery('min-width: 900px');
	const ds = $derived(app.ds);
	const view = $derived(parseViewState(page.url.searchParams));

	// Pending proposals per key; the facet appears once they've loaded from GitHub.
	const pending = $derived(new Map([...app.proposalsByKey].map(([k, list]) => [k, list.length])));
	const pendingKeys = $derived(app.proposals ? new Set(app.proposalsByKey.keys()) : null);

	const facets = $derived(ds ? buildFacets(ds, pendingKeys) : []);
	const query = $derived(ds ? parseQuery(view.q, ds) : null);
	const needles = $derived(query ? query.terms.filter((t) => !t.negate).map((t) => t.text) : []);
	const textMask = $derived(ds && query ? matchQuery(ds, query) : null);
	const filtered = $derived(ds ? applyFilters(ds, facets, textMask, view.filters) : null);
	const order = $derived.by(() => {
		if (!ds || !filtered || !query) return new Int32Array(0);
		if (view.sort) return sortResults(ds, filtered.result, view.sort);
		return rankResults(ds, query, filtered.result);
	});
	const selected = $derived(ds && view.key !== null ? ds.keyIndex.get(view.key) : undefined);

	// Columns: show/hide saved per device.
	let hidden = $state(
		readPref<string[]>('hiddenColumns', ['display_name', 'added', 'expired', 'category'])
	);
	const visibleColumns = $derived(ds ? ds.columns.filter((c) => !hidden.includes(c.id)) : []);
	function toggleColumn(id: string) {
		hidden = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
		writePref('hiddenColumns', hidden);
	}

	function navigate(patch: Partial<ViewState>, replace = false) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolve('/')
		goto(`${resolve('/')}${viewStateToSearch({ ...view, ...patch })}`, { replace, reset: false });
	}

	// Search input: debounced into the URL; follows the URL on Back/Forward.
	let qInput = $state(parseViewState(page.url.searchParams).q);
	let lastQ = parseViewState(page.url.searchParams).q;
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const q = qInput;
		if (q === lastQ) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			lastQ = q;
			navigate({ q }, true);
		}, 75);
	});
	$effect(() => {
		const q = view.q;
		if (q !== lastQ) qInput = lastQ = q;
	});

	function toggleFilter(facet: string, value: string) {
		const cur = view.filters[facet] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		navigate({ filters: { ...view.filters, [facet]: next } });
	}

	function resetFilters() {
		navigate({ filters: { ...DEFAULT_FILTERS } });
	}

	function showChanges(kind: 'added' | 'expired') {
		const at = ds?.bundle.lastSync?.at;
		if (!at) return;
		const filters: Filters =
			kind === 'added'
				? { status: ['active'], added: [at] }
				: { status: ['expired'], expired: [at] };
		navigate({ filters });
	}

	function sortBy(column: string) {
		const s = view.sort;
		navigate({
			sort: s?.column !== column ? { column, desc: false } : s.desc ? null : { column, desc: true }
		});
	}

	// Keyboard: / focuses search, ↑/↓ move, Enter opens, Esc closes (PLAN §4.4).
	let active = $state(0);
	// The active-row highlight only appears once the keyboard is used.
	let keyboard = $state(false);
	let searchInput: HTMLInputElement | undefined = $state();
	let table: DataTable | undefined = $state();
	let cards: CardList | undefined = $state();
	const scrollTo = (pos: number) => (wide.current ? table : cards)?.scrollToIndex(pos);

	$effect(() => {
		void order;
		active = 0;
		(wide.current ? table : cards)?.scrollToTop();
	});

	function open(row: number, pos: number) {
		active = pos;
		navigate({ key: ds!.keys[row] });
	}

	function close() {
		navigate({ key: null });
	}

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		const typing =
			t.tagName === 'TEXTAREA' ||
			t.tagName === 'SELECT' ||
			t.isContentEditable ||
			(t.tagName === 'INPUT' && t !== searchInput);
		if (e.key === '/' && !typing && t !== searchInput) {
			e.preventDefault();
			searchInput?.focus();
			searchInput?.select();
		} else if (e.key === 'Escape' && view.key !== null) {
			e.preventDefault();
			close();
		} else if (typing || view.key !== null || order.length === 0) {
			return;
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			keyboard = true;
			active = Math.max(0, Math.min(order.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
			scrollTo(active);
		} else if (e.key === 'Enter' && (t === searchInput || t === document.body)) {
			e.preventDefault();
			open(order[active], active);
		}
	}

	let filtersOpen = $state(false);
	const exportedAt = $derived(
		ds?.bundle.exportedAt ? parseCompletionTime(ds.bundle.exportedAt) : null
	);
	const activeFilterCount = $derived(
		Object.entries(view.filters).reduce(
			(n, [k, v]) => n + (k === 'status' && v.length === 1 && v[0] === 'active' ? 0 : v.length),
			0
		)
	);
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>{view.key !== null ? `${view.key} · ` : ''}eCW Item Keys</title>
</svelte:head>

{#if app.error}
	<div class="page"><p class="error">Could not load data: {app.error}</p></div>
{:else if !ds || !filtered}
	<div class="page"><p class="loading" aria-live="polite">Loading item keys…</p></div>
{:else}
	<div class="browser">
		<aside class="sidebar" class:open={filtersOpen} aria-label="Filters">
			<div class="sidebar-head">
				<h2>Filters</h2>
				<button class="btn close-filters" onclick={() => (filtersOpen = false)}>Done</button>
			</div>
			<FacetPanel
				{facets}
				counts={filtered.counts}
				filters={view.filters}
				ontoggle={toggleFilter}
			/>
		</aside>

		<section class="results" aria-label="Results">
			<h1 class="sr-only">eCW item keys</h1>
			<div class="toolbar">
				<SearchBar bind:value={qInput} bind:input={searchInput} />
				<button class="btn filters-btn" onclick={() => (filtersOpen = true)}>
					Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
				</button>
				{#if wide.current}
					<details class="columns">
						<summary class="btn">Columns</summary>
						<div class="menu">
							{#each ds.columns.filter((c) => c.type !== 'key') as c (c.id)}
								<label>
									<input
										type="checkbox"
										checked={!hidden.includes(c.id)}
										onchange={() => toggleColumn(c.id)}
									/>
									{c.label}
								</label>
							{/each}
						</div>
					</details>
				{/if}
			</div>
			<ChangesSummary lastSync={ds.bundle.lastSync} onshow={showChanges} />
			<div class="meta">
				<span aria-live="polite"
					><strong>{order.length.toLocaleString()}</strong> of {ds.n.toLocaleString()} keys</span
				>
				{#if exportedAt}<span class="exported" title={ds.bundle.exportedAt}
						>· Data exported {formatLocalDate(exportedAt)}</span
					>{/if}
				<FilterChips
					{facets}
					filters={view.filters}
					ontoggle={toggleFilter}
					onreset={resetFilters}
				/>
			</div>
			<div class="list">
				{#if order.length === 0}
					<p class="empty">
						No item keys match. Try fewer terms or <button class="link" onclick={resetFilters}
							>reset filters</button
						>.
					</p>
				{:else if wide.current}
					<DataTable
						bind:this={table}
						{ds}
						{order}
						columns={visibleColumns}
						sort={view.sort}
						active={keyboard ? active : -1}
						{selected}
						{needles}
						{pending}
						onsort={sortBy}
						onopen={open}
					/>
				{:else}
					<CardList
						bind:this={cards}
						{ds}
						{order}
						active={keyboard ? active : -1}
						{selected}
						{needles}
						{pending}
						onopen={open}
					/>
				{/if}
			</div>
		</section>
	</div>

	{#if view.key !== null}
		{#if selected !== undefined}
			<RowDetail {ds} i={selected} {needles} pending={pending.get(view.key) ?? 0} onclose={close}>
				{#key view.key}
					<RowProposals {ds} i={selected} proposals={app.proposalsByKey.get(view.key) ?? []} />
					<Discussion key={view.key} count={ds.discussions[selected]} />
				{/key}
			</RowDetail>
		{:else}
			<div class="notfound" role="alert">
				No item key {JSON.stringify(view.key)}.
				<button class="btn" onclick={close}>Close</button>
			</div>
		{/if}
	{/if}
{/if}

<style>
	.browser {
		display: flex;
		height: 100%;
	}
	.sidebar {
		width: 250px;
		flex: none;
		overflow: auto;
		padding: 0.75rem 0.9rem 2rem;
		border-right: 1px solid var(--border);
	}
	.sidebar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.sidebar h2 {
		font-size: 14px;
		margin: 0;
	}
	.close-filters,
	.filters-btn {
		display: none;
	}
	.results {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 0.75rem 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.columns {
		position: relative;
	}
	.columns summary {
		list-style: none;
	}
	.columns summary::-webkit-details-marker {
		display: none;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		white-space: nowrap;
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		color: var(--fg-muted);
		font-size: 13px;
	}
	.meta strong {
		color: var(--fg);
	}
	.list {
		flex: 1;
		min-height: 0;
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: var(--radius) var(--radius) 0 0;
		overflow: hidden;
	}
	.empty,
	.loading,
	.error {
		padding: 1.5rem;
		color: var(--fg-muted);
	}
	.error {
		color: var(--danger);
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		color: var(--accent);
		text-decoration: underline;
	}
	.notfound {
		position: fixed;
		bottom: calc(var(--footer-h) + 1rem);
		left: 50%;
		transform: translateX(-50%);
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.9rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}

	@media (max-width: 899px) {
		.sidebar {
			display: none;
			position: fixed;
			inset: 0 0 var(--footer-h);
			z-index: 25;
			width: auto;
			background: var(--bg);
			border: 0;
			padding-top: max(0.75rem, env(safe-area-inset-top));
		}
		.sidebar.open {
			display: block;
		}
		.close-filters,
		.filters-btn {
			display: inline-flex;
		}
		.results {
			padding: 0.5rem 0 0;
		}
		.toolbar,
		.meta,
		.results > :global(.changes) {
			margin: 0 0.6rem;
		}
		.list {
			border: 0;
			border-top: 1px solid var(--border);
			border-radius: 0;
		}
	}
</style>
