import { describe, expect, it } from 'vitest';
import {
	readAdditional,
	readItemkeysArchive,
	readItemkeysExport,
	sqlValue
} from '../../src/lib/data/files.ts';
import { newRecord, readRpt, withFields, writeRpt } from '../../src/lib/data/rpt.ts';
import { additionalHeader } from '../../src/lib/data/schema.ts';
import { DataError } from '../../src/lib/data/types.ts';
import { exportText, fixture, rptText, schema } from './helpers.ts';

const H3 = ['key', 'support_remarks', 'display_name'];
const AH = additionalHeader(schema);
const TS = '2026-11-04T14:03:27Z';

function errorsOf(f: () => unknown): string[] {
	try {
		f();
	} catch (e) {
		if (e instanceof DataError) return e.issues.map((i) => `${i.line ?? ''}:${i.message}`);
		throw e;
	}
	return [];
}

describe('record reader', () => {
	it('detects and remembers BOM and line ending', () => {
		const crlf = readRpt(rptText(H3, [['a', 'b', 'c']]), {
			file: 'f',
			header: H3,
			footer: 'forbidden'
		});
		expect(crlf.doc.bom).toBe(true);
		expect(crlf.doc.eol).toBe('\r\n');
		const lf = readRpt(rptText(H3, [['a', 'b', 'c']], '\n', false), {
			file: 'f',
			header: H3,
			footer: 'forbidden'
		});
		expect(lf.doc.bom).toBe(false);
		expect(lf.doc.eol).toBe('\n');
	});

	it('reads multi-line values in middle and last fields, with mixed endings and blank lines', () => {
		const text =
			'\uFEFFkey`support_remarks`display_name\r\na`line1\nline2\r\n\r\nline4`x\r\nb`r`first\r\n\r\nthird\r\nc`r`NULL\r\n';
		const { doc } = readItemkeysArchive(text);
		expect(doc.records.map((r) => r.fields)).toEqual([
			['a', 'line1\nline2\n\nline4', 'x'],
			['b', 'r', 'first\n\nthird'],
			['c', 'r', 'NULL']
		]);
		expect(doc.records[0]).toMatchObject({ line: 2, endLine: 5 });
		expect(doc.records[1]).toMatchObject({ line: 6, endLine: 8 });
	});

	it('fails on too many delimiters with the line number', () => {
		const text = rptText(H3, [
			['a', 'b', 'c'],
			['d', 'e', 'f`g']
		]);
		expect(errorsOf(() => readItemkeysArchive(text))).toEqual([
			expect.stringMatching(/^3:Record has 3 delimiters, expected 2/)
		]);
	});

	it('distinguishes NULL, "NULL" in text and empty', () => {
		const { doc } = readItemkeysArchive(
			rptText(H3, [
				['a', 'NULL', ''],
				['b', 'not NULL', 'NULL ']
			])
		);
		expect(doc.records.map((r) => r.fields.slice(1).map(sqlValue))).toEqual([
			[null, ''],
			['not NULL', 'NULL ']
		]);
	});

	it('keeps | inside values and surrounding whitespace exactly', () => {
		const { doc } = readItemkeysArchive(rptText(H3, [['k ', ' (yes|no) ', '  ']]));
		expect(doc.records[0].fields).toEqual(['k ', ' (yes|no) ', '  ']);
	});

	it('rejects empty and duplicate keys', () => {
		const text = rptText(H3, [
			['a', '', ''],
			['', 'x', ''],
			['a', 'y', '']
		]);
		expect(errorsOf(() => readItemkeysArchive(text))).toEqual([
			expect.stringMatching(/^3:Empty key/),
			expect.stringMatching(/^4:Duplicate key \(first seen on line 2\)/)
		]);
	});
});

describe('itemkeys export', () => {
	it('strips the footer and keeps N and the completion time', () => {
		const { doc, warnings } = readItemkeysExport(fixture('itemkeys.excerpt.rpt'));
		expect(doc.records).toHaveLength(28);
		expect(doc.footer).toEqual({
			rowCount: 28,
			completionTime: '2026-11-03T18:06:30.0935360-05:00'
		});
		expect(warnings).toEqual([]);
		const ny = doc.records.find((r) => r.fields[0] === 'EnableMultipleCPTForNYVehicleForm')!;
		expect(ny.fields[2]).toBe('To allow more \n\nthan four CPT in New York Moto vehicle form');
		expect(doc.records.find((r) => r.fields[0] === 'MIPS_MigrateSettings_2021 ')).toBeDefined();
	});

	it('fails when N does not match', () => {
		const text = exportText([
			['a', '', ''],
			['b', '', '']
		]).replace('(2 rows', '(3 rows');
		expect(errorsOf(() => readItemkeysExport(text))).toEqual([
			expect.stringMatching(/Record count 2 does not match footer/)
		]);
	});

	it('warns when the footer is missing', () => {
		const { warnings } = readItemkeysExport(rptText(H3, [['a', '', '']]));
		expect(warnings.map((w) => w.message)).toEqual([expect.stringMatching(/No SSMS footer/)]);
	});

	it('rejects a header mismatch, including the old 5-column header', () => {
		const old = ['key', 'support_remarks', 'display_name', 'description', 'category'];
		expect(errorsOf(() => readItemkeysExport(exportText([['a', '', '', '', '']], old)))).toEqual([
			expect.stringMatching(/^1:Header mismatch/)
		]);
	});
});

