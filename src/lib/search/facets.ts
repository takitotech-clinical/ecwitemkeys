/**
 * Facets (PLAN §4.3). Values within one facet are ORed, different facets are ANDed, and each
 * facet's counts are computed against all the other active filters.
 */
import { formatLocalDate, formatLocalTime, localDayKey } from '../data/dates.ts';
import type { Dataset } from '../data/model.ts';

/** URL token for "empty / not set". */
export const EMPTY = '~';

export interface FacetValue {
	/** URL token. */
	value: string;
	label: string;
}

export interface Facet {
	id: string;
	label: string;
	values: FacetValue[];
	/** Per row: index into `values`. */
	codes: Int32Array;
}

export type Filters = Record<string, string[]>;

/** The Status facet defaults to Active when the URL doesn't say otherwise. */
export const DEFAULT_FILTERS: Filters = { status: ['active'] };

function facetFrom(
	id: string,
	label: string,
	values: FacetValue[],
	ds: Dataset,
	code: (i: number) => number
): Facet {
	const codes = new Int32Array(ds.n);
	for (let i = 0; i < ds.n; i++) codes[i] = code(i);
	return { id, label, values, codes };
}

const YES_NO: FacetValue[] = [
	{ value: 'yes', label: 'Yes' },
	{ value: 'no', label: 'No' }
];

/** Distinct timestamps newest first, labeled with the local date (and time when ambiguous). */
function timestampValues(stamps: string[]): FacetValue[] {
	const distinct = [...new Set(stamps.filter(Boolean))].sort().reverse();
	const perDay = new Map<string, number>();
	for (const s of distinct) perDay.set(localDayKey(s), (perDay.get(localDayKey(s)) ?? 0) + 1);
	return distinct.map((s) => ({
		value: s,
		label:
			perDay.get(localDayKey(s))! > 1
				? `${formatLocalDate(s)}, ${formatLocalTime(s)}`
				: formatLocalDate(s)
	}));
}

export function buildFacets(ds: Dataset, pending: Set<string> | null): Facet[] {
	const facets: Facet[] = [];
	const col = (id: string) => ds.byId.get(id)!;
	facets.push(
		facetFrom(
			'status',
			'Status',
			[
				{ value: 'active', label: 'Active' },
				{ value: 'expired', label: 'Expired' }
			],
			ds,
			(i) => ds.expired[i]
		)
	);
	for (const id of ['added', 'expired']) {
		const c = col(id);
		const values = timestampValues(ds.rows.map((r) => r[c.index] ?? ''));
		const pos = new Map(values.map((v, i) => [v.value, i]));
		if (id === 'expired') values.push({ value: EMPTY, label: 'Not expired' });
		facets.push(
			facetFrom(
				id,
				c.label,
				values,
				ds,
				(i) => pos.get(ds.rows[i][c.index] ?? '') ?? values.length - 1
			)
		);
	}
	for (const c of ds.columns) {
		if (c.source !== 'additional' || c.type === 'timestamp') continue;
		if (c.type === 'enum' && c.facet) {
			const vals = c.def?.values ?? [];
			const values = [
				...vals.map((v) => ({ value: v, label: v })),
				{ value: EMPTY, label: '(not set)' }
			];
			const pos = new Map(vals.map((v, i) => [v, i]));
			facets.push(
				facetFrom(
					c.id,
					c.label,
					values,
					ds,
					(i) => pos.get(ds.rows[i][c.index] ?? '') ?? vals.length
				)
			);
		} else if (c.type === 'text' || c.type === 'date') {
			facets.push(
				facetFrom(`has_${c.id}`, `Has ${c.label.toLowerCase()}`, YES_NO, ds, (i) =>
					ds.rows[i][c.index] ? 0 : 1
				)
			);
		}
	}
	const display = col('display_name').index;
	facets.push(
		facetFrom(
			'display',
			'Display name',
			[
				{ value: 'set', label: 'Set' },
				{ value: 'empty', label: 'Empty' },
				{ value: 'null', label: 'NULL' }
			],
			ds,
			(i) => {
				const v = ds.rows[i][display];
				return v === null ? 2 : v === '' ? 1 : 0;
			}
		)
	);
	const remarks = col('ecw_remarks').index;
	facets.push(
		facetFrom(
			'remarks',
			'ecw remarks',
			[
				{ value: 'set', label: 'Set' },
				{ value: 'empty', label: 'Empty' }
			],
			ds,
			(i) => (ds.rows[i][remarks] ? 0 : 1)
		)
	);
	facets.push(
		facetFrom('discussion', 'Has discussion', YES_NO, ds, (i) => (ds.discussions[i] > 0 ? 0 : 1))
	);
	if (pending) {
		facets.push(
			facetFrom('pending', 'Has pending proposal', YES_NO, ds, (i) =>
				pending.has(ds.keys[i]) ? 0 : 1
			)
		);
	}
	return facets;
}

export interface FilterResult {
	/** Matching row indices in file order. */
	result: Int32Array;
	/** Per facet id: count per value, against all other active filters. */
	counts: Map<string, Int32Array>;
}

/** Applies filters in one pass over the rows matching the text query (`textMask` null = all). */
export function applyFilters(
	ds: Dataset,
	facets: Facet[],
	textMask: Uint8Array | null,
	filters: Filters
): FilterResult {
	const active: { f: number; allowed: Uint8Array }[] = [];
	facets.forEach((facet, f) => {
		const sel = filters[facet.id];
		if (!sel || sel.length === 0) return;
		// Unknown values (e.g. from a stale URL) select nothing.
		const allowed = new Uint8Array(facet.values.length);
		facet.values.forEach((v, vi) => {
			if (sel.includes(v.value)) allowed[vi] = 1;
		});
		active.push({ f, allowed });
	});
	const counts = facets.map((f) => new Int32Array(f.values.length));
	const codes = facets.map((f) => f.codes);
	const out = new Int32Array(ds.n);
	let len = 0;
	for (let i = 0; i < ds.n; i++) {
		if (textMask && !textMask[i]) continue;
		let failed = -1;
		let fails = 0;
		for (const a of active) {
			if (!a.allowed[codes[a.f][i]]) {
				failed = a.f;
				if (++fails > 1) break;
			}
		}
		if (fails === 0) {
			out[len++] = i;
			for (let f = 0; f < codes.length; f++) counts[f][codes[f][i]]++;
		} else if (fails === 1) {
			counts[failed][codes[failed][i]]++;
		}
	}
	return {
		result: out.slice(0, len),
		counts: new Map(facets.map((f, fi) => [f.id, counts[fi]]))
	};
}
