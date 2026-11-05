/** File, git and GitHub Actions helpers shared by the maintainer scripts. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { FILES } from '../../src/lib/data/files.ts';
import { validateSchema, type Schema } from '../../src/lib/data/schema.ts';
import { DataError, formatIssue, type Issue } from '../../src/lib/data/types.ts';

export function readText(path: string): string {
	return readFileSync(path, 'utf8');
}

export function exists(path: string): boolean {
	return existsSync(path);
}

/** Writes every file or none: all temp files are written before any rename. */
export function writeAll(files: Record<string, string>): void {
	const entries = Object.entries(files);
	for (const [path, text] of entries) writeFileSync(`${path}.tmp`, text, 'utf8');
	for (const [path] of entries) renameSync(`${path}.tmp`, path);
}

export function readSchema(path: string = FILES.schema): Schema {
	const schema: unknown = JSON.parse(readText(path));
	const issues = validateSchema(schema, path);
	if (issues.length > 0) throw new DataError(issues);
	return schema as Schema;
}

export function formatSchema(schema: Schema): string {
	return JSON.stringify(schema, null, '\t') + '\n';
}

/** A file's contents at a git ref, or null if unavailable. */
export function gitShow(ref: string, path: string): string | null {
	if (/^0+$/.test(ref)) return null;
	try {
		return execFileSync('git', ['show', `${ref}:${path}`], {
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
			stdio: ['ignore', 'pipe', 'ignore']
		});
	} catch {
		return null;
	}
}

export function printIssues(issues: Issue[]): void {
	for (const i of issues) (i.level === 'error' ? console.error : console.warn)(formatIssue(i));
}

/** Appends Markdown to the GitHub Actions job summary, if running in Actions. */
export function stepSummary(markdown: string): void {
	const f = process.env.GITHUB_STEP_SUMMARY;
	if (f) appendFileSync(f, markdown + '\n');
}

/** Sets a GitHub Actions step output, if running in Actions. */
export function stepOutput(name: string, value: string): void {
	const f = process.env.GITHUB_OUTPUT;
	if (!f) return;
	const delim = `EOF_${Math.random().toString(36).slice(2)}`;
	appendFileSync(f, `${name}<<${delim}\n${value}\n${delim}\n`);
}

/** Parses `--name value` and `--flag` arguments; the rest are positional. */
export function parseArgs(argv: string[]): {
	flags: Record<string, string | true>;
	positional: string[];
} {
	const flags: Record<string, string | true> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				flags[a.slice(2)] = next;
				i++;
			} else flags[a.slice(2)] = true;
		} else positional.push(a);
	}
	return { flags, positional };
}

/** Runs a script's main function, printing data errors readably and exiting non-zero. */
export function run(main: () => Promise<void> | void): void {
	Promise.resolve()
		.then(main)
		.catch((e: unknown) => {
			if (e instanceof DataError) printIssues(e.issues);
			else console.error(e instanceof Error ? e.message : e);
			process.exit(1);
		});
}
