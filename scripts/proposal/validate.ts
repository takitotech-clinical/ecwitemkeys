/**
 * proposal-validate Action (PLAN §6.2). Reads the issue from the environment (never from
 * `${{ }}` interpolation): ISSUE_NUMBER, ISSUE_BODY. `--dry-run` prints instead of writing.
 */
import { LABELS } from '../../src/lib/config.ts';
import { FILES, readAdditional } from '../../src/lib/data/files.ts';
import { parseProposal, proposalJsonFromIssueBody } from '../../src/lib/github/proposal.ts';
import { parseArgs, readSchema, readText, run } from '../lib/io.ts';
import { evaluate, renderValidation, VALIDATE_MARKER } from './core.ts';
import { openIssues, setLabels, upsertComment } from './github.ts';

run(async () => {
	const { flags } = parseArgs(process.argv.slice(2));
	const number = Number(process.env.ISSUE_NUMBER);
	const body = process.env.ISSUE_BODY ?? '';
	if (!Number.isInteger(number) || number <= 0) throw new Error('ISSUE_NUMBER is not set');

	const schema = readSchema();
	const doc = readAdditional(readText(FILES.additional), schema).doc;
	const ev = evaluate({ number, body }, doc, schema);

	let others: number[] = [];
	if (ev.key !== null && !flags['dry-run']) {
		others = (await openIssues([LABELS.proposal]))
			.filter((i) => i.number !== number)
			.filter((i) => {
				const p = parseProposal(proposalJsonFromIssueBody(i.body ?? ''));
				return p.ok && p.proposal.key === ev.key;
			})
			.map((i) => i.number);
	}
	const comment = renderValidation(ev, schema, others);
	const valid = ev.errors.length === 0;
	console.log(
		`#${number}: ${valid ? 'valid' : 'invalid'}${ev.stale.length ? ` (stale: ${ev.stale.join(', ')})` : ''}`
	);
	if (flags['dry-run']) {
		console.log(comment);
		return;
	}
	await setLabels(
		number,
		[valid ? LABELS.valid : LABELS.invalid],
		[valid ? LABELS.invalid : LABELS.valid]
	);
	await upsertComment(number, VALIDATE_MARKER, comment);
});
