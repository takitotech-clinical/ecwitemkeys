/**
 * Strict reader and minimal-diff writer for backtick-delimited SSMS "results to file" exports
 * (PLAN §3.2). Shared by the app build, the maintainer scripts and the GitHub Actions.
 */
import { DataError, type Issue } from './types.ts';

/** The field delimiter of every rpt file. Values may never contain it. */
export const DELIMITER = '`';

export type Eol = '\r\n' | '\n';

export interface Footer {
	/** N from `(N rows affected)`. */
	rowCount: number;
	/** The raw `Completion time: …` value, e.g. `2026-11-03T18:06:30.0935360-05:00`. */
	completionTime: string | null;
}

export interface RptRecord {
	/** One value per header column. Inner line breaks are normalized to `\n`. */
	fields: string[];
	/**
	 * The record's exact original text, including its terminating line break (empty at EOF).
	 * `undefined` means the record is new or changed and is written canonically.
	 */
	raw?: string;
	/** Physical line numbers in the source file (1-based); 0 for records created in memory. */
	line: number;
	endLine: number;
}

export interface RptDoc {
	file: string;
	bom: boolean;
	eol: Eol;
	header: string[];
	/** The header's exact original text including its line break; `undefined` once changed. */
	headerRaw?: string;
	records: RptRecord[];
	footer: Footer | null;
}

export interface ReadOptions {
	/** Name used in error messages. */
	file: string;
	/** The exact expected header. */
	header: string[];
	/**
	 * `required`: an SSMS footer is expected; it is stripped and its row count checked
	 * (missing → warning). `forbidden`: a footer is a hard error.
	 */
	footer: 'required' | 'forbidden';
}

export interface ReadResult {
	doc: RptDoc;
	warnings: Issue[];
}

const FOOTER_RE = /\r?\n\r?\n\((\d+) rows? affected\)\r?\n[\s\S]*$/;
const COMPLETION_RE = /Completion time: ([^\r\n]*)/;
const MAX_ERRORS = 50;

interface PhysicalLine {
	text: string;
	/** The line's terminator: `\r\n`, `\n`, or `` for a final line without one. */
	term: string;
}

function splitLines(text: string): PhysicalLine[] {
	const lines: PhysicalLine[] = [];
	let start = 0;
	while (start < text.length) {
		const nl = text.indexOf('\n', start);
		if (nl === -1) {
			lines.push({ text: text.slice(start), term: '' });
			break;
		}
		const cr = nl > start && text.charCodeAt(nl - 1) === 13;
		lines.push({ text: text.slice(start, cr ? nl - 1 : nl), term: cr ? '\r\n' : '\n' });
		start = nl + 1;
	}
	return lines;
}

function countDelimiters(s: string): number {
	let n = 0;
	for (let i = s.indexOf(DELIMITER); i !== -1; i = s.indexOf(DELIMITER, i + 1)) n++;
	return n;
}

function detectEol(text: string): Eol {
	let crlf = 0;
	let lf = 0;
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
		if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++;
		else lf++;
	}
	return crlf >= lf && crlf > 0 ? '\r\n' : '\n';
}

