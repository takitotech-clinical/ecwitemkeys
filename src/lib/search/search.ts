/**
 * Query syntax (PLAN §4.3): whitespace-separated terms are ANDed, `"quoted phrase"` matches a
 * phrase, `-term` excludes, `column:term` restricts a term to one column.
 */
import type { Dataset } from '../data/model.ts';
import { normalize } from './normalize.ts';
import { ranks } from './sort.ts';

/** Column whose values order the default view, highest first (unset last). */
export const PRIORITY_COLUMN = 'rank';

export interface Term {
	text: string;
	/** Column index, or undefined for any searchable column. */
	column?: number;
	negate: boolean;
}

export interface Query {
	terms: Term[];
	/** Unscoped positive terms joined by a space, for ranking. */
	rankText: string;
}

const TOKEN_RE = /(-?)(?:([A-Za-z_]+):)?(?:"([^"]*)"?|(\S+))/g;

export function parseQuery(q: string, ds: Pick<Dataset, 'columns'>): Query {
	const aliases = new Map<string, number>();
	for (const c of ds.columns) for (const a of c.aliases) aliases.set(a.toLowerCase(), c.index);
	const terms: Term[] = [];
	for (const m of q.matchAll(TOKEN_RE)) {
		const [whole, neg, col, phrase, word] = m;
		let column: number | undefined;
		let raw = phrase ?? word ?? '';
		if (col !== undefined) {
			column = aliases.get(col.toLowerCase());
			// Not a known column: treat `foo:bar` as a plain term.
			if (column === undefined) raw = whole.slice(neg.length);
		}
		const text = normalize(raw);
		if (text === '') continue;
		terms.push({ text, column, negate: neg === '-' && whole.length > 1 });
	}
	const rankText = terms
		.filter((t) => !t.negate && t.column === undefined)
		.map((t) => t.text)
		.join(' ');
	return { terms, rankText };
}

/** Marks rows matching every term. Returns null when the query has no terms (all match). */
export function matchQuery(ds: Dataset, query: Query): Uint8Array | null {
	const { terms } = query;
	if (terms.length === 0) return null;
	const out = new Uint8Array(ds.n);
	const { all, norm } = ds;
	rows: for (let i = 0; i < ds.n; i++) {
		for (const t of terms) {
			const hay = t.column === undefined ? all[i] : norm[t.column][i];
			if (hay.includes(t.text) === t.negate) continue rows;
		}
		out[i] = 1;
	}
	return out;
}

/**
 * Default order: search relevance (exact key > key prefix > key contains > display name > other
 * columns), then the `rank` column high to low with unset last, then file order (alphabetical).
 */
export function rankResults(ds: Dataset, query: Query, result: Int32Array): Int32Array {
	const q = query.rankText;
	const priority = ds.byId.has(PRIORITY_COLUMN) ? ranks(ds, PRIORITY_COLUMN) : null;
	if (q === '' && !priority) return result;
	const words = q.split(' ');
	const keyNorm = ds.norm[0];
	const display = ds.byId.get('display_name');
	const tier = (i: number) => {
		if (q === '') return 0;
		const k = keyNorm[i];
		if (k === q) return 0;
		if (k.startsWith(q)) return 1;
		if (words.every((w) => k.includes(w))) return 2;
		if (display && words.every((w) => ds.norm[display.index][i].includes(w))) return 3;
		return 4;
	};
	const tiers = new Uint8Array(ds.n);
	for (const i of result) tiers[i] = tier(i);
	return result
		.slice()
		.sort((a, b) => tiers[a] - tiers[b] || (priority ? priority[b] - priority[a] : 0) || a - b);
}

/** Case-insensitive spans of `text` that match any positive term, for highlighting. */
export function highlightRanges(text: string, needles: string[]): [number, number][] {
	if (needles.length === 0 || !text) return [];
	const lower = text.toLowerCase();
	const ranges: [number, number][] = [];
	for (const n of needles) {
		if (!n) continue;
		for (let i = lower.indexOf(n); i !== -1; i = lower.indexOf(n, i + n.length)) {
			ranges.push([i, i + n.length]);
		}
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const r of ranges) {
		const last = merged.at(-1);
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else merged.push([...r]);
	}
	return merged;
}
