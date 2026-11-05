/** `pnpm data:adopt-additional [--now <ts>]`: one-time seed conversion (PLAN §2.7). */
import { adoptSeed } from '../src/lib/data/adopt.ts';
import { isTimestamp, nowTimestamp } from '../src/lib/data/dates.ts';
import { FILES, readAdditional } from '../src/lib/data/files.ts';
import { writeRpt } from '../src/lib/data/rpt.ts';
import { DataError, errorsOf } from '../src/lib/data/types.ts';
import { validateAdditional } from '../src/lib/data/validate.ts';
import { exists, parseArgs, readSchema, readText, run, writeAll } from './lib/io.ts';
import { loadSources } from './lib/load.ts';

run(() => {
	const { flags } = parseArgs(process.argv.slice(2));
	const now = typeof flags.now === 'string' ? flags.now : nowTimestamp();
	if (!isTimestamp(now)) throw new Error(`--now must be YYYY-MM-DDTHH:MM:SSZ, got ${now}`);
	if (exists(FILES.archive))
		throw new Error(`${FILES.archive} already exists; adoption already ran`);
	const schema = readSchema();
	const { additional, archive } = adoptSeed(readText(FILES.additional), schema, now);
	const text = writeRpt(additional);
	const errors = errorsOf(validateAdditional(readAdditional(text, schema).doc, schema));
	if (errors.length > 0) throw new DataError(errors);
	writeAll({ [FILES.additional]: text, [FILES.archive]: writeRpt(archive) });
	const src = loadSources();
	console.log(`Adopted ${src.additional.records.length} rows with added = ${now}.`);
	console.log('Review with: git diff -w --stat && git diff -w source/additional.rpt | head');
});