describe('additional', () => {
	const row = (k: string, ...rest: string[]) => [k, TS, '', ...rest, '', ''].slice(0, 5);

	it('checks the header against the schema', () => {
		const text = rptText(['key', 'description', 'category'], [['a', '', '']]);
		expect(errorsOf(() => readAdditional(text, schema))).toEqual([
			expect.stringMatching(/Header mismatch/)
		]);
	});

	it('rejects ragged rows and extra fields', () => {
		const ragged = rptText(AH, [row('a'), ['b', TS, ''], row('c')]);
		expect(errorsOf(() => readAdditional(ragged, schema))).toEqual([
			expect.stringMatching(/^3:Record has 6 delimiters, expected 4/)
		]);
		const extra = rptText(AH, [row('a'), [...row('b'), 'x']]);
		expect(errorsOf(() => readAdditional(extra, schema))).toEqual([
			expect.stringMatching(/^3:Record has 5 delimiters/)
		]);
	});

	it('rejects a footer', () => {
		const text = rptText(AH, [row('a')]) + '\r\n(1 rows affected)\r\n';
		expect(errorsOf(() => readAdditional(text, schema))).toEqual([
			expect.stringMatching(/SSMS footer is not allowed/)
		]);
	});

	it('round-trips a multi-line description', () => {
		const text = rptText(AH, [[...row('a').slice(0, 3), 'Line one\n\nLine | three', 'system']]);
		const { doc } = readAdditional(text, schema);
		expect(doc.records[0].fields[3]).toBe('Line one\n\nLine | three');
		expect(writeRpt(doc)).toBe(text);
	});
});

describe('writer', () => {
	const seq = fixture('sync/itemkeys.v2.rpt');
	const body = seq.slice(0, seq.indexOf('\r\n\r\n('));

	it('round-trips an unchanged document byte-for-byte', () => {
		const text = rptText(AH, [
			['a', TS, '', 'x\ny', ''],
			['b', TS, '', '', 'system']
		]);
		expect(writeRpt(readAdditional(text, schema).doc)).toBe(text);
		expect(writeRpt(readItemkeysExport(seq).doc)).toBe(body);
	});

	it('rewrites only the changed record and keeps BOM and CRLF', () => {
		const text = rptText(AH, [
			['a', TS, '', '', ''],
			['b', TS, '', '', ''],
			['c', TS, '', '', '']
		]);
		const { doc } = readAdditional(text, schema);
		doc.records[1] = withFields(doc.records[1], ['b', TS, '', 'new\nlines', 'system']);
		expect(doc.records[0].raw).toBeDefined();
		expect(writeRpt(doc)).toBe(
			rptText(AH, [
				['a', TS, '', '', ''],
				['b', TS, '', 'new\nlines', 'system'],
				['c', TS, '', '', '']
			])
		);
		expect(writeRpt(doc)).toContain('new\r\nlines');
	});

	it('preserves mixed line endings in untouched records', () => {
		const text = '\uFEFFkey`support_remarks`display_name\r\na`x\ny`z\r\nb`r`d\r\n';
		const { doc } = readItemkeysArchive(text);
		doc.records[1] = withFields(doc.records[1], ['b', 'r2', 'd']);
		expect(writeRpt(doc)).toBe('\uFEFFkey`support_remarks`display_name\r\na`x\ny`z\r\nb`r2`d\r\n');
	});

	it('inserts and removes whole records at positions', () => {
		const text = rptText(H3, [
			['a', '', ''],
			['c', '', '']
		]);
		const { doc } = readItemkeysArchive(text);
		doc.records.splice(1, 0, newRecord(['b', '1', '2']));
		doc.records.splice(0, 1);
		expect(writeRpt(doc)).toBe(
			rptText(H3, [
				['b', '1', '2'],
				['c', '', '']
			])
		);
	});

	it('terminates a final record that had no line break before appending', () => {
		const { doc } = readItemkeysArchive('key`support_remarks`display_name\na``');
		doc.records.push(newRecord(['b', '', '']));
		expect(writeRpt(doc)).toBe('key`support_remarks`display_name\na``\nb``\n');
	});

	it('refuses to write a delimiter inside a value', () => {
		const { doc } = readItemkeysArchive(rptText(H3, []));
		doc.records.push(newRecord(['a', 'x`y', '']));
		expect(() => writeRpt(doc)).toThrow(/delimiter/);
	});
});
