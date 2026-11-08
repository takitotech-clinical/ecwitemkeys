/** The in-memory dataset the browser builds once from the bundle (PLAN §4.2–4.3). */
import { normalize } from '../search/normalize.ts';
import type { ItemsBundle } from './join.ts';
import { isFacet, isSearchable, type ColumnDef } from './schema.ts';

export interface Column {
	id: string;
	label: string;
	/** Index into each row. */
	index: number;
	source: 'key' | 'itemkeys' | 'additional';
	type: 'key' | 'text' | 'timestamp' | 'enum' | 'date';
	searchable: boolean;
	facet: boolean;
	/** Short names accepted in `column:term` queries. */
	aliases: string[];
	def?: ColumnDef;
}

export interface Dataset {
	bundle: ItemsBundle;
	columns: Column[];
	byId: Map<string, Column>;
	n: number;
	rows: (string | null)[][];
	keys: string[];
	keyIndex: Map<string, number>;
	expired: Uint8Array;
	lastKnown: Uint8Array;
	isNew: Uint8Array;
	discussions: Int32Array;
	/** Normalized value per column per row (search and sort). */
	norm: string[][];
	/** All searchable normalized values of a row joined with \u0001, for unscoped terms. */
	all: string[];
}

const ITEMKEYS_LABELS: Record<string, [string, string[]]> = {
	key: ['Key', ['key']],
	ecw_remarks: ['eCW Remarks', ['remarks', 'ecw_remarks']],
	display_name: ['Display name', ['display', 'display_name']]
};

export function buildColumns(bundle: ItemsBundle): Column[] {
	const cols: Column[] = bundle.itemkeysColumns.map((id, index) => {
		const [label, aliases] = ITEMKEYS_LABELS[id] ?? [id, [id]];
		return {
			id,
			label,
			index,
			source: index === 0 ? 'key' : 'itemkeys',
			type: index === 0 ? 'key' : 'text',
			searchable: true,
			facet: false,
			aliases
		};
	});
	bundle.additionalSchema.columns.forEach((def, i) => {
		cols.push({
			id: def.id,
			label: def.label,
			index: bundle.itemkeysColumns.length + i,
			source: 'additional',
			type: def.type,
			searchable: isSearchable(def),
			facet: isFacet(def),
			aliases: [def.id],
			def
		});
	});
	return cols;
}

export function buildDataset(bundle: ItemsBundle): Dataset {
	const columns = buildColumns(bundle);
	const byId = new Map(columns.map((c) => [c.id, c]));
	const rows = bundle.rows;
	const n = rows.length;
	const iExpired = byId.get('expired')!.index;
	const iAdded = byId.get('added')!.index;
	const keys = rows.map((r) => r[0] as string);
	const expired = new Uint8Array(n);
	const isNew = new Uint8Array(n);
	const lastKnown = new Uint8Array(n);
	const discussions = new Int32Array(n);
	for (const i of bundle.lastKnown) lastKnown[i] = 1;
	const norm = columns.map(() => new Array<string>(n));
	const all = new Array<string>(n);
	const searchable = columns.filter((c) => c.searchable);
	for (let i = 0; i < n; i++) {
		const r = rows[i];
		expired[i] = r[iExpired] ? 1 : 0;
		isNew[i] = bundle.newAt !== null && r[iAdded] === bundle.newAt ? 1 : 0;
		discussions[i] = bundle.discussions[keys[i]] ?? 0;
		for (const c of columns) norm[c.index][i] = normalize(r[c.index]);
		all[i] = searchable.map((c) => norm[c.index][i]).join('\u0001');
	}
	return {
		bundle,
		columns,
		byId,
		n,
		rows,
		keys,
		keyIndex: new Map(keys.map((k, i) => [k, i])),
		expired,
		lastKnown,
		isNew,
		discussions,
		norm,
		all
	};
}
