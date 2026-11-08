/**
 * Search/filter budget (PLAN §4.3): < 16 ms per keystroke at 4.5k rows and < 50 ms at 50k rows
 * on a mid-range phone. CI hardware differs, so the assertions allow a 3× margin; the measured
 * times are printed.
 */
import { describe, expect, it } from 'vitest';
import { buildDataset, type Dataset } from '../../src/lib/data/model.ts';
import { applyFilters, buildFacets, type Filters } from '../../src/lib/search/facets.ts';
import { matchQuery, parseQuery, rankResults } from '../../src/lib/search/search.ts';
import { sortResults } from '../../src/lib/search/sort.ts';
import { bundle } from './helpers.ts';

const WORDS = [
	'claim',
	'batch',
	'note',
	'progress',
	'hpi',
	'ansi',
	'enable',
	'portal',
	'lab',
	'order',
	'fax',
	'rx',
	'visit',
	'billing',
	'provider',
	'facility'
];

/** Deterministic synthetic rows shaped like the real export. */
function generate(n: number): (string | null)[][] {
	let seed = 42;
	const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	const pick = () => WORDS[Math.floor(rnd() * WORDS.length)];
	const sentence = (k: number) => Array.from({ length: k }, pick).join(' ');
	const stamps = ['2026-11-04T14:00:00Z', '2026-12-01T15:00:00Z', '2027-01-05T15:00:00Z'];
	return Array.from({ length: n }, (_, i) => [
		`${pick()}_${pick()}_${i.toString(36)}`,
		rnd() < 0.2 ? '' : sentence(8 + Math.floor(rnd() * 20)),
		rnd() < 0.75 ? null : sentence(3),
		stamps[Math.floor(rnd() * 3)],
		rnd() < 0.05 ? '2027-01-05T15:00:00Z' : '',
		rnd() < 0.1 ? sentence(30) : '',
		rnd() < 0.03 ? 'system' : ''
	]);
}

function keystroke(ds: Dataset, q: string, filters: Filters) {
	const facets = buildFacets(ds, null);
	const t0 = performance.now();
	const query = parseQuery(q, ds);
	const r = applyFilters(ds, facets, matchQuery(ds, query), filters);
	rankResults(ds, query, r.result);
	return performance.now() - t0;
}

function median(xs: number[]) {
	return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
}

describe('search performance', () => {
	for (const [n, budget] of [
		[4_500, 16],
		[50_000, 50]
	] as const) {
		it(`filters ${n.toLocaleString()} rows within budget`, () => {
			const ds = buildDataset(bundle(generate(n)));
			const queries = [
				'c',
				'cl',
				'cla',
				'claim',
				'claim b',
				'claim batch',
				'"claim batch" -fax',
				'key:hpi note'
			];
			keystroke(ds, 'warm', { status: ['active'] });
			const times = queries.map((q) => keystroke(ds, q, { status: ['active'], category: ['~'] }));
			const t = median(times);
			console.log(
				`${n} rows: median ${t.toFixed(1)} ms, max ${Math.max(...times).toFixed(1)} ms (budget ${budget} ms)`
			);
			expect(t).toBeLessThan(budget * 3);
			const sorted = performance.now();
			sortResults(
				ds,
				Int32Array.from({ length: n }, (_, i) => i),
				{ column: 'ecw_remarks', desc: false }
			);
			console.log(`${n} rows: first sort by remarks ${(performance.now() - sorted).toFixed(0)} ms`);
		});
	}
});
