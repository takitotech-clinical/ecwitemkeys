/**
 * Column maintenance (PLAN §2.8):
 *   pnpm data:add-column <id> --type text|enum|date [--multiline] [--values a,b] [--label "…"] [--max-length N] [--help "…"]
 *   pnpm data:rename-column <old> <new>
 *   pnpm data:remove-column <id> [--yes]
 */
import { createInterface } from 'node:readline/promises';
import {
	addColumn,
	countValues,
	removeColumn,
	renameColumn,
	type ColumnChange
} from '../src/lib/data/columns.ts';
import { FILES, readAdditional } from '../src/lib/data/files.ts';
import { writeRpt } from '../src/lib/data/rpt.ts';
import type { ColumnDef, ColumnType } from '../src/lib/data/schema.ts';
import { DataError, errorsOf } from '../src/lib/data/types.ts';
import { validateAdditional } from '../src/lib/data/validate.ts';
import { formatSchema, parseArgs, readSchema, readText, run, writeAll } from './lib/io.ts';

async function confirm(question: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(`${question} [y/N] `);
	rl.close();
	return /^y(es)?$/i.test(answer.trim());
}

run(async () => {
	const [command, ...rest] = process.argv.slice(2);
	const { flags, positional } = parseArgs(rest);
	const str = (name: string) =>
		typeof flags[name] === 'string' ? (flags[name] as string) : undefined;
	const schema = readSchema();
	const doc = readAdditional(readText(FILES.additional), schema).doc;

	let change: ColumnChange;
	if (command === 'add') {
		const [id] = positional;
		const type = str('type') as ColumnType | undefined;
		if (!id || !type || !['text', 'enum', 'date'].includes(type)) {
			throw new Error(
				'Usage: data:add-column <id> --type text|enum|date [--multiline] [--values a,b] [--label "…"]'
			);
		}
		const col: ColumnDef = {
			id,
			label: str('label') ?? id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
			type
		};
		if (flags.multiline) col.multiline = true;
		if (str('values'))
			col.values = str('values')!
				.split(',')
				.map((v) => v.trim());
		if (str('max-length')) col.maxLength = Number(str('max-length'));
		if (str('help')) col.help = str('help');
		change = addColumn(schema, doc, col);
	} else if (command === 'rename') {
		const [from, to] = positional;
		if (!from || !to) throw new Error('Usage: data:rename-column <old> <new>');
		change = renameColumn(schema, doc, from, to);
	} else if (command === 'remove') {
		const [id] = positional;
		if (!id) throw new Error('Usage: data:remove-column <id> [--yes]');
		const n = countValues(schema, doc, id);
		if (
			n > 0 &&
			!flags.yes &&
			!(await confirm(`${n} rows have a value in ${id}. Remove the column and its data?`))
		) {
			console.log('Cancelled.');
			return;
		}
		change = removeColumn(schema, doc, id);
	} else {
		throw new Error('Usage: columns.ts add|rename|remove …');
	}

	const text = writeRpt(change.doc);
	const errors = errorsOf(
		validateAdditional(readAdditional(text, change.schema).doc, change.schema)
	);
	if (errors.length > 0) throw new DataError(errors);
	writeAll({ [FILES.schema]: formatSchema(change.schema), [FILES.additional]: text });
	console.log(`Updated ${FILES.schema} and ${FILES.additional}.`);
});
