/** Column maintenance (PLAN §2.8). Each operation returns a new schema and document. */
import { cloneDoc, withFields, type RptDoc } from './rpt.ts';
import {
	additionalHeader,
	fieldIndex,
	validateSchema,
	type ColumnDef,
	type Schema
} from './schema.ts';
import { DataError } from './types.ts';

export interface ColumnChange {
	schema: Schema;
	doc: RptDoc;
}

function checked(schema: Schema): Schema {
	const issues = validateSchema(schema);
	if (issues.length > 0) throw new DataError(issues);
	return schema;
}

function withHeader(doc: RptDoc, schema: Schema): RptDoc {
	const d = cloneDoc(doc);
	d.header = additionalHeader(schema);
	d.headerRaw = undefined;
	return d;
}

/** Appends a user column (empty in every row). */
export function addColumn(schema: Schema, doc: RptDoc, col: ColumnDef): ColumnChange {
	if (col.managed) throw new Error('Only user columns can be added');
	const next = checked({ ...schema, columns: [...schema.columns, col] });
	const d = withHeader(doc, next);
	d.records = d.records.map((r) => withFields(r, [...r.fields, '']));
	return { schema: next, doc: d };
}

/** Renames a column: schema and header only, since its position stays the same. */
export function renameColumn(schema: Schema, doc: RptDoc, from: string, to: string): ColumnChange {
	const col = schema.columns.find((c) => c.id === from);
	if (!col) throw new Error(`No column ${from}`);
	if (col.managed) throw new Error('Managed columns cannot be renamed');
	const next = checked({
		...schema,
		columns: schema.columns.map((c) => (c.id === from ? { ...c, id: to } : c))
	});
	return { schema: next, doc: withHeader(doc, next) };
}

/** Number of rows with a value in the column. */
export function countValues(schema: Schema, doc: RptDoc, id: string): number {
	const i = fieldIndex(schema, id);
	return i < 0 ? 0 : doc.records.filter((r) => r.fields[i] !== '').length;
}

/** Removes a user column from the schema, the header and every row. */
export function removeColumn(schema: Schema, doc: RptDoc, id: string): ColumnChange {
	const i = fieldIndex(schema, id);
	if (i < 0) throw new Error(`No column ${id}`);
	if (schema.columns[i - 1].managed) throw new Error('Managed columns cannot be removed');
	const next = checked({ ...schema, columns: schema.columns.filter((c) => c.id !== id) });
	const d = withHeader(doc, next);
	d.records = d.records.map((r) =>
		withFields(
			r,
			r.fields.filter((_, fi) => fi !== i)
		)
	);
	return { schema: next, doc: d };
}
