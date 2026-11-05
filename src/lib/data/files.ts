/** The three rpt files, each with its own expected header and footer policy (PLAN §3.2). */
import { readRpt, type Eol, type ReadResult, type RptDoc } from './rpt.ts';
import { additionalHeader, type Schema } from './schema.ts';

export const FILES = {
	itemkeys: 'source/itemkeys.rpt',
	additional: 'source/additional.rpt',
	archive: 'source/itemkeys.expired.rpt',
	schema: 'source/additional.schema.json',
	approvers: 'config/approvers.json'
} as const;

export const ITEMKEYS_HEADER = ['key', 'support_remarks', 'display_name'];

/** The SSMS export: footer required, record count checked against it. */
export function readItemkeysExport(text: string, file: string = FILES.itemkeys): ReadResult {
	return readRpt(text, { file, header: ITEMKEYS_HEADER, footer: 'required' });
}

/** itemkeys.expired.rpt: same header as the export, no footer. */
export function readItemkeysArchive(text: string, file: string = FILES.archive): ReadResult {
	return readRpt(text, { file, header: ITEMKEYS_HEADER, footer: 'forbidden' });
}

export function readAdditional(
	text: string,
	schema: Schema,
	file: string = FILES.additional
): ReadResult {
	return readRpt(text, { file, header: additionalHeader(schema), footer: 'forbidden' });
}

/** A header-only document with the seeded conventions (UTF-8 BOM, CRLF). */
export function emptyDoc(file: string, header: string[], eol: Eol = '\r\n', bom = true): RptDoc {
	return { file, bom, eol, header: [...header], records: [], footer: null };
}

/** In itemkeys files only the exact string `NULL` means SQL NULL. */
export function sqlValue(v: string): string | null {
	return v === 'NULL' ? null : v;
}
