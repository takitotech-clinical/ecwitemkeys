import { describe, expect, it } from 'vitest';
import { adoptSeed } from '../../src/lib/data/adopt.ts';
import { addColumn, removeColumn, renameColumn } from '../../src/lib/data/columns.ts';
import {
	readAdditional,
	readItemkeysArchive,
	readItemkeysExport
} from '../../src/lib/data/files.ts';
import { join } from '../../src/lib/data/join.ts';
import { readRpt, withFields, writeRpt } from '../../src/lib/data/rpt.ts';
import { additionalHeader, validateSchema, type Schema } from '../../src/lib/data/schema.ts';
import { sync } from '../../src/lib/data/sync.ts';
import { DataError } from '../../src/lib/data/types.ts';
import {
	validateAdditional,
	validateProposedSet,
	validateUserValue
} from '../../src/lib/data/validate.ts';
import { fixture, rptText, schema } from './helpers.ts';

const T0 = '2026-11-04T14:00:00Z';
const T1 = '2026-12-01T15:00:00Z';
const col = (id: string) => schema.columns.find((c) => c.id === id)!;

describe('adoption', () => {
	const seedText = fixture('additional.seed.rpt');
	const { additional, archive } = adoptSeed(seedText, schema, T0);
	const out = writeRpt(additional);

	it('converts the seed to the 5-column format', () => {
		const { doc } = readAdditional(out, schema);
		expect(doc.records).toHaveLength(28);
		expect(validateAdditional(doc, schema)).toEqual([]);
		expect(doc.records.find((r) => r.fields[0] === 'HPI')!.fields).toEqual([
			'HPI',
			T0,
			'',
			'',
			'system'
		]);
		expect(writeRpt(archive)).toBe('\uFEFFkey`support_remarks`display_name\r\n');
	});

	it('differs from the seed only by the inserted columns and the removed footer', () => {
		const seedLines = seedText.slice(0, seedText.indexOf('\r\n\r\n(')).split('\r\n');
		const outLines = out.replace(/\r\n$/, '').split('\r\n');
		expect(outLines).toHaveLength(seedLines.length);
		outLines.forEach((l, i) => {
			const [k, ...rest] = seedLines[i].split('`');
			const inserted = i === 0 ? ['added', 'expired'] : [T0, ''];
			expect(l).toBe([k, ...inserted, ...rest].join('`'));
		});
	});

	it('refuses to run twice', () => {
		expect(() => adoptSeed(out, schema, T0)).toThrow(/already/);
	});
});

describe('join and diagnostics', () => {
	const itemkeys = readItemkeysExport(fixture('sync/itemkeys.v3.rpt')).doc;
	const v2 = readItemkeysExport(fixture('sync/itemkeys.v2.rpt')).doc;
	const adopted = adoptSeed(fixture('sync/additional.seed.rpt'), schema, T0);
	const s1 = sync({ itemkeys: v2, ...adopted, previous: null, now: T1, schema });
	const s2 = sync({
		itemkeys,
		additional: s1.additional,
		archive: s1.archive,
		previous: v2,
		now: '2026-12-15T15:00:00Z',
		schema
	});
	const j = join({ itemkeys, additional: s2.additional, archive: s2.archive, schema });

	it('joins active rows with itemkeys and expired rows with last-known values', () => {
		const row = (k: string) => j.rows.find((r) => r[0] === k)!;
		expect(row('ANSI')).toEqual(['ANSI', 'By default its itemid is 1', null, T0, '', '', '']);
		expect(row('HPINotes')).toEqual([
			'HPINotes',
			'Notes for HPI\nsecond line',
			null,
			T0,
			'2026-12-15T15:00:00Z',
			'',
			''
		]);
		expect(j.lastKnown.map((i) => j.rows[i][0])).toEqual(['HPINotes', 'zopariUrl']);
		expect(j.exportedAt).toBe('2026-12-15T09:00:00.0000000-05:00');
	});

	it('collects diagnostics and the last sync', () => {
		expect(j.diagnostics.whitespaceKeys).toEqual(['MIPS_MigrateSettings_2021 ']);
		expect(j.diagnostics.multilineValues).toEqual([{ key: 'HPINotes', column: 'support_remarks' }]);
		expect(j.diagnostics.syncState).toEqual({ missingActiveRow: [], activeNotInItemkeys: [] });
		expect(j.lastSync).toEqual({
			at: '2026-12-15T15:00:00Z',
			added: [],
			expired: ['HPINotes', 'zopariUrl'],
			possibleRenames: []
		});
		expect(j.newAt).toBe(T1);
	});

	it('reports sync-state mismatches and expired keys without last-known values', () => {
		const stale = join({ itemkeys, additional: s1.additional, archive: s1.archive, schema });
		expect(stale.diagnostics.syncState.activeNotInItemkeys).toEqual(['HPINotes', 'zopariUrl']);
		const noArchive = join({ itemkeys, additional: s2.additional, archive: s1.archive, schema });
		expect(noArchive.diagnostics.expiredWithoutLastKnown).toEqual(['HPINotes', 'zopariUrl']);
		expect(noArchive.lastKnown).toEqual([]);
	});

	it('has no lastSync and no New rows right after adoption', () => {
		const a = join({
			itemkeys: readItemkeysExport(fixture('sync/itemkeys.v1.rpt')).doc,
			...adopted,
			schema
		});
		expect(a.lastSync).toBeNull();
		expect(a.newAt).toBeNull();
	});
});

