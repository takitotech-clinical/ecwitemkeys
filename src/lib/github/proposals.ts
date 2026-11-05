/**
 * GitHub REST client for edit proposals: unauthenticated reads for pending badges (cached in
 * sessionStorage for 5 minutes, PLAN §4.5) and token-authenticated review actions (PLAN §6.3).
 */
import { LABELS, REPO } from '../config.ts';
import { parseProposal, proposalJsonFromIssueBody, type ParsedProposal } from './proposal.ts';

const API = 'https://api.github.com';
const CACHE_KEY = 'ecwitemkeys:proposals';
const CACHE_MS = 5 * 60 * 1000;

export interface Issue {
	number: number;
	title: string;
	body: string | null;
	html_url: string;
	created_at: string;
	user: { login: string } | null;
	labels: ({ name: string } | string)[];
	pull_request?: unknown;
}

export interface OpenProposal {
	number: number;
	title: string;
	url: string;
	createdAt: string;
	author: string;
	labels: string[];
	/** The key from the proposal JSON (authoritative), or null if unparseable. */
	key: string | null;
	parsed: ParsedProposal;
	body: string;
}

export function toProposal(i: Issue): OpenProposal {
	const body = i.body ?? '';
	const parsed = parseProposal(proposalJsonFromIssueBody(body));
	return {
		number: i.number,
		title: i.title,
		url: i.html_url,
		createdAt: i.created_at,
		author: i.user?.login ?? 'ghost',
		labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
		key: parsed.ok ? parsed.proposal.key : null,
		parsed,
		body
	};
}

async function request<T>(
	method: string,
	path: string,
	token: string | null,
	body?: unknown
): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			Accept: 'application/vnd.github+json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(body === undefined ? {} : { 'Content-Type': 'application/json' })
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`GitHub ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
	}
	return (res.status === 204 ? null : await res.json()) as T;
}

/** Every open edit-proposal issue, oldest first. */
export async function listOpenProposals(token: string | null = null): Promise<OpenProposal[]> {
	const out: Issue[] = [];
	for (let page = 1; page <= 20; page++) {
		const items = await request<Issue[]>(
			'GET',
			`/repos/${REPO}/issues?labels=${encodeURIComponent(LABELS.proposal)}&state=open&sort=created&direction=asc&per_page=100&page=${page}`,
			token
		);
		out.push(...items.filter((i) => !i.pull_request));
		if (items.length < 100) break;
	}
	return out.map(toProposal);
}

/** Cached unauthenticated read for badges; null if GitHub is unavailable or rate-limited. */
export async function cachedOpenProposals(): Promise<OpenProposal[] | null> {
	try {
		const hit = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null') as {
			at: number;
			items: OpenProposal[];
		} | null;
		if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
	} catch {
		// No usable cache.
	}
	try {
		const items = await listOpenProposals();
		try {
			sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items }));
		} catch {
			// Storage unavailable: just don't cache.
		}
		return items;
	} catch {
		return null;
	}
}

export function getUser(token: string): Promise<{ login: string }> {
	return request('GET', '/user', token);
}

export function addLabels(token: string, issue: number, labels: string[]): Promise<unknown> {
	return request('POST', `/repos/${REPO}/issues/${issue}/labels`, token, { labels });
}

export function comment(token: string, issue: number, body: string): Promise<unknown> {
	return request('POST', `/repos/${REPO}/issues/${issue}/comments`, token, { body });
}

export function closeIssue(token: string, issue: number, reason: 'completed' | 'not_planned') {
	return request('PATCH', `/repos/${REPO}/issues/${issue}`, token, {
		state: 'closed',
		state_reason: reason
	});
}
