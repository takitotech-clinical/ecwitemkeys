/** GitHub calls used by the proposal Actions. */
import { LABELS } from '../../src/lib/config.ts';
import { rest, restAll } from '../lib/github.ts';

export interface GhIssue {
	number: number;
	body: string | null;
	user: { login: string } | null;
	labels: { name: string }[];
	pull_request?: unknown;
}

export async function openIssues(labels: string[]): Promise<GhIssue[]> {
	const items = await restAll<GhIssue>(
		`/repos/{repo}/issues?state=open&sort=created&direction=asc&labels=${encodeURIComponent(labels.join(','))}`
	);
	return items.filter((i) => !i.pull_request);
}

export async function setLabels(issue: number, add: string[], remove: string[]): Promise<void> {
	for (const name of remove) {
		await rest('DELETE', `/repos/{repo}/issues/${issue}/labels/${encodeURIComponent(name)}`).catch(
			() => undefined // not present
		);
	}
	if (add.length > 0) await rest('POST', `/repos/{repo}/issues/${issue}/labels`, { labels: add });
}

export async function postComment(issue: number, body: string): Promise<void> {
	await rest('POST', `/repos/{repo}/issues/${issue}/comments`, { body });
}

/** Updates the comment containing `marker`, or creates it. */
export async function upsertComment(issue: number, marker: string, body: string): Promise<void> {
	const comments = await restAll<{ id: number; body: string }>(
		`/repos/{repo}/issues/${issue}/comments`
	);
	const mine = comments.find((c) => c.body.includes(marker));
	if (mine) await rest('PATCH', `/repos/{repo}/issues/comments/${mine.id}`, { body });
	else await postComment(issue, body);
}

export async function closeIssue(
	issue: number,
	reason: 'completed' | 'not_planned'
): Promise<void> {
	await rest('PATCH', `/repos/{repo}/issues/${issue}`, { state: 'closed', state_reason: reason });
}

/** Who most recently added the `approved` label. */
export async function approverOf(issue: number): Promise<string | null> {
	const events = await restAll<{
		event: string;
		label?: { name: string };
		actor: { login: string } | null;
	}>(`/repos/{repo}/issues/${issue}/events`);
	const labeled = events.filter((e) => e.event === 'labeled' && e.label?.name === LABELS.approved);
	return labeled.at(-1)?.actor?.login ?? null;
}

/** True if the user has triage or higher on the repository. */
export async function canTriage(login: string): Promise<boolean> {
	try {
		const p = await rest<{ role_name?: string; permission?: string }>(
			'GET',
			`/repos/{repo}/collaborators/${encodeURIComponent(login)}/permission`
		);
		return ['triage', 'write', 'maintain', 'admin'].includes(p.role_name ?? p.permission ?? '');
	} catch {
		return false;
	}
}
