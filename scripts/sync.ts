/**
 * `pnpm data:sync [--now <ts>] [--previous-ref <ref>] [--dry-run]`: applies source/itemkeys.rpt
 * to additional.rpt and itemkeys.expired.rpt (PLAN §2.6).
 *
 * The previous export (for last-known values of expiring keys) is read from git at
 * `--previous-ref` (default HEAD; CI passes github.event.before).
 */
import {
	isTimestamp,
	nowTimestamp,
	parseCompletionTime,
	toTimestamp
} from '../src/lib/data/dates.ts';
import {
	FILES,
	readAdditional,
	readItemkeysArchive,
	readItemkeysExport
} from '../src/lib/data/files.ts';
import { writeRpt, type RptDoc } from '../src/lib/data/rpt.ts';
import { sync, type SyncResult } from '../src/lib/data/sync.ts';
import { DataError, errorsOf } from '../src/lib/data/types.ts';
import { validateAdditional } from '../src/lib/data/validate.ts';
import {
	gitShow,
	parseArgs,
	printIssues,
	run,
	stepOutput,
	stepSummary,
	writeAll
} from './lib/io.ts';
import { loadSources } from './lib/load.ts';

function commitMessage(r: SyncResult, itemkeys: RptDoc): string {
	const exported = itemkeys.footer?.completionTime
		? parseCompletionTime(itemkeys.footer.completionTime)
		: null;
	const at = exported ? `export ${toTimestamp(exported)}` : 'export time unknown';
	return `Sync itemkeys (${at}): +${r.added.length} added, ${r.expired.length} expired, ${r.returned.length} returned`;
}

function summary(r: SyncResult, now: string, message: string): string {
	const list = (title: string, keys: string[]) =>
		keys.length === 0
			? ''
			: `\n<details><summary>${title} (${keys.length})</summary>\n\n${keys.map((k) => `- \`${JSON.stringify(k)}\``).join('\n')}\n\n</details>\n`;
	return [
		`## ${message}`,
		`Sync time: \`${now}\``,
		list('Added', r.added),
		list('Expired', r.expired),
		list('Returned', r.returned),
		list(
			'Possible renames',
			r.possibleRenames.map(([a, e]) => `${a} ← ${e}`)
		),
		list('Expired without last-known values', r.missingLastKnown)
	].join('\n');
}

run(() => {
	const { flags } = parseArgs(process.argv.slice(2));
	const now = typeof flags.now === 'string' ? flags.now : nowTimestamp();
	if (!isTimestamp(now)) throw new Error(`--now must be YYYY-MM-DDTHH:MM:SSZ, got ${now}`);
	const ref = typeof flags['previous-ref'] === 'string' ? flags['previous-ref'] : 'HEAD';

	const src = loadSources();
	printIssues(src.warnings);

	let previous: RptDoc | null = null;
	const prevText = gitShow(ref, FILES.itemkeys);
	if (prevText === null)
		console.warn(`WARNING no previous export at ${ref}; expiring keys get no last-known values`);
	else {
		try {
			previous = readItemkeysExport(prevText, `${ref}:${FILES.itemkeys}`).doc;
		} catch (e) {
			console.warn(
				`WARNING previous export at ${ref} is unreadable; expiring keys get no last-known values`
			);
			if (e instanceof DataError) printIssues(e.issues.map((i) => ({ ...i, level: 'warning' })));
		}
	}

	const result = sync({ ...src, previous, now });
	const message = commitMessage(result, src.itemkeys);
	console.log(result.changed ? message : 'No changes.');
	for (const [a, e] of result.possibleRenames) {
		console.warn(`WARNING possible rename: ${JSON.stringify(e)} → ${JSON.stringify(a)}`);
	}

	const additionalText = writeRpt(result.additional);
	const archiveText = writeRpt(result.archive);
	// Re-read what will be written: abort before writing anything if it isn't valid.
	const additional = readAdditional(additionalText, src.schema).doc;
	const archive = readItemkeysArchive(archiveText).doc;
	const errors = errorsOf(validateAdditional(additional, src.schema, archive));
	if (errors.length > 0) throw new DataError(errors);

	const changed = additionalText !== src.texts.additional || archiveText !== src.texts.archive;
	stepOutput('changed', String(changed));
	stepOutput('message', message);
	if (!changed) return;
	stepSummary(summary(result, now, message));
	if (flags['dry-run']) {
		console.log(summary(result, now, message));
		return;
	}
	writeAll({ [FILES.additional]: additionalText, [FILES.archive]: archiveText });
});
