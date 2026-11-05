/**
 * proposal-apply Action (PLAN §6.4): applies every open approved proposal in one commit.
 * `--dry-run` prints the outcome and the resulting diff without writing or calling GitHub's
 * write APIs.
 */
import { execFileSync } from 'node:child_process';
import { LABELS, REPO_URL } from '../../src/lib/config.ts';
import { FILES, readAdditional } from '../../src/lib/data/files.ts';
import { writeRpt } from '../../src/lib/data/rpt.ts';
import { DataError, errorsOf } from '../../src/lib/data/types.ts';
import { validateAdditional } from '../../src/lib/data/validate.ts';
import {
	parseArgs,
	readSchema,
	readText,
	run,
	stepOutput,
	stepSummary,
	writeAll
} from '../lib/io.ts';
import { applyApproved, applyCommitMessage, type ApprovedIssue } from './core.ts';
import { approverOf, canTriage, closeIssue, openIssues, postComment, setLabels } from './github.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

run(async () => {
	const { flags } = parseArgs(process.argv.slice(2));
	const dry = Boolean(flags['dry-run']);
	const approvers: string[] = JSON.parse(readText(FILES.approvers));
	const schema = readSchema();
	const before = readText(FILES.additional);
	const doc = readAdditional(before, schema).doc;

	const issues: ApprovedIssue[] = [];
	for (const i of await openIssues([LABELS.proposal, LABELS.approved])) {
		const approver = await approverOf(i.number);
		const authorized =
			approver !== null &&
			approvers.some((a) => a.toLowerCase() === approver.toLowerCase()) &&
			(await canTriage(approver));
		issues.push({
			number: i.number,
			body: i.body ?? '',
			author: i.user?.login ?? 'ghost',
			approver,
			authorized
		});
	}
	if (issues.length === 0) {
		console.log('No approved proposals.');
		stepOutput('applied', 'false');
		return;
	}

	const { doc: next, outcomes } = applyApproved(doc, schema, issues);
	for (const o of outcomes) console.log(`#${o.number}: ${o.status}`);
	const message = applyCommitMessage(outcomes);
	const after = writeRpt(next);
	if (message) {
		const reread = readAdditional(after, schema).doc;
		const errors = errorsOf(validateAdditional(reread, schema));
		if (errors.length > 0) throw new DataError(errors);
	}

	if (dry) {
		const a = before.split('\r\n');
		const b = after.split('\r\n');
		for (let k = 0; k < Math.max(a.length, b.length); k++) {
			if (a[k] !== b[k]) console.log(`- ${JSON.stringify(a[k])}\n+ ${JSON.stringify(b[k])}`);
		}
		if (message) console.log(message);
		return;
	}

	let sha: string | null = null;
	if (message) {
		writeAll({ [FILES.additional]: after });
		execFileSync('pnpm', ['data:check'], { stdio: 'inherit' });
		git('config', 'user.name', 'github-actions[bot]');
		git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
		git('add', FILES.additional);
		git('commit', '-m', message);
		git('push', 'origin', 'HEAD:main');
		sha = git('rev-parse', 'HEAD');
	}

	for (const o of outcomes) {
		if (o.status === 'applied') {
			await postComment(
				o.number,
				`Applied in ${REPO_URL}/commit/${sha}. The site will update shortly.`
			);
			await setLabels(o.number, [LABELS.applied], [LABELS.approved, LABELS.conflict]);
			await closeIssue(o.number, 'completed');
		} else {
			const label =
				o.status === 'conflict' ? LABELS.conflict : o.status === 'invalid' ? LABELS.invalid : null;
			await setLabels(o.number, label ? [label] : [], [LABELS.approved]);
			await postComment(o.number, o.message);
		}
	}
	stepOutput('applied', String(sha !== null));
	stepSummary(
		[
			`## Proposals`,
			...outcomes.map((o) => `- #${o.number}: ${o.status}`),
			message ? `\nCommit: ${sha}` : ''
		].join('\n')
	);
});
