/** Reads and validates every source file strictly. */
import {
	FILES,
	readAdditional,
	readItemkeysArchive,
	readItemkeysExport
} from '../../src/lib/data/files.ts';
import type { RptDoc } from '../../src/lib/data/rpt.ts';
import type { Schema } from '../../src/lib/data/schema.ts';
import { DataError, errorsOf, type Issue } from '../../src/lib/data/types.ts';
import { validateAdditional, validateItemkeys } from '../../src/lib/data/validate.ts';
import { readSchema, readText } from './io.ts';

export interface Sources {
	schema: Schema;
	itemkeys: RptDoc;
	additional: RptDoc;
	archive: RptDoc;
	texts: { additional: string; archive: string };
	warnings: Issue[];
}

/** Source directory; tests point this at a fixture set. */
const dir = process.env.DATA_SOURCE_DIR ?? 'source';
const at = (file: string) => file.replace(/^source\//, `${dir}/`);

/** Throws DataError with every error found across all files. */
export function loadSources(): Sources {
	const schema = readSchema(at(FILES.schema));
	const issues: Issue[] = [];
	const attempt = <T>(f: () => T): T | null => {
		try {
			return f();
		} catch (e) {
			if (e instanceof DataError) issues.push(...e.issues);
			else issues.push({ level: 'error', file: '?', message: String(e) });
			return null;
		}
	};
	const additionalText = readText(at(FILES.additional));
	const archiveText = attempt(() => readText(at(FILES.archive)));
	const ik = attempt(() => readItemkeysExport(readText(at(FILES.itemkeys))));
	const add = attempt(() => readAdditional(additionalText, schema));
	const arc = archiveText === null ? null : attempt(() => readItemkeysArchive(archiveText));
	for (const r of [ik, add, arc]) if (r) issues.push(...r.warnings);
	if (ik) issues.push(...validateItemkeys(ik.doc));
	if (arc) issues.push(...validateItemkeys(arc.doc));
	if (add) issues.push(...validateAdditional(add.doc, schema, arc?.doc));
	if (!ik || !add || !arc || errorsOf(issues).length > 0) throw new DataError(issues);
	return {
		schema,
		itemkeys: ik.doc,
		additional: add.doc,
		archive: arc.doc,
		texts: { additional: additionalText, archive: archiveText! },
		warnings: issues
	};
}