function snippet(s: string, max = 80): string {
	return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Reads an rpt file strictly. Throws {@link DataError} listing every error found. */
export function readRpt(input: string, opts: ReadOptions): ReadResult {
	const { file } = opts;
	const errors: Issue[] = [];
	const warnings: Issue[] = [];
	const fail = (issue: Omit<Issue, 'level' | 'file'>) => {
		if (errors.length < MAX_ERRORS) errors.push({ level: 'error', file, ...issue });
	};

	const bom = input.charCodeAt(0) === 0xfeff;
	let text = bom ? input.slice(1) : input;
	const eol = detectEol(text);

	let footer: Footer | null = null;
	const fm = FOOTER_RE.exec(text);
	if (fm) {
		const footerLine = text.slice(0, fm.index).split('\n').length + 2;
		if (opts.footer === 'forbidden') {
			fail({
				line: footerLine,
				message: 'SSMS footer is not allowed in this file',
				snippet: snippet(fm[0].trim())
			});
		} else {
			const cm = COMPLETION_RE.exec(fm[0]);
			footer = { rowCount: Number(fm[1]), completionTime: cm ? cm[1].trim() : null };
		}
		text = text.slice(0, fm.index);
	} else if (opts.footer === 'required') {
		warnings.push({
			level: 'warning',
			file,
			message: 'No SSMS footer found; the record count check is skipped'
		});
	}

	const lines = splitLines(text);
	if (lines.length === 0) {
		throw new DataError([{ level: 'error', file, line: 1, message: 'File is empty' }]);
	}

	const expectedHeader = opts.header.join(DELIMITER);
	if (lines[0].text !== expectedHeader) {
		throw new DataError([
			{
				level: 'error',
				file,
				line: 1,
				message: `Header mismatch: expected ${JSON.stringify(expectedHeader)}`,
				snippet: lines[0].text
			}
		]);
	}
	const headerRaw = lines[0].text + lines[0].term;

	const need = opts.header.length - 1;
	const records: RptRecord[] = [];
	const seen = new Map<string, number>();
	let i = 1;
	while (i < lines.length) {
		const start = i;
		let value = lines[i].text;
		let raw = lines[i].text + lines[i].term;
		let count = countDelimiters(lines[i].text);
		i++;
		const append = () => {
			value += '\n' + lines[i].text;
			raw += lines[i].text + lines[i].term;
			count += countDelimiters(lines[i].text);
			i++;
		};
		while (count < need && i < lines.length) append();
		if (count > need) {
			fail({
				line: start + 1,
				endLine: i,
				key: value.split(DELIMITER, 1)[0],
				message: `Record has ${count} delimiters, expected ${need} (ragged row or extra field)`,
				snippet: snippet(value)
			});
			continue;
		}
		if (count < need) {
			fail({
				line: start + 1,
				endLine: i,
				message: `Incomplete record at end of file: ${count} delimiters, expected ${need}`,
				snippet: snippet(value)
			});
			break;
		}
		// A complete record absorbs following lines that have no delimiter: they continue the
		// last field (keys never contain line breaks, values never contain the delimiter).
		while (i < lines.length && countDelimiters(lines[i].text) === 0) append();

		const fields = value.split(DELIMITER);
		const key = fields[0];
		const at = { line: start + 1, endLine: i, key };
		if (key === '') fail({ ...at, message: 'Empty key', snippet: snippet(value) });
		else if (key.includes('\n')) {
			fail({ ...at, message: 'Key contains a line break', snippet: snippet(value) });
		} else if (seen.has(key)) {
			fail({ ...at, message: `Duplicate key (first seen on line ${seen.get(key)})` });
		} else seen.set(key, start + 1);
		records.push({ fields, raw, line: start + 1, endLine: i });
	}

	if (footer && records.length !== footer.rowCount) {
		fail({
			message: `Record count ${records.length} does not match footer "(${footer.rowCount} rows affected)"; the export may be cut off`
		});
	}

	if (errors.length > 0) throw new DataError(errors);
	return {
		doc: { file, bom, eol, header: [...opts.header], headerRaw, records, footer },
		warnings
	};
}

/** Serializes one record's fields canonically (inner `\n` → `eol`), without a terminator. */
export function serializeRecord(fields: string[], eol: Eol): string {
	for (const f of fields) {
		if (f.includes(DELIMITER)) {
			throw new Error(`Refusing to write a value containing the delimiter: ${snippet(f)}`);
		}
	}
	return fields.join(DELIMITER).replace(/\r?\n/g, eol);
}

/**
 * Writes a document. Unchanged records (and the header) are emitted byte-for-byte; new or
 * changed records are written canonically with the document's line ending. No footer.
 */
export function writeRpt(doc: RptDoc): string {
	const parts: string[] = [];
	if (doc.bom) parts.push('\uFEFF');
	let header = doc.headerRaw ?? serializeRecord(doc.header, doc.eol) + doc.eol;
	if (doc.records.length > 0 && !header.endsWith('\n')) header += doc.eol;
	parts.push(header);
	const last = doc.records.length - 1;
	doc.records.forEach((r, idx) => {
		if (r.raw === undefined) {
			parts.push(serializeRecord(r.fields, doc.eol) + doc.eol);
		} else {
			parts.push(idx < last && !r.raw.endsWith('\n') ? r.raw + doc.eol : r.raw);
		}
	});
	return parts.join('');
}

/** A record created in memory (written canonically). */
export function newRecord(fields: string[]): RptRecord {
	return { fields: [...fields], line: 0, endLine: 0 };
}

/** Returns `rec` unchanged if `fields` are equal, else a copy that will be rewritten. */
export function withFields(rec: RptRecord, fields: string[]): RptRecord {
	if (fields.length === rec.fields.length && fields.every((f, i) => f === rec.fields[i])) {
		return rec;
	}
	return { fields: [...fields], line: rec.line, endLine: rec.endLine };
}

/** Shallow copy whose records array can be modified without affecting `doc`. */
export function cloneDoc(doc: RptDoc): RptDoc {
	return { ...doc, header: [...doc.header], records: [...doc.records] };
}

/** Maps each key to its record index. */
export function keyIndex(doc: RptDoc): Map<string, number> {
	const m = new Map<string, number>();
	doc.records.forEach((r, i) => m.set(r.fields[0], i));
	return m;
}