describe('validation', () => {
	const AH = additionalHeader(schema);
	const check = (rows: string[][]) =>
		validateAdditional(readAdditional(rptText(AH, rows), schema).doc, schema).map((i) => i.message);

	it('validates timestamps and expired ≥ added', () => {
		expect(check([['a', '2026-11-04', '', '', '']])).toEqual([
			expect.stringMatching(/added must be a UTC timestamp/)
		]);
		expect(check([['a', '2026-13-04T00:00:00Z', '', '', '']])).toEqual([
			expect.stringMatching(/added must be/)
		]);
		expect(check([['a', '', '', '', '']])).toEqual(['added is required']);
		expect(check([['a', T1, T0, '', '']])).toEqual([
			expect.stringMatching(/expired .* is before added/)
		]);
		expect(check([['a', T0, T1, '', '']])).toEqual([]);
	});

	it('applies user-value rules', () => {
		const d = col('description');
		expect(validateUserValue(d, 'ok | fine\nsecond line')).toEqual([]);
		expect(validateUserValue(d, 'has ` tick')).toEqual([expect.stringMatching(/backtick/)]);
		expect(validateUserValue(d, 'tab\there')).toEqual([expect.stringMatching(/Tab/)]);
		expect(validateUserValue(d, ' padded')).toEqual([expect.stringMatching(/whitespace/)]);
		expect(validateUserValue(d, 'NULL')).toEqual([expect.stringMatching(/NULL/)]);
		expect(validateUserValue(d, 'x'.repeat(2000))).toEqual([]);
		expect(validateUserValue(d, 'x'.repeat(2001))).toEqual([expect.stringMatching(/2000/)]);
		const c = col('category');
		expect(validateUserValue(c, 'system')).toEqual([]);
		expect(validateUserValue(c, 'other')).toEqual([expect.stringMatching(/one of: system/)]);
		expect(validateUserValue(c, 'sys\ntem')).toContain(
			'Line breaks are not allowed in this field.'
		);
	});

	it('flags a blank line between records as a trailing line break', () => {
		const text = rptText(AH, [
			['a', T0, '', '', ''],
			['b', T0, '', 'x', '']
		]).replace('``\r\nb', '``\r\n\r\nb');
		const doc = readAdditional(text, schema).doc;
		expect(validateAdditional(doc, schema).map((i) => i.message)).toEqual([
			'category: Line breaks are not allowed in this field.',
			expect.stringMatching(/category: .*blank line between records/),
			expect.stringMatching(/category: Must be one of/)
		]);
	});

	it('checks the archive against additional', () => {
		const add = readAdditional(
			rptText(AH, [
				['a', T0, '', '', ''],
				['b', T0, T1, '', '']
			]),
			schema
		).doc;
		const arc = readItemkeysArchive(
			rptText(
				['key', 'support_remarks', 'display_name'],
				[
					['a', '', ''],
					['b', '', '']
				]
			)
		).doc;
		expect(validateAdditional(add, schema, arc).map((i) => `${i.key}:${i.message}`)).toEqual([
			'a:Archived key is not expired in additional.rpt'
		]);
	});

	it('validates proposed sets', () => {
		expect(validateProposedSet(schema, { description: 'Line 1\nLine 2' })).toEqual({});
		expect(validateProposedSet(schema, { expired: '' })).toEqual({
			expired: [expect.stringMatching(/managed/)]
		});
		expect(validateProposedSet(schema, { key: 'x' })).toEqual({
			key: [expect.stringMatching(/cannot be edited/)]
		});
		expect(validateProposedSet(schema, { nope: 'x' })).toEqual({
			nope: ['Unknown column "nope".']
		});
		expect(validateProposedSet(schema, {})).toEqual({ _: [expect.any(String)] });
	});

	it('validates the schema', () => {
		expect(validateSchema(schema)).toEqual([]);
		const bad: Schema = {
			version: 2,
			columns: [
				{ id: 'description', label: 'D', type: 'text' },
				{ id: 'added', label: 'A', type: 'timestamp', managed: true },
				{ id: 'Bad-Id', label: 'B', type: 'enum', values: [] },
				{ id: 'key', label: 'K', type: 'text', multiline: true },
				{ id: 'cat', label: 'C', type: 'enum', values: ['a`b'], multiline: true }
			]
		};
		expect(validateSchema(bad).map((i) => i.message)).toEqual([
			'column 2 (added): managed columns must come directly after key',
			'column 3 (Bad-Id): id must be snake_case',
			'column 3 (Bad-Id): enum values must be a non-empty array',
			'column 4 (key): "key" is implicit and must not be declared',
			'column 5 (cat): enum value "a`b" contains a forbidden character',
			'column 5 (cat): "multiline" is only allowed on text columns'
		]);
	});
});

