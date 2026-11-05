/**
 * `pnpm data:build`: validates the sources, joins them and emits the data bundle the app
 * loads (PLAN §3.3). Run before `vite build` / `vite dev`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { GISCUS } from '../src/lib/config.ts';
import { nowTimestamp } from '../src/lib/data/dates.ts';
import { ITEMKEYS_HEADER } from '../src/lib/data/files.ts';
import { join, type ItemsBundle } from '../src/lib/data/join.ts';
import { discussionCounts, token } from './lib/github.ts';
import { parseArgs, printIssues, run, stepSummary } from './lib/io.ts';
import { loadSources } from './lib/load.ts';

const OUT = 'static/data';

run(async () => {
	const { flags } = parseArgs(process.argv.slice(2));
	const src = loadSources();
	printIssues(src.warnings);
	const joined = join(src);
	const { syncState } = joined.diagnostics;
	const outOfSync = syncState.missingActiveRow.length + syncState.activeNotInItemkeys.length;
	if (outOfSync > 0) {
		const msg = `additional.rpt is out of sync with itemkeys.rpt (${outOfSync} keys): run \`pnpm data:sync\``;
		if (flags.strict) throw new Error(msg);
		console.warn(`WARNING ${msg}`);
	}

	let discussions: Record<string, number> = {};
	if (token() && GISCUS.categoryId) {
		try {
			discussions = await discussionCounts();
		} catch (e) {
			console.warn(`WARNING discussion counts unavailable: ${e instanceof Error ? e.message : e}`);
		}
	}

	const bundle: ItemsBundle = { generatedAt: nowTimestamp(), ...joined, discussions };
	const json = JSON.stringify(bundle);
	const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
	const file = `items.${hash}.json`;
	mkdirSync(OUT, { recursive: true });
	for (const f of readdirSync(OUT)) if (/^items\..*\.json$/.test(f)) rmSync(`${OUT}/${f}`);
	writeFileSync(`${OUT}/${file}`, json);
	writeFileSync(`${OUT}/version.json`, JSON.stringify({ file, generatedAt: bundle.generatedAt }));

	const total = bundle.rows.length;
	const iExpired = ITEMKEYS_HEADER.length + src.schema.columns.findIndex((c) => c.id === 'expired');
	const expired = bundle.rows.filter((r) => r[iExpired] !== '').length;
	const d = bundle.diagnostics;
	const ls = bundle.lastSync;
	console.log(
		`Wrote ${OUT}/${file}: ${total} rows (${total - expired} active, ${expired} expired), ${(json.length / 1024).toFixed(0)} KB`
	);
	stepSummary(
		[
			'## Data',
			`| Total | Active | Expired | Discussions |`,
			`| --- | --- | --- | --- |`,
			`| ${total} | ${total - expired} | ${expired} | ${Object.keys(discussions).length} |`,
			'',
			ls
				? `Last sync \`${ls.at}\`: +${ls.added.length} added, ${ls.expired.length} expired, ${ls.possibleRenames.length} possible renames.`
				: 'No sync since adoption.',
			'',
			`Warnings: ${src.warnings.length}; collisions: ${d.collisions.length}; expired without last-known values: ${d.expiredWithoutLastKnown.length}; out of sync: ${outOfSync}.`
		].join('\n')
	);
});
