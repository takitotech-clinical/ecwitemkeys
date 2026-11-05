export type Level = 'error' | 'warning';

/** A problem found while reading or validating a file. */
export interface Issue {
	level: Level;
	file: string;
	message: string;
	/** First physical line (1-based, header = line 1). */
	line?: number;
	/** Last physical line, when the problem spans several. */
	endLine?: number;
	key?: string;
	snippet?: string;
}

export function formatIssue(i: Issue): string {
	const where =
		i.line === undefined
			? i.file
			: i.endLine !== undefined && i.endLine !== i.line
				? `${i.file}:${i.line}-${i.endLine}`
				: `${i.file}:${i.line}`;
	const key = i.key !== undefined ? ` [key ${JSON.stringify(i.key)}]` : '';
	const snippet = i.snippet !== undefined ? `\n    ${JSON.stringify(i.snippet)}` : '';
	return `${i.level.toUpperCase()} ${where}${key}: ${i.message}${snippet}`;
}

/** Thrown when a file cannot be read strictly. Carries every error found. */
export class DataError extends Error {
	issues: Issue[];
	constructor(issues: Issue[]) {
		super(issues.map(formatIssue).join('\n'));
		this.name = 'DataError';
		this.issues = issues;
	}
}

export function errorsOf(issues: Issue[]): Issue[] {
	return issues.filter((i) => i.level === 'error');
}
