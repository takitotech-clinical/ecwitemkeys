/**
 * Applies a new itemkeys export to additional.rpt and the expired archive (PLAN §2.6).
 * Pure: inputs are not modified. Idempotent: re-running with the same export changes nothing.
 */
import { cloneDoc, keyIndex, newRecord, withFields, type RptDoc, type RptRecord } from './rpt.ts';
import { fieldIndex, type Schema } from './schema.ts';

export interface SyncInput {
	itemkeys: RptDoc;
	additional: RptDoc;
	archive: RptDoc;
	/** The previous export, used only to archive the last-known values of expiring keys. */
	previous: RptDoc | null;
	/** UTC timestamp of this run; shared by every key it touches. */
	now: string;
	schema: Schema;
}

export interface SyncResult {
	additional: RptDoc;
	archive: RptDoc;
	added: string[];
	expired: string[];
	returned: string[];
	/** [added key, expired key] pairs that differ only by case or surrounding whitespace. */
	possibleRenames: [string, string][];
	/** Expired keys whose last-known values were not in the previous export. */
	missingLastKnown: string[];
	changed: boolean;
}

export function sync(input: SyncInput): SyncResult {
	const { itemkeys, previous, now, schema } = input;
	const iAdded = fieldIndex(schema, 'added');
	const iExpired = fieldIndex(schema, 'expired');
	if (iAdded < 0 || iExpired < 0) throw new Error('Schema must declare added and expired');
	const width = schema.columns.length + 1;

	const K = itemkeys.records.map((r) => r.fields[0]);
	const inK = new Set(K);
	const existing = keyIndex(input.additional);

	// 1. New keys go right after the nearest preceding key (in export order) that has a row.
	//    Consecutive new keys chain after the same existing row, keeping export order.
	const insertAfter = new Map<number, string[]>(); // existing row index (-1 = top) → new keys
	const added: string[] = [];
	let anchor = -1;
	for (const k of K) {
		const idx = existing.get(k);
		if (idx !== undefined) {
			anchor = idx;
			continue;
		}
		added.push(k);
		const list = insertAfter.get(anchor);
		if (list) list.push(k);
		else insertAfter.set(anchor, [k]);
	}

	const additional = cloneDoc(input.additional);
	const records: RptRecord[] = [];
	const emit = (k: string) => {
		const fields = new Array<string>(width).fill('');
		fields[0] = k;
		fields[iAdded] = now;
		records.push(newRecord(fields));
	};
	insertAfter.get(-1)?.forEach(emit);

	// 2./3. Expire missing keys, clear returning keys; everything else is untouched.
	const expired: string[] = [];
	const returned: string[] = [];
	input.additional.records.forEach((r, idx) => {
		const k = r.fields[0];
		const isExpired = r.fields[iExpired] !== '';
		if (!isExpired && !inK.has(k)) {
			const f = [...r.fields];
			f[iExpired] = now;
			records.push(withFields(r, f));
			expired.push(k);
		} else if (isExpired && inK.has(k)) {
			const f = [...r.fields];
			f[iExpired] = '';
			records.push(withFields(r, f));
			returned.push(k);
		} else {
			records.push(r);
		}
		insertAfter.get(idx)?.forEach(emit);
	});
	additional.records = records;

	// Archive: drop returning keys, add expiring keys from the previous export, and keep the
	// file in additional.rpt order (existing records keep their bytes).
	const prev = previous ? keyIndex(previous) : new Map<string, number>();
	const returning = new Set(returned);
	const archived = new Map<string, RptRecord>();
	for (const r of input.archive.records) {
		if (!returning.has(r.fields[0])) archived.set(r.fields[0], r);
	}
	const missingLastKnown: string[] = [];
	for (const k of expired) {
		const pi = prev.get(k);
		if (pi === undefined || !previous) missingLastKnown.push(k);
		else archived.set(k, newRecord(previous.records[pi].fields));
	}
	const archive = cloneDoc(input.archive);
	archive.records = records.flatMap((r) => archived.get(r.fields[0]) ?? []);

	const norm = (k: string) => k.trim().toLowerCase();
	const expiredByNorm = new Map<string, string[]>();
	for (const k of expired) {
		const n = norm(k);
		expiredByNorm.set(n, [...(expiredByNorm.get(n) ?? []), k]);
	}
	const possibleRenames: [string, string][] = added.flatMap((a) =>
		(expiredByNorm.get(norm(a)) ?? []).map((e): [string, string] => [a, e])
	);

	const archiveChanged =
		archive.records.length !== input.archive.records.length ||
		archive.records.some((r, i) => r !== input.archive.records[i]);
	return {
		additional,
		archive,
		added,
		expired,
		returned,
		possibleRenames,
		missingLastKnown,
		changed: added.length + expired.length + returned.length > 0 || archiveChanged
	};
}
