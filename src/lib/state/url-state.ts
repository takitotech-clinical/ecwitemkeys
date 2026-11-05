/**
 * Query, filters, sort and the selected key live in the query string (PLAN §4.4), e.g.
 * `?q=hpi&status=active&category=system&key=HPI`. Multiple facet values are comma-separated.
 */
import { DEFAULT_FILTERS, type Filters } from '../search/facets.ts';
import type { Sort } from '../search/sort.ts';

export interface ViewState {
	q: string;
	filters: Filters;
	sort: Sort | null;
	key: string | null;
}

const RESERVED = new Set(['q', 'sort', 'key']);

export function parseViewState(sp: Pick<URLSearchParams, 'get' | 'has' | 'entries'>): ViewState {
	const filters: Filters = { ...DEFAULT_FILTERS };
	for (const [name, value] of sp.entries()) {
		if (RESERVED.has(name)) continue;
		filters[name] =
			name === 'status' && value === 'all' ? [] : value.split(',').filter((v) => v !== '');
	}
	const s = sp.get('sort');
	return {
		q: sp.get('q') ?? '',
		filters,
		sort: s ? { column: s.replace(/^-/, ''), desc: s.startsWith('-') } : null,
		key: sp.has('key') ? sp.get('key') : null
	};
}

export function viewStateToSearch(s: ViewState): string {
	const sp = new URLSearchParams();
	if (s.q) sp.set('q', s.q);
	for (const [name, values] of Object.entries(s.filters)) {
		if (name === 'status') {
			const isDefault = values.length === 1 && values[0] === DEFAULT_FILTERS.status[0];
			if (!isDefault) sp.set('status', values.length === 0 ? 'all' : values.join(','));
		} else if (values.length > 0) sp.set(name, values.join(','));
	}
	if (s.sort) sp.set('sort', (s.sort.desc ? '-' : '') + s.sort.column);
	if (s.key !== null) sp.set('key', s.key);
	const str = sp.toString();
	return str ? `?${str}` : '?';
}
