/**
 * Validation rules (PLAN §3.4). Runs in the browser (live form validation), in
 * `pnpm data:check`, in CI, in sync and in the proposal Actions.
 */
import { isDate, isTimestamp } from './dates.ts';
import { DELIMITER, type RptDoc } from './rpt.ts';
import { maxLengthOf, type ColumnDef, type Schema } from './schema.ts';
import type { Issue } from './types.ts';

/** Control characters other than `\n` (tab and `\r` included). */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const FORBIDDEN_CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/;

/** Length as the user perceives it (code points, not UTF-16 units). */
export function valueLength(v: string): number {
	return [...v].length;
}

/**
 * Checks a user-column value (PLAN §2.3 rule 7). Returns human-readable errors; empty means
 * valid. The empty string means "unset" and is always valid.
 */
export function validateUserValue(col: ColumnDef, value: string): string[] {
	const errors: string[] = [];
	if (value === '') return errors;
	if (value.includes(DELIMITER)) errors.push('The backtick character ` is not allowed.');
	if (FORBIDDEN_CONTROL.test(value)) {
		errors.push(
			value.includes('\t')
				? 'Tab characters are not allowed.'
				: 'Control characters are not allowed.'
		);
	}
	if (value.includes('\n') && !(col.type === 'text' && col.multiline)) {
		errors.push('Line breaks are not allowed in this field.');
	}
	if (value !== value.trim()) {
		errors.push(
			value.endsWith('\n')
				? 'Must not end with a line break (blank line between records?).'
				: 'Must not start or end with whitespace.'
		);
	}
	if (value === 'NULL') errors.push('The exact value NULL is not allowed; leave the field empty.');
	const max = maxLengthOf(col);
	if (valueLength(value) > max) errors.push(`At most ${max} characters.`);
	if (col.type === 'enum' && !(col.values ?? []).includes(value)) {
		errors.push(`Must be one of: ${(col.values ?? []).join(', ')} (or empty).`);
	}
	if (col.type === 'date' && !isDate(value)) errors.push('Must be a date YYYY-MM-DD.');
	return errors;
}

/** Normalizes form input before validation: CRLF/CR → LF, then trims the whole value. */
export function normalizeInput(v: string): string {
	return v.replace(/\r\n?/g, '\n').trim();
}

/** Groups of distinct keys that collide case-insensitively or after trimming. */
export function keyCollisions(keys: Iterable<string>): string[][] {
	const groups = new Map<string, string[]>();
	for (const k of keys) {
		const n = k.trim().toLowerCase();
		const g = groups.get(n);
		if (g) g.push(k);
		else groups.set(n, [k]);
	}
	return [...groups.values()].filter((g) => g.length > 1);
}

/** itemkeys.rpt and itemkeys.expired.rpt (header, delimiters, N and keys are checked on read). */
export function validateItemkeys(doc: RptDoc): Issue[] {
	return keyCollisions(doc.records.map((r) => r.fields[0])).map((g) => ({
		level: 'warning' as const,
		file: doc.file,
		key: g[0],
		message: `Keys differ only by case or surrounding whitespace: ${g.map((k) => JSON.stringify(k)).join(', ')}`
	}));
}

/** additional.rpt against its schema, optionally cross-checked with the expired archive. */
export function validateAdditional(doc: RptDoc, schema: Schema, archive?: RptDoc | null): Issue[] {
	const issues: Issue[] = [];
	const cols = schema.columns;
	const iAdded = cols.findIndex((c) => c.id === 'added') + 1;
	const iExpired = cols.findIndex((c) => c.id === 'expired') + 1;
	for (const r of doc.records) {
		const key = r.fields[0];
		const at = { file: doc.file, line: r.line || undefined, endLine: r.endLine || undefined, key };
		cols.forEach((col, ci) => {
			const v = r.fields[ci + 1];
			if (col.managed) {
				if (v === '') {
					if (col.required)
						issues.push({ level: 'error', ...at, message: `${col.id} is required` });
				} else if (!isTimestamp(v)) {
					issues.push({
						level: 'error',
						...at,
						message: `${col.id} must be a UTC timestamp YYYY-MM-DDTHH:MM:SSZ`,
						snippet: v
					});
				}
			} else {
				for (const e of validateUserValue(col, v)) {
					issues.push({
						level: 'error',
						...at,
						message: `${col.id}: ${e}`,
						snippet: v.slice(0, 80)
					});
				}
			}
		});
		if (iAdded > 0 && iExpired > 0) {
			const added = r.fields[iAdded];
			const expired = r.fields[iExpired];
			if (expired !== '' && isTimestamp(expired) && isTimestamp(added) && expired < added) {
				issues.push({
					level: 'error',
					...at,
					message: `expired (${expired}) is before added (${added})`
				});
			}
		}
	}
	issues.push(...validateItemkeys(doc));
	if (archive && iExpired > 0) {
		const expiredOf = new Map(doc.records.map((r) => [r.fields[0], r.fields[iExpired]]));
		for (const r of archive.records) {
			const key = r.fields[0];
			const e = expiredOf.get(key);
			if (e === undefined || e === '') {
				issues.push({
					level: 'error',
					file: archive.file,
					line: r.line,
					key,
					message:
						e === undefined
							? 'Archived key has no row in additional.rpt'
							: 'Archived key is not expired in additional.rpt'
				});
			}
		}
	}
	return issues;
}

/**
 * Checks a proposal's `set` (column id → new value): only existing user columns, with valid
 * values. Returns errors keyed by column id (`_` for proposal-level errors).
 */
export function validateProposedSet(
	schema: Schema,
	set: Record<string, unknown>
): Record<string, string[]> {
	const errors: Record<string, string[]> = {};
	const add = (k: string, m: string) => (errors[k] ??= []).push(m);
	const ids = Object.keys(set);
	if (ids.length === 0) add('_', 'The proposal does not change anything.');
	for (const id of ids) {
		const col = schema.columns.find((c) => c.id === id);
		if (id === 'key') add(id, 'The key cannot be edited.');
		else if (!col) add(id, `Unknown column "${id}".`);
		else if (col.managed) add(id, `${col.label} is managed by the app and cannot be edited.`);
		else if (typeof set[id] !== 'string') add(id, 'Value must be a string.');
		else for (const e of validateUserValue(col, set[id] as string)) add(id, e);
	}
	return errors;
}
