/**
 * Edit proposals (PLAN §6.1): a versioned JSON with the new values of changed user columns and,
 * per field, a base hash of the value the proposer saw (for conflict detection).
 */
import { fieldIndex, type Schema } from '../data/schema.ts';
import { validateProposedSet } from '../data/validate.ts';

export interface Proposal {
	v: 1;
	key: string;
	/** Column id → `sha256:<16 hex>` of the value the proposer saw. */
	base: Record<string, string>;
	/** Column id → new value (line breaks as `\n`). */
	set: Record<string, string>;
}

const HASH_RE = /^sha256:[0-9a-f]{16}$/;

function hex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base hash with Web Crypto (browser; also available in Node). */
export async function baseHash(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return `sha256:${hex(digest).slice(0, 16)}`;
}

export function encodeProposal(p: Proposal): string {
	return JSON.stringify(p, null, 2);
}

/**
 * Extracts the proposal JSON from an issue-form body: the `### Proposal` section, inside a
 * code fence when GitHub rendered it with `render: json`.
 */
export function proposalJsonFromIssueBody(body: string): string | null {
	const m = /(?:^|\n)###\s+Proposal\s*\n([\s\S]*?)(?=\n###\s|$)/.exec(body.replace(/\r\n/g, '\n'));
	if (!m) return null;
	const section = m[1].trim();
	const fence = /^```[a-z]*\n([\s\S]*?)\n```/.exec(section);
	return (fence ? fence[1] : section).trim() || null;
}

export type ParsedProposal = { ok: true; proposal: Proposal } | { ok: false; errors: string[] };

/** Structural checks only (no data needed). */
export function parseProposal(json: string | null): ParsedProposal {
	if (json === null) return { ok: false, errors: ['No proposal JSON found in the issue.'] };
	let p: unknown;
	try {
		p = JSON.parse(json);
	} catch {
		return { ok: false, errors: ['The proposal is not valid JSON.'] };
	}
	const errors: string[] = [];
	const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
	if (o.v !== 1) errors.push(`Unsupported proposal version ${JSON.stringify(o.v)}.`);
	if (typeof o.key !== 'string' || o.key === '') errors.push('The proposal has no key.');
	const isMap = (x: unknown): x is Record<string, unknown> =>
		typeof x === 'object' && x !== null && !Array.isArray(x);
	if (!isMap(o.set)) errors.push('"set" must be an object.');
	if (!isMap(o.base)) errors.push('"base" must be an object.');
	if (isMap(o.set) && isMap(o.base)) {
		for (const id of Object.keys(o.set)) {
			const h = o.base[id];
			if (typeof h !== 'string' || !HASH_RE.test(h))
				errors.push(`Missing or invalid base hash for ${id}.`);
		}
		for (const [id, v] of Object.entries(o.set)) {
			if (typeof v !== 'string') errors.push(`Value for ${id} must be a string.`);
		}
	}
	return errors.length > 0
		? { ok: false, errors }
		: { ok: true, proposal: o as unknown as Proposal };
}

/**
 * Checks a parsed proposal against the schema and the key's current additional.rpt record
 * (`undefined` if the key has no row).
 */
export function checkProposal(
	p: Proposal,
	schema: Schema,
	current: string[] | undefined
): string[] {
	const errors: string[] = [];
	if (!current) {
		errors.push(`No item key ${JSON.stringify(p.key)} exists (keys must match exactly).`);
		return errors;
	}
	for (const [id, msgs] of Object.entries(validateProposedSet(schema, p.set))) {
		for (const m of msgs) errors.push(id === '_' ? m : `${id}: ${m}`);
	}
	if (errors.length === 0) {
		const changed = Object.entries(p.set).some(([id, v]) => current[fieldIndex(schema, id)] !== v);
		if (!changed) errors.push('The proposal does not change any current value.');
	}
	return errors;
}

/** Fields whose current value no longer matches the proposal's base hash. */
export async function staleFields(
	p: Proposal,
	schema: Schema,
	current: string[],
	hash: (v: string) => string | Promise<string> = baseHash
): Promise<string[]> {
	const stale: string[] = [];
	for (const id of Object.keys(p.set)) {
		const i = fieldIndex(schema, id);
		if (i < 0) continue;
		if ((await hash(current[i])) !== p.base[id]) stale.push(id);
	}
	return stale;
}
