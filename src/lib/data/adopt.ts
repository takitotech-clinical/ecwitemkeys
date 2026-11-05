/**
 * One-time conversion of the seed additional.rpt (``key`description`category`` with an SSMS
 * footer) to the managed format (PLAN §2.7).
 */
import { emptyDoc, FILES, ITEMKEYS_HEADER } from './files.ts';
import { newRecord, readRpt, type RptDoc } from './rpt.ts';
import { additionalHeader, type Schema } from './schema.ts';

export interface AdoptResult {
	additional: RptDoc;
	archive: RptDoc;
}

export function adoptSeed(seedText: string, schema: Schema, now: string): AdoptResult {
	const firstLine = seedText.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
	const seedHeader = firstLine.split('`');
	if (seedHeader.join('`') === additionalHeader(schema).join('`')) {
		throw new Error(`${FILES.additional} is already in the managed format`);
	}
	const { doc: seed } = readRpt(seedText, {
		file: FILES.additional,
		header: seedHeader,
		footer: 'required'
	});
	const additional = emptyDoc(FILES.additional, additionalHeader(schema), seed.eol, seed.bom);
	const seedIndex = new Map(seedHeader.map((h, i) => [h, i]));
	for (const c of schema.columns) {
		if (c.managed && seedIndex.has(c.id)) throw new Error(`Seed already has column ${c.id}`);
	}
	for (const h of seedHeader.slice(1)) {
		if (!schema.columns.some((c) => c.id === h))
			throw new Error(`Seed column ${h} is not in the schema`);
	}
	additional.records = seed.records.map((r) =>
		newRecord([
			r.fields[0],
			...schema.columns.map((c) => {
				if (c.id === 'added') return now;
				const si = seedIndex.get(c.id);
				return si === undefined ? '' : r.fields[si];
			})
		])
	);
	const archive = emptyDoc(FILES.archive, ITEMKEYS_HEADER, seed.eol, seed.bom);
	return { additional, archive };
}
