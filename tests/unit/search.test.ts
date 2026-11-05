import { describe, expect, it } from 'vitest';
import type { ItemsBundle } from '../../src/lib/data/join.ts';
import { buildDataset, type Dataset } from '../../src/lib/data/model.ts';
import { applyFilters, buildFacets, DEFAULT_FILTERS, EMPTY } from '../../src/lib/search/facets.ts';
import { normalize } from '../../src/lib/search/normalize.ts';
import { matchQuery, parseQuery, rankResults } from '../../src/lib/search/search.ts';
import { sortResults } from '../../src/lib/search/sort.ts';
import { parseViewState, viewStateToSearch } from '../../src/lib/state/url-state.ts';
import { schema } from './helpers.ts';

const T0 = '2026-11-04T14:00:00Z';
const T1 = '2026-12-01T15:00:00Z';

export function bundle(rows: (string | null)[][], extra: Partial<ItemsBundle> = {}): ItemsBundle {
	return {
		generatedAt: T1,
		exportedAt: null,
		itemkeysColumns: ['key', 'support_remarks', 'display_name'],
		additionalSchema: schema,
		rows,
		lastKnown: [],
		discussions: {},
		lastSync: null,
		newAt: null,
		diagnostics: {
			collisions: [],
			whitespaceKeys: [],
			whitespaceValues: [],
			multilineValues: [],
			expiredWithoutLastKnown: [],
			syncState: { missingActiveRow: [], activeNotInItemkeys: [] }
		},
		...extra
	};
}

//            key                 remarks                              display   added expired desc  category
const ROWS: (string | null)[][] = [
	['ANSI5010', 'Enable ANSI 5010 claims', null, T0, '', '', ''],
	['HPI', 'HPI category. Do not change', 'HPI', T0, '', 'Progress note HPI', 'system'],
	['HPINotes', 'Notes for the\r\nHPI   section', '', T0, '', '', ''],
	['MIPS_Migrate ', 'enable migration (yes|no)', null, T1, '', '', ''],
	['NotesHPI', 'Something else', 'Café HPI', T0, T1, '', ''],
	['Zeta', 'Résumé settings', 'zeta', T1, '', 'Uses hpi', '']
];

const ds: Dataset = buildDataset(bundle(ROWS, { newAt: T1, discussions: { HPI: 3 } }));
const keysOf = (r: Int32Array) => [...r].map((i) => ds.keys[i]);
const search = (q: string) => {
	const query = parseQuery(q, ds);
	const mask = matchQuery(ds, query);
	return keysOf(Int32Array.from({ length: ds.n }, (_, i) => i).filter((i) => !mask || mask[i]));
};

describe('normalization', () => {
	it('lowercases, strips diacritics and collapses whitespace including line breaks', () => {
		expect(normalize('  Café\r\n  Résumé\tX ')).toBe('cafe resume x');
		expect(normalize(null)).toBe('');
	});
});

describe('search', () => {
	it('ANDs terms', () => {
		expect(search('hpi notes')).toEqual(['HPINotes', 'NotesHPI']);
	});
	it('matches phrases across line breaks and padding', () => {
		expect(search('"the hpi section"')).toEqual(['HPINotes']);
	});
	it('excludes negated terms', () => {
		expect(search('hpi -notes')).toEqual(['HPI', 'Zeta']);
	});
	it('restricts column-scoped terms', () => {
		expect(search('key:hpi')).toEqual(['HPI', 'HPINotes', 'NotesHPI']);
		expect(search('display:hpi')).toEqual(['HPI', 'NotesHPI']);
		expect(search('description:hpi')).toEqual(['HPI', 'Zeta']);
		expect(search('remarks:"yes|no"')).toEqual(['MIPS_Migrate ']);
	});
	it('ignores diacritics and treats unknown prefixes as text', () => {
		expect(search('cafe')).toEqual(['NotesHPI']);
		expect(search('resume')).toEqual(['Zeta']);
		expect(search('foo:bar')).toEqual([]);
	});
	it('ranks exact key > key prefix > key contains > display name > other', () => {
		const query = parseQuery('hpi', ds);
		const mask = matchQuery(ds, query)!;
		const result = Int32Array.from({ length: ds.n }, (_, i) => i).filter((i) => mask[i]);
		expect(keysOf(rankResults(ds, query, result))).toEqual(['HPI', 'HPINotes', 'NotesHPI', 'Zeta']);
	});
});

