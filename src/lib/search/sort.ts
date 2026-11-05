/**
 * Column sorting. Values compare trimmed and normalized; empty and NULL sort last in either
 * direction. Key order is the file order (SQL Server collation, PLAN §2.3 rule 5).
 */
import type { Dataset } from '../data/model.ts';

export interface Sort {
	column: string;
	desc: boolean;
}

const rankCache = new WeakMap<Dataset, Map<string, Int32Array>>();
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Rank of each row's value in a column (ties share a rank; empty = -1). */
function ranks(ds: Dataset, columnId: string): Int32Array {
	let cache = rankCache.get(ds);
	if (!cache) rankCache.set(ds, (cache = new Map()));
	const hit = cache.get(columnId);
	if (hit) return hit;
	const col = ds.byId.get(columnId)!;
	const out = new Int32Array(ds.n);
	if (col.type === 'key') {
		for (let i = 0; i < ds.n; i++) out[i] = i;
	} else {
		const vals = ds.norm[col.index];
		const order = Array.from({ length: ds.n }, (_, i) => i).filter((i) => vals[i] !== '');
		const cmp =
			col.type === 'timestamp' || col.type === 'date'
				? (a: number, b: number) => (vals[a] < vals[b] ? -1 : vals[a] > vals[b] ? 1 : 0)
				: (a: number, b: number) => collator.compare(vals[a], vals[b]);
		order.sort(cmp);
		out.fill(-1);
		let rank = 0;
		order.forEach((row, k) => {
			if (k > 0 && cmp(order[k - 1], row) !== 0) rank++;
			out[row] = rank;
		});
	}
	cache.set(columnId, out);
	return out;
}

export function sortResults(ds: Dataset, result: Int32Array, sort: Sort): Int32Array {
	if (!ds.byId.has(sort.column)) return result;
	const r = ranks(ds, sort.column);
	const dir = sort.desc ? -1 : 1;
	return result.slice().sort((a, b) => {
		const ra = r[a];
		const rb = r[b];
		if (ra === -1 || rb === -1) return ra === rb ? a - b : ra === -1 ? 1 : -1;
		return (ra - rb) * dir || a - b;
	});
}
