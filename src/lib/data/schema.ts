/** Column definitions for additional.rpt (PLAN §2.4). */
import { DELIMITER } from './rpt.ts';
import type { Issue } from './types.ts';

/**
 * `timestamp`: managed UTC timestamp. `text`: free text. `enum`: one of `values` or empty.
 * `date`: a plain calendar date `YYYY-MM-DD` (user columns only).
 */
export type ColumnType = 'timestamp' | 'text' | 'enum' | 'date';

export interface ColumnDef {
	id: string;
	label: string;
	type: ColumnType;
	managed?: boolean;
	required?: boolean;
	multiline?: boolean;
	maxLength?: number;
	values?: string[];
	help?: string;
	searchable?: boolean;
	facet?: boolean;
}

export interface Schema {
	version: number;
	columns: ColumnDef[];
}

export const SCHEMA_FILE = 'source/additional.schema.json';
export const DEFAULT_MAX_LENGTH = 500;
const ID_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const TYPES: ColumnType[] = ['timestamp', 'text', 'enum', 'date'];

export function additionalHeader(schema: Schema): string[] {
	return ['key', ...schema.columns.map((c) => c.id)];
}

export function userColumns(schema: Schema): ColumnDef[] {
	return schema.columns.filter((c) => !c.managed);
}

export function maxLengthOf(col: ColumnDef): number {
	return col.maxLength ?? DEFAULT_MAX_LENGTH;
}

export function isSearchable(col: ColumnDef): boolean {
	return col.searchable ?? col.type === 'text';
}

export function isFacet(col: ColumnDef): boolean {
	return col.facet ?? (col.type === 'enum' || col.type === 'timestamp');
}

/** Index of a column within an additional.rpt record (key is field 0). */
export function fieldIndex(schema: Schema, id: string): number {
	const i = schema.columns.findIndex((c) => c.id === id);
	return i === -1 ? -1 : i + 1;
}

export function validateSchema(input: unknown, file = SCHEMA_FILE): Issue[] {
	const issues: Issue[] = [];
	const err = (message: string) => issues.push({ level: 'error', file, message });
	if (typeof input !== 'object' || input === null) {
		err('Schema must be a JSON object');
		return issues;
	}
	const s = input as Partial<Schema>;
	if (typeof s.version !== 'number') err('"version" must be a number');
	if (!Array.isArray(s.columns)) {
		err('"columns" must be an array');
		return issues;
	}
	const ids = new Set<string>();
	let seenUser = false;
	for (const [n, c] of s.columns.entries()) {
		const at = `column ${n + 1}${c && typeof c.id === 'string' ? ` (${c.id})` : ''}`;
		if (typeof c !== 'object' || c === null) {
			err(`${at}: must be an object`);
			continue;
		}
		if (typeof c.id !== 'string' || !ID_RE.test(c.id)) err(`${at}: id must be snake_case`);
		if (c.id === 'key') err(`${at}: "key" is implicit and must not be declared`);
		if (ids.has(c.id)) err(`${at}: duplicate id`);
		ids.add(c.id);
		if (typeof c.label !== 'string' || c.label.trim() === '') err(`${at}: label is required`);
		if (!TYPES.includes(c.type)) err(`${at}: type must be one of ${TYPES.join(', ')}`);
		if (c.managed) {
			if (seenUser) err(`${at}: managed columns must come directly after key`);
			if (c.type !== 'timestamp') err(`${at}: managed columns must be timestamps`);
		} else {
			seenUser = true;
			if (c.type === 'timestamp') err(`${at}: timestamp columns must be managed`);
			if (c.required) err(`${at}: user columns cannot be required`);
		}
		if (c.type === 'enum') {
			if (!Array.isArray(c.values) || c.values.length === 0) {
				err(`${at}: enum values must be a non-empty array`);
			} else {
				for (const v of c.values) {
					if (typeof v !== 'string' || v === '' || v !== v.trim() || v === 'NULL') {
						err(`${at}: invalid enum value ${JSON.stringify(v)}`);
					} else if (v.includes(DELIMITER) || /[\p{Cc}]/u.test(v)) {
						err(`${at}: enum value ${JSON.stringify(v)} contains a forbidden character`);
					}
				}
				if (new Set(c.values).size !== c.values.length) err(`${at}: duplicate enum values`);
			}
		} else if (c.values !== undefined) err(`${at}: "values" is only allowed on enum columns`);
		if (c.multiline && c.type !== 'text') err(`${at}: "multiline" is only allowed on text columns`);
		if (c.maxLength !== undefined && (!Number.isInteger(c.maxLength) || c.maxLength < 1)) {
			err(`${at}: maxLength must be a positive integer`);
		}
	}
	return issues;
}
