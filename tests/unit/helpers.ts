import { readFileSync } from 'node:fs';
import type { ItemsBundle } from '../../src/lib/data/join.ts';
import type { Schema } from '../../src/lib/data/schema.ts';

export const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');

export const schema: Schema = JSON.parse(readFileSync('source/additional.schema.json', 'utf8'));

/** Builds an SSMS-style export (BOM, CRLF, footer) from rows. */
export function exportText(rows: string[][], header = ['key', 'support_remarks', 'display_name']) {
	const body = rows.map((r) => r.join('`').replace(/\n/g, '\r\n')).join('\r\n');
	return `\uFEFF${header.join('`')}\r\n${body}\r\n\r\n(${rows.length} rows affected)\r\n\r\n\r\nCompletion time: 2026-11-03T18:06:30.0935360-05:00\r\n`;
}

/** Builds a managed-format file (BOM, CRLF, no footer). */
export function rptText(header: string[], rows: string[][], eol = '\r\n', bom = true) {
	const lines = [header, ...rows].map((r) => r.join('`').replace(/\n/g, eol));
	return (bom ? '\uFEFF' : '') + lines.join(eol) + eol;
}

/** A data bundle around the given rows. */
export function bundle(rows: (string | null)[][], extra: Partial<ItemsBundle> = {}): ItemsBundle {
	return {
		generatedAt: '2026-12-01T15:00:00Z',
		exportedAt: null,
		itemkeysColumns: ['key', 'support_remarks', 'display_name'],
		additionalSchema: schema,
		rows,
		lastKnown: [],
		discussions: {},
		lastSync: null,
		newAt: null,
		diagnostics: {
			collisions: [],
			whitespaceKeys: [],
			whitespaceValues: [],
			multilineValues: [],
			expiredWithoutLastKnown: [],
			syncState: { missingActiveRow: [], activeNotInItemkeys: [] }
		},
		...extra
	};
}