describe('column scripts', () => {
	const text = rptText(additionalHeader(schema), [
		['a', T0, '', 'desc', 'system'],
		['b', T0, '', '', '']
	]);
	const doc = readAdditional(text, schema).doc;

	it('adds a user column at the end', () => {
		const { schema: s, doc: d } = addColumn(schema, doc, {
			id: 'owner',
			label: 'Owner',
			type: 'text'
		});
		expect(s.columns.at(-1)!.id).toBe('owner');
		expect(writeRpt(d)).toBe(
			rptText(
				[...additionalHeader(schema), 'owner'],
				[
					['a', T0, '', 'desc', 'system', ''],
					['b', T0, '', '', '', '']
				]
			)
		);
	});

	it('renames a column in schema and header only', () => {
		const { schema: s, doc: d } = renameColumn(schema, doc, 'description', 'notes');
		expect(s.columns.map((c) => c.id)).toEqual(['added', 'expired', 'notes', 'category']);
		const out = writeRpt(d).split('\r\n');
		expect(out[0]).toBe('\uFEFFkey`added`expired`notes`category');
		expect(out.slice(1)).toEqual(text.split('\r\n').slice(1));
	});

	it('removes a user column and refuses managed ones', () => {
		const { doc: d } = removeColumn(schema, doc, 'description');
		expect(writeRpt(d)).toBe(
			rptText(
				['key', 'added', 'expired', 'category'],
				[
					['a', T0, '', 'system'],
					['b', T0, '', '']
				]
			)
		);
		expect(() => removeColumn(schema, doc, 'added')).toThrow(/Managed/);
		expect(() => addColumn(schema, doc, { id: 'Bad', label: 'B', type: 'text' })).toThrow(
			DataError
		);
	});

	it('keeps untouched records byte-identical through withFields', () => {
		const r = readRpt(text, { file: 'f', header: additionalHeader(schema), footer: 'forbidden' })
			.doc.records[0];
		expect(withFields(r, [...r.fields])).toBe(r);
	});
});