describe('facets', () => {
	const facets = buildFacets(ds, new Set(['Zeta']));
	const run = (filters: Record<string, string[]>, q = '') =>
		applyFilters(ds, facets, matchQuery(ds, parseQuery(q, ds)), filters);
	const counts = (r: ReturnType<typeof run>, id: string) => {
		const f = facets.find((x) => x.id === id)!;
		return Object.fromEntries(f.values.map((v, i) => [v.value, r.counts.get(id)![i]]));
	};

	it('defaults to active only', () => {
		const r = run(DEFAULT_FILTERS);
		expect(keysOf(r.result)).not.toContain('NotesHPI');
		expect(r.result).toHaveLength(5);
		expect(counts(r, 'status')).toEqual({ active: 5, expired: 1 });
	});

	it('has Added and Expired facets by timestamp, newest first', () => {
		const r = run({});
		expect(facets.find((f) => f.id === 'added')!.values.map((v) => v.value)).toEqual([T1, T0]);
		expect(counts(r, 'added')).toEqual({ [T1]: 2, [T0]: 4 });
		expect(counts(r, 'expired')).toEqual({ [T1]: 1, [EMPTY]: 5 });
		expect(keysOf(run({ added: [T1] }).result)).toEqual(['MIPS_Migrate ', 'Zeta']);
	});

	it('distinguishes display name set / empty / NULL, and derived facets', () => {
		const r = run({});
		expect(counts(r, 'display')).toEqual({ set: 3, empty: 1, null: 2 });
		expect(counts(r, 'has_description')).toEqual({ yes: 2, no: 4 });
		expect(counts(r, 'category')).toEqual({ system: 1, [EMPTY]: 5 });
		expect(counts(r, 'discussion')).toEqual({ yes: 1, no: 5 });
		expect(counts(r, 'pending')).toEqual({ yes: 1, no: 5 });
	});

	it('ORs within a facet, ANDs across, and counts each facet against the others', () => {
		const r = run({ status: ['active'], display: ['null', 'empty'] });
		expect(keysOf(r.result)).toEqual(['ANSI5010', 'HPINotes', 'MIPS_Migrate ']);
		// Display counts ignore the display filter but respect status.
		expect(counts(r, 'display')).toEqual({ set: 2, empty: 1, null: 2 });
		// Status counts ignore the status filter but respect display.
		expect(counts(r, 'status')).toEqual({ active: 3, expired: 0 });
	});

	it('combines with the text query', () => {
		expect(keysOf(run({ category: [EMPTY] }, 'hpi').result)).toEqual([
			'HPINotes',
			'NotesHPI',
			'Zeta'
		]);
	});
});

describe('sort', () => {
	const all = Int32Array.from({ length: ds.n }, (_, i) => i);
	it('sorts by normalized value with empties last in both directions', () => {
		expect(keysOf(sortResults(ds, all, { column: 'description', desc: false }))).toEqual([
			'HPI',
			'Zeta',
			'ANSI5010',
			'HPINotes',
			'MIPS_Migrate ',
			'NotesHPI'
		]);
		expect(keysOf(sortResults(ds, all, { column: 'description', desc: true })).slice(0, 2)).toEqual(
			['Zeta', 'HPI']
		);
	});
	it('sorts keys by file order (SQL collation) and timestamps chronologically', () => {
		expect(keysOf(sortResults(ds, all, { column: 'key', desc: true }))[0]).toBe('Zeta');
		expect(keysOf(sortResults(ds, all, { column: 'added', desc: true })).slice(0, 2)).toEqual([
			'MIPS_Migrate ',
			'Zeta'
		]);
	});
});

describe('URL state', () => {
	it('round-trips, including a trailing-space key', () => {
		const state = {
			q: 'hpi "progress note"',
			filters: { status: ['active', 'expired'], category: ['system', EMPTY], added: [T1] },
			sort: { column: 'added', desc: true },
			key: 'MIPS_MigrateSettings_2023 '
		};
		const search = viewStateToSearch(state);
		expect(search).toContain('key=MIPS_MigrateSettings_2023+');
		expect(parseViewState(new URLSearchParams(search))).toEqual(state);
	});

	it('defaults status to active and encodes "all" explicitly', () => {
		expect(parseViewState(new URLSearchParams('')).filters).toEqual({ status: ['active'] });
		expect(
			viewStateToSearch({ q: '', filters: { status: ['active'] }, sort: null, key: null })
		).toBe('?');
		const all = viewStateToSearch({ q: '', filters: { status: [] }, sort: null, key: null });
		expect(all).toBe('?status=all');
		expect(parseViewState(new URLSearchParams(all)).filters).toEqual({ status: [] });
	});
});
