import { describe, expect, it } from 'vitest';
import { readAdditional } from '../../src/lib/data/files.ts';
import { writeRpt } from '../../src/lib/data/rpt.ts';
import { additionalHeader } from '../../src/lib/data/schema.ts';
import { buildIssueUrl, MAX_URL_LENGTH } from '../../src/lib/github/issueUrl.ts';
import {
	baseHash,
	encodeProposal,
	parseProposal,
	proposalJsonFromIssueBody,
	type Proposal
} from '../../src/lib/github/proposal.ts';
import {
	applyApproved,
	applyCommitMessage,
	evaluate,
	nodeHash,
	renderValidation,
	type ApprovedIssue
} from '../../scripts/proposal/core.ts';
import { rptText, schema } from './helpers.ts';

const T0 = '2026-11-04T14:00:00Z';
const AH = additionalHeader(schema);
const TEXT = rptText(AH, [
	['HPI', T0, '', '', 'system'],
	['MIPS_MigrateSettings_2023 ', T0, '', 'Old text', ''],
	['Zeta', T0, '2026-12-01T15:00:00Z', '', '']
]);
const doc = () => readAdditional(TEXT, schema).doc;

/** What GitHub renders for a submitted issue form. */
function issueBody(p: Proposal | string, reason = '_No response_') {
	const json = typeof p === 'string' ? p : encodeProposal(p);
	return `### Key\n\n${typeof p === 'string' ? 'x' : p.key.trim()}\n\n### Proposal\n\n\`\`\`json\n${json}\n\`\`\`\n\n### Reason / source\n\n${reason}`;
}

async function proposal(key: string, set: Record<string, string>, seen: Record<string, string>) {
	const base: Record<string, string> = {};
	for (const id of Object.keys(set)) base[id] = await baseHash(seen[id] ?? '');
	return { v: 1, key, base, set } as Proposal;
}

describe('proposal format', () => {
	it('round-trips through an issue body, with a multi-line value and a trailing-space key', async () => {
		const p = await proposal(
			'MIPS_MigrateSettings_2023 ',
			{ description: 'Line one | two\nLine "three"' },
			{ description: 'Old text' }
		);
		const parsed = parseProposal(proposalJsonFromIssueBody(issueBody(p).replace(/\n/g, '\r\n')));
		expect(parsed).toEqual({ ok: true, proposal: p });
	});

	it('rejects malformed proposals', () => {
		expect(parseProposal(null)).toMatchObject({ ok: false });
		expect(parseProposal('{nope')).toEqual({
			ok: false,
			errors: ['The proposal is not valid JSON.']
		});
		expect(
			parseProposal(JSON.stringify({ v: 2, key: 'HPI', base: {}, set: { description: 'x' } }))
		).toEqual({
			ok: false,
			errors: ['Unsupported proposal version 2.', 'Missing or invalid base hash for description.']
		});
	});

	it('computes the same base hash with Web Crypto and node:crypto', async () => {
		for (const v of ['', 'HPI', 'Line 1\nLine 2', 'Café — ünïcode ✓', 'x'.repeat(2000)]) {
			expect(await baseHash(v)).toBe(nodeHash(v));
		}
		expect(nodeHash('')).toBe('sha256:e3b0c44298fc1c14');
	});

	it('fits a 2,000-character description in the issue URL budget', async () => {
		const words = 'The quick brown fox jumps over the lazy dog, then reads item key notes. ';
		const description = words.repeat(40).slice(0, 1990).trim() + '\nEnd.';
		expect(description.length).toBeLessThanOrEqual(2000);
		const p = await proposal('HPI', { description }, {});
		const { url, tooLong } = buildIssueUrl(p, 'Checked against the admin guide.');
		expect(tooLong).toBe(false);
		expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
		expect(url).toMatch(
			/^https:\/\/github\.com\/takitotech-clinical\/ecwitemkeys\/issues\/new\?template=edit-proposal\.yml&title=Edit%3A%20HPI&key=HPI&proposal=/
		);
		const proposalParam = new URL(url).searchParams.get('proposal')!;
		expect(JSON.parse(proposalParam)).toEqual(p);
	});

	it('flags text that would exceed the URL budget', async () => {
		const p = await proposal('HPI', { description: '✓'.repeat(2000) }, {});
		expect(buildIssueUrl(p, '').tooLong).toBe(true);
	});
});

