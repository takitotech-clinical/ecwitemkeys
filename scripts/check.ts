/**
 * `pnpm data:check`: the full validation CI runs (PLAN §3.4). An out-of-sync additional.rpt is
 * a warning unless `--strict` is given.
 */
import { join } from '../src/lib/data/join.ts';
import { printIssues, parseArgs, run } from './lib/io.ts';
import { loadSources } from './lib/load.ts';

run(() => {
	const { flags } = parseArgs(process.argv.slice(2));
	const src = loadSources();
	printIssues(src.warnings);
	const { syncState } = join(src).diagnostics;
	const outOfSync = syncState.missingActiveRow.length + syncState.activeNotInItemkeys.length;
	if (outOfSync > 0) {
		const msg = `additional.rpt is out of sync with itemkeys.rpt (${syncState.missingActiveRow.length} keys without an active row, ${syncState.activeNotInItemkeys.length} active rows not in itemkeys): run \`pnpm data:sync\``;
		if (flags.strict) throw new Error(msg);
		console.warn(`WARNING ${msg}`);
		if (process.env.GITHUB_ACTIONS) console.log(`::warning::${msg}`);
	}
	console.log(
		`OK: ${src.itemkeys.records.length} itemkeys, ${src.additional.records.length} additional rows, ${src.archive.records.length} archived, ${src.warnings.length} warnings`
	);
});
