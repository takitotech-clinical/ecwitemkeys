/**
 * Proposal logic for the GitHub Actions (PLAN §6.2, §6.4), free of network calls so it can be
 * tested against fixture payloads.
 */
import { createHash } from 'node:crypto';
import { keyIndex, withFields, type RptDoc } from '../../src/lib/data/rpt.ts';
import { fieldIndex, type Schema } from '../../src/lib/data/schema.ts';
import {
	checkProposal,
	parseProposal,
	proposalJsonFromIssueBody,
	type Proposal
} from '../../src/lib/github/proposal.ts';

export const VALIDATE_MARKER = '<!-- ecwitemkeys:proposal-validate -->';

/** Base hash with node:crypto; must equal the browser's Web Crypto result. */
export function nodeHash(value: string): string {
	return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)}`;
}

export interface IssueInput {
	number: number;
	body: string;
}

export interface Evaluation {
	number: number;
	key: string | null;
	errors: string[];
	/** Changed fields whose current value differs from the proposal's base. */
	stale: string[];
	proposal?: Proposal;
	current?: string[];
}

export function evaluate(issue: IssueInput, doc: RptDoc, schema: Schema): Evaluation {
	const parsed = parseProposal(proposalJsonFromIssueBody(issue.body));
	if (!parsed.ok) return { number: issue.number, key: null, errors: parsed.errors, stale: [] };
	const p = parsed.proposal;
	const idx = keyIndex(doc).get(p.key);
	const current = idx === undefined ? undefined : doc.records[idx].fields;
	const errors = checkProposal(p, schema, current);
	const stale =
		current && errors.length === 0
			? Object.keys(p.set).filter((id) => nodeHash(current[fieldIndex(schema, id)]) !== p.base[id])
			: [];
	return { number: issue.number, key: p.key, errors, stale, proposal: p, current };
}

function block(v: string): string {
	return v === '' ? '_(empty)_' : '```text\n' + v + '\n```';
}

/** The single bot comment on a proposal issue. */
export function renderValidation(ev: Evaluation, schema: Schema, others: number[]): string {
	const lines = [VALIDATE_MARKER];
	if (ev.errors.length > 0) {
		lines.push('### ❌ This proposal can’t be applied', '', ...ev.errors.map((e) => `- ${e}`));
	} else {
		lines.push(`### ✅ Valid proposal for \`${JSON.stringify(ev.key)}\``, '');
		for (const [id, v] of Object.entries(ev.proposal!.set)) {
			const col = schema.columns.find((c) => c.id === id)!;
			const before = ev.current![fieldIndex(schema, id)];
			lines.push(
				`#### ${col.label}`,
				'',
				'**Current**',
				'',
				block(before),
				'',
				'**Proposed**',
				'',
				block(v),
				''
			);
		}
		if (ev.stale.length > 0) {
			lines.push(
				`⚠️ **Stale:** ${ev.stale.join(', ')} changed after this proposal was prepared. A maintainer should check the current value before approving.`,
				''
			);
		}
		lines.push('A maintainer will review it. Editing this issue re-runs validation.');
	}
	if (others.length > 0) {
		lines.push('', `Other open proposals for this key: ${others.map((n) => `#${n}`).join(', ')}`);
	}
	return lines.join('\n');
}

export interface ApprovedIssue extends IssueInput {
	author: string;
	approver: string | null;
	/** Approver is in config/approvers.json and has triage or higher on the repo. */
	authorized: boolean;
}

export type Outcome =
	| {
			number: number;
			status: 'applied';
			key: string;
			columns: string[];
			author: string;
			approver: string;
	  }
	| { number: number; status: 'unauthorized' | 'invalid' | 'conflict'; message: string };

/**
 * Applies approved proposals in order, each against the result of the previous ones. Only the
 * touched records change; managed columns are never written.
 */
export function applyApproved(
	doc: RptDoc,
	schema: Schema,
	issues: ApprovedIssue[]
): { doc: RptDoc; outcomes: Outcome[] } {
	let current = { ...doc, records: [...doc.records] };
	const outcomes: Outcome[] = [];
	for (const issue of issues) {
		if (!issue.authorized || !issue.approver) {
			outcomes.push({
				number: issue.number,
				status: 'unauthorized',
				message: `The \`approved\` label was added by ${issue.approver ? `@${issue.approver}` : 'an unknown user'}, who is not an approver.`
			});
			continue;
		}
		const ev = evaluate(issue, current, schema);
		if (ev.errors.length > 0) {
			outcomes.push({ number: issue.number, status: 'invalid', message: ev.errors.join('\n') });
			continue;
		}
		if (ev.stale.length > 0) {
			const details = ev.stale
				.map((id) => {
					const col = schema.columns.find((c) => c.id === id)!;
					return `#### ${col.label}\n\n**Current**\n\n${block(ev.current![fieldIndex(schema, id)])}\n\n**Proposed**\n\n${block(ev.proposal!.set[id])}`;
				})
				.join('\n\n');
			outcomes.push({
				number: issue.number,
				status: 'conflict',
				message: `The current value changed after this proposal was prepared, so it was not applied. Open a new proposal from the app if it is still needed.\n\n${details}`
			});
			continue;
		}
		const p = ev.proposal!;
		const idx = keyIndex(current).get(p.key)!;
		const fields = [...current.records[idx].fields];
		for (const [id, v] of Object.entries(p.set)) fields[fieldIndex(schema, id)] = v;
		current = { ...current, records: [...current.records] };
		current.records[idx] = withFields(current.records[idx], fields);
		outcomes.push({
			number: issue.number,
			status: 'applied',
			key: p.key,
			columns: Object.keys(p.set),
			author: issue.author,
			approver: issue.approver
		});
	}
	return { doc: current, outcomes };
}

export function applyCommitMessage(outcomes: Outcome[]): string | null {
	const applied = outcomes.filter((o) => o.status === 'applied');
	if (applied.length === 0) return null;
	const nums = applied.map((o) => `#${o.number}`).join(', ');
	const what = applied.map((o) => `${o.columns.join(', ')} for ${o.key}`).join('; ');
	const uniq = (xs: string[]) => [...new Set(xs)].map((x) => `@${x}`).join(', ');
	return `Apply ${nums}: update ${what} (proposed by ${uniq(applied.map((o) => o.author))}, approved by ${uniq(applied.map((o) => o.approver))})`;
}
