import { describe, expect, it } from 'vitest';
import { adoptSeed } from '../../src/lib/data/adopt.ts';
import {
	readAdditional,
	readItemkeysArchive,
	readItemkeysExport
} from '../../src/lib/data/files.ts';
import { writeRpt, type RptDoc } from '../../src/lib/data/rpt.ts';
import { sync, type SyncResult } from '../../src/lib/data/sync.ts';
import { errorsOf } from '../../src/lib/data/types.ts';
import { validateAdditional } from '../../src/lib/data/validate.ts';
import { exportText, fixture, schema } from './helpers.ts';

const T0 = '2026-11-04T14:00:00Z';
const T1 = '2026-12-01T15:00:00Z';
const T2 = '2026-12-15T15:00:00Z';
const T3 = '2027-01-05T15:00:00Z';

const exp = (n: number) => readItemkeysExport(fixture(`sync/itemkeys.v${n}.rpt`)).doc;

interface State {
	additional: string;
	archive: string;
}

function adopt(): State {
	const r = adoptSeed(fixture('sync/additional.seed.rpt'), schema, T0);
	return { additional: writeRpt(r.additional), archive: writeRpt(r.archive) };
}

/** Runs sync like the script does: from file texts to file texts, re-validating the output. */
function run(state: State, itemkeys: RptDoc, previous: RptDoc | null, now: string) {
	const additional = readAdditional(state.additional, schema).doc;
	const archive = readItemkeysArchive(state.archive).doc;
	const result = sync({ itemkeys, additional, archive, previous, now, schema });
	const next = { additional: writeRpt(result.additional), archive: writeRpt(result.archive) };
	const reread = readAdditional(next.additional, schema).doc;
	const rearchive = readItemkeysArchive(next.archive).doc;
	expect(errorsOf(validateAdditional(reread, schema, rearchive))).toEqual([]);
	return {
		result,
		next,
		rows: reread.records.map((r) => r.fields),
		archived: rearchive.records.map((r) => r.fields)
	};
}

const keysOf = (rows: string[][]) => rows.map((r) => r[0]);

describe('sync over an export sequence', () => {
	const s0 = adopt();
	const r1 = run(s0, exp(1), exp(1), T1);
	const r2 = run(r1.next, exp(2), exp(1), T1);
	const r3 = run(r2.next, exp(3), exp(2), T2);
	const r4 = run(r3.next, exp(4), exp(3), T3);

	it('adoption converts the seed; v1 is then a no-op', () => {
		expect(keysOf(r1.rows)).toEqual(keysOf(exp(1).records.map((r) => r.fields)));
		expect(r1.rows.find((r) => r[0] === 'HPI')).toEqual(['HPI', T0, '', '', 'system']);
		expect(r1.result.changed).toBe(false);
		expect(r1.next).toEqual(s0);
	});

	it('v2 inserts new keys in SQL order, including SQL-collation neighbours and a first key', () => {
		expect(r2.result.added).toEqual(['10eFirstKey', 'ANSI_NewKey', 'ANSI5011', 'HPIExtra']);
		expect(keysOf(r2.rows)).toEqual(keysOf(exp(2).records.map((r) => r.fields)));
		expect(r2.rows.find((r) => r[0] === 'ANSI_NewKey')).toEqual(['ANSI_NewKey', T1, '', '', '']);
		// Only inserted lines differ.
		const before = s0.additional.split('\r\n');
		const after = r2.next.additional.split('\r\n');
		expect(after.filter((l) => !before.includes(l))).toHaveLength(4);
		expect(before.every((l) => after.includes(l))).toBe(true);
	});

	it('v3 expires removed keys, keeps their rows in place and archives last-known values', () => {
		expect(r3.result.expired).toEqual(['HPINotes', 'zopariUrl']);
		expect(keysOf(r3.rows)).toEqual(keysOf(r2.rows));
		expect(r3.rows.find((r) => r[0] === 'HPINotes')).toEqual(['HPINotes', T0, T2, '', '']);
		expect(r3.archived).toEqual([
			['HPINotes', 'Notes for HPI\nsecond line', 'NULL'],
			['zopariUrl', 'value will be taken as the jopari ftp url', 'NULL']
		]);
	});

	it('v4 clears expired for a returning key, keeps added and removes its archive row', () => {
		expect(r4.result.returned).toEqual(['HPINotes']);
		expect(r4.rows.find((r) => r[0] === 'HPINotes')).toEqual(['HPINotes', T0, '', '', '']);
		expect(r4.archived.map((r) => r[0])).toEqual(['zopariUrl']);
		expect(keysOf(r4.rows)).toEqual(keysOf(r3.rows));
	});

	it('is idempotent', () => {
		const again = run(r4.next, exp(4), exp(4), '2027-02-01T00:00:00Z');
		expect(again.result.changed).toBe(false);
		expect(again.next).toEqual(r4.next);
	});

	it('gives every key touched by one run the same timestamp', () => {
		const stamps = new Set(r2.rows.filter((r) => r[1] !== T0).map((r) => r[1]));
		expect([...stamps]).toEqual([T1]);
	});

	it('records no archive values when the previous export is missing', () => {
		const r = run(r2.next, exp(3), null, T2);
		expect(r.result.missingLastKnown).toEqual(['HPINotes', 'zopariUrl']);
		expect(r.archived).toEqual([]);
	});

	it('reverting a bad export together with its sync commit leaves sync a no-op', () => {
		const bad = readItemkeysExport(exportText([['ANSI', '', 'NULL']])).doc;
		const wrong = run(r2.next, bad, exp(2), T2);
		expect(wrong.result.expired.length).toBeGreaterThan(5);
		// git revert of both commits restores r2.next and the v2 export.
		const after = run(r2.next, exp(2), bad, T3);
		expect(after.result.changed).toBe(false);
	});
});

describe('sync warnings', () => {
	it('lists possible renames (case or surrounding whitespace)', () => {
		const s0 = adopt();
		const v = exp(1).records.map((r) => r.fields);
		const renamed = v.map((r) => (r[0] === 'HPINotes' ? ['hpinotes ', r[1], r[2]] : r));
		renamed.sort((a, b) => (a[0] === 'hpinotes ' ? 1 : b[0] === 'hpinotes ' ? -1 : 0));
		const r: SyncResult = run(s0, readItemkeysExport(exportText(renamed)).doc, exp(1), T1).result;
		expect(r.possibleRenames).toEqual([['hpinotes ', 'HPINotes']]);
	});
});