describe('validation Action', () => {
	it('accepts a valid proposal and renders before/after', async () => {
		const p = await proposal(
			'MIPS_MigrateSettings_2023 ',
			{ description: 'New\ntext' },
			{ description: 'Old text' }
		);
		const ev = evaluate({ number: 7, body: issueBody(p) }, doc(), schema);
		expect(ev.errors).toEqual([]);
		expect(ev.stale).toEqual([]);
		const comment = renderValidation(ev, schema, [9]);
		expect(comment).toContain('```text\nOld text\n```');
		expect(comment).toContain('```text\nNew\ntext\n```');
		expect(comment).toContain('Other open proposals for this key: #9');
	});

	it('rejects a managed column, an unknown key, bad values and no-op proposals', async () => {
		const check = async (key: string, set: Record<string, string>) =>
			evaluate({ number: 1, body: issueBody(await proposal(key, set, {})) }, doc(), schema).errors;
		expect(await check('HPI', { expired: '' })).toEqual([
			expect.stringMatching(/^expired: .*managed/)
		]);
		expect(await check('HPI', { key: 'x' })).toEqual([expect.stringMatching(/^key: /)]);
		expect(await check('MIPS_MigrateSettings_2023', { description: 'x' })).toEqual([
			expect.stringMatching(/No item key .* exactly/)
		]);
		expect(await check('HPI', { description: 'has ` tick' })).toEqual([
			expect.stringMatching(/backtick/)
		]);
		expect(await check('HPI', { category: 'system' })).toEqual([
			'The proposal does not change any current value.'
		]);
	});

	it('marks a proposal stale when the value changed after it was prepared', async () => {
		const p = await proposal(
			'MIPS_MigrateSettings_2023 ',
			{ description: 'New' },
			{ description: 'Older text' }
		);
		expect(evaluate({ number: 1, body: issueBody(p) }, doc(), schema).stale).toEqual([
			'description'
		]);
	});
});

describe('apply Action', () => {
	const approved = (
		number: number,
		p: Proposal,
		extra: Partial<ApprovedIssue> = {}
	): ApprovedIssue => ({
		number,
		body: issueBody(p),
		author: 'alice',
		approver: 'TriStarGodAI',
		authorized: true,
		...extra
	});

	it('updates records in place, keeping other lines byte-identical', async () => {
		const p = await proposal('HPI', { description: 'Progress note HPI.\nDo not change.' }, {});
		const { doc: next, outcomes } = applyApproved(doc(), schema, [approved(12, p)]);
		expect(outcomes).toEqual([
			{
				number: 12,
				status: 'applied',
				key: 'HPI',
				columns: ['description'],
				author: 'alice',
				approver: 'TriStarGodAI'
			}
		]);
		const out = writeRpt(next).split('\r\n');
		const orig = TEXT.split('\r\n');
		expect(out[1]).toBe(`HPI\`${T0}\`\`Progress note HPI.`);
		expect(out[2]).toBe('Do not change.`system');
		expect(out.slice(3)).toEqual(orig.slice(2));
		expect(applyCommitMessage(outcomes)).toBe(
			'Apply #12: update description for HPI (proposed by @alice, approved by @TriStarGodAI)'
		);
	});

	it('applies several proposals in one run and detects hash conflicts between them', async () => {
		const a = await proposal('HPI', { description: 'First' }, {});
		const b = await proposal('HPI', { description: 'Second' }, {}); // also based on ''
		const c = await proposal('Zeta', { category: 'system' }, {}); // expired keys stay editable
		const { doc: next, outcomes } = applyApproved(doc(), schema, [
			approved(1, a),
			approved(2, b),
			approved(3, c, { author: 'bob' })
		]);
		expect(outcomes.map((o) => o.status)).toEqual(['applied', 'conflict', 'applied']);
		expect(next.records.map((r) => r.fields[3] + '|' + r.fields[4])).toEqual([
			'First|system',
			'Old text|',
			'|system'
		]);
		expect(next.records[2].fields[2]).toBe('2026-12-01T15:00:00Z');
		expect(applyCommitMessage(outcomes)).toBe(
			'Apply #1, #3: update description for HPI; category for Zeta (proposed by @alice, @bob, approved by @TriStarGodAI)'
		);
	});

	it('refuses unauthorized approvals and invalid proposals', async () => {
		const p = await proposal('HPI', { description: 'x' }, {});
		const bad = await proposal('HPI', { added: T0 }, {});
		const { outcomes } = applyApproved(doc(), schema, [
			approved(1, p, { approver: 'mallory', authorized: false }),
			approved(2, bad)
		]);
		expect(outcomes.map((o) => o.status)).toEqual(['unauthorized', 'invalid']);
		expect(applyCommitMessage(outcomes)).toBeNull();
	});
});

describe('line diff', () => {
	it('keeps unchanged lines and marks removed and added ones', async () => {
		const { lineDiff } = await import('../../src/lib/github/diff.ts');
		expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
			{ op: 'same', text: 'a' },
			{ op: 'del', text: 'b' },
			{ op: 'add', text: 'B' },
			{ op: 'same', text: 'c' },
			{ op: 'add', text: 'd' }
		]);
		expect(lineDiff('', 'x')).toEqual([{ op: 'add', text: 'x' }]);
	});
});
