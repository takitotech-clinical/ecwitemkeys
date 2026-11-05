/**
 * Joins additional.rpt with itemkeys.rpt / itemkeys.expired.rpt and collects diagnostics
 * (PLAN §3.3). The result is the data bundle the browser loads.
 */
import { ITEMKEYS_HEADER, sqlValue } from './files.ts';
import { keyIndex, type RptDoc } from './rpt.ts';
import { fieldIndex, type Schema } from './schema.ts';
import { keyCollisions } from './validate.ts';

export interface ValueRef {
	key: string;
	column: string;
}

export interface LastSync {
	/** The newest added/expired timestamp in additional.rpt. */
	at: string;
	added: string[];
	expired: string[];
	possibleRenames: [string, string][];
}

export interface Diagnostics {
	collisions: string[][];
	whitespaceKeys: string[];
	whitespaceValues: ValueRef[];
	multilineValues: ValueRef[];
	expiredWithoutLastKnown: string[];
	/** Itemkeys keys without an active row, and active rows not in itemkeys (run data:sync). */
	syncState: { missingActiveRow: string[]; activeNotInItemkeys: string[] };
}

export interface ItemsBundle {
	generatedAt: string;
	/** The export's SSMS completion time, as written (with its offset). */
	exportedAt: string | null;
	itemkeysColumns: string[];
	additionalSchema: Schema;
	/** One row per additional.rpt record: itemkeys columns, then additional columns after key. */
	rows: (string | null)[][];
	/** Indices of rows whose itemkeys values come from the expired archive. */
	lastKnown: number[];
	/** Discussion comment counts by key. */
	discussions: Record<string, number>;
	lastSync: LastSync | null;
	/** The newest `added` timestamp other than the adoption seed's; rows with it are "New". */
	newAt: string | null;
	diagnostics: Diagnostics;
}

export interface JoinInput {
	itemkeys: RptDoc;
	additional: RptDoc;
	archive: RptDoc;
	schema: Schema;
}

export type JoinResult = Omit<ItemsBundle, 'generatedAt' | 'discussions'>;

const hasOuterWhitespace = (v: string) => v !== v.trim();

export function join({ itemkeys, additional, archive, schema }: JoinInput): JoinResult {
	const iAdded = fieldIndex(schema, 'added');
	const iExpired = fieldIndex(schema, 'expired');
	const active = keyIndex(itemkeys);
	const archived = keyIndex(archive);

	const rows: (string | null)[][] = [];
	const lastKnown: number[] = [];
	const d: Diagnostics = {
		collisions: keyCollisions(additional.records.map((r) => r.fields[0])),
		whitespaceKeys: [],
		whitespaceValues: [],
		multilineValues: [],
		expiredWithoutLastKnown: [],
		syncState: { missingActiveRow: [], activeNotInItemkeys: [] }
	};
	const activeRows = new Set<string>();
	let newest = '';
	let oldestAdded = '';
	let newestAdded = '';

	for (const r of additional.records) {
		const key = r.fields[0];
		const isExpired = r.fields[iExpired] !== '';
		let ik: string[] | undefined;
		if (isExpired) {
			const ai = archived.get(key);
			if (ai !== undefined) {
				ik = archive.records[ai].fields;
				lastKnown.push(rows.length);
			} else d.expiredWithoutLastKnown.push(key);
		} else {
			activeRows.add(key);
			const ii = active.get(key);
			if (ii !== undefined) ik = itemkeys.records[ii].fields;
			else d.syncState.activeNotInItemkeys.push(key);
		}
		const ikValues = ITEMKEYS_HEADER.slice(1).map((_, c) => (ik ? sqlValue(ik[c + 1]) : ''));
		rows.push([key, ...ikValues, ...r.fields.slice(1)]);

		if (hasOuterWhitespace(key)) d.whitespaceKeys.push(key);
		const named: [string, string | null][] = [
			...ITEMKEYS_HEADER.slice(1).map((c, i): [string, string | null] => [c, ikValues[i]]),
			...schema.columns.map((c, i): [string, string] => [c.id, r.fields[i + 1]])
		];
		for (const [column, v] of named) {
			if (v === null || v === '') continue;
			if (v.includes('\n')) d.multilineValues.push({ key, column });
			if (hasOuterWhitespace(v)) d.whitespaceValues.push({ key, column });
		}

		const added = r.fields[iAdded];
		if (oldestAdded === '' || added < oldestAdded) oldestAdded = added;
		if (added > newestAdded) newestAdded = added;
		if (added > newest) newest = added;
		if (r.fields[iExpired] > newest) newest = r.fields[iExpired];
	}
	for (const r of itemkeys.records) {
		if (!activeRows.has(r.fields[0])) d.syncState.missingActiveRow.push(r.fields[0]);
	}

	let lastSync: LastSync | null = null;
	if (newest !== '') {
		// Rows added by the one-time adoption are the seed, not a sync.
		const added =
			newest === oldestAdded
				? []
				: additional.records.filter((r) => r.fields[iAdded] === newest).map((r) => r.fields[0]);
		const expired = additional.records
			.filter((r) => r.fields[iExpired] === newest)
			.map((r) => r.fields[0]);
		const norm = (k: string) => k.trim().toLowerCase();
		const possibleRenames = added.flatMap((a) =>
			expired.filter((e) => norm(e) === norm(a)).map((e): [string, string] => [a, e])
		);
		if (added.length + expired.length > 0)
			lastSync = { at: newest, added, expired, possibleRenames };
	}

	return {
		exportedAt: itemkeys.footer?.completionTime ?? null,
		itemkeysColumns: [...ITEMKEYS_HEADER],
		additionalSchema: schema,
		rows,
		lastKnown,
		lastSync,
		newAt: newestAdded !== oldestAdded ? newestAdded : null,
		diagnostics: d
	};
}
