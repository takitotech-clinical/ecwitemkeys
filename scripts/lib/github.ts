/** Minimal GitHub REST/GraphQL client for scripts running in Actions (GITHUB_TOKEN). */
import {
	GISCUS,
	keyFromDiscussionTitle,
	REPO,
	REPO_NAME,
	REPO_OWNER
} from '../../src/lib/config.ts';

const API = 'https://api.github.com';

export function token(): string | null {
	return process.env.GITHUB_TOKEN || null;
}

export async function rest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const t = token();
	if (!t) throw new Error('GITHUB_TOKEN is not set');
	const res = await fetch(`${API}${path.replace('{repo}', REPO)}`, {
		method,
		headers: {
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${t}`,
			'X-GitHub-Api-Version': '2022-11-28',
			...(body === undefined ? {} : { 'Content-Type': 'application/json' })
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
	return (res.status === 204 ? null : await res.json()) as T;
}

/** GETs every page of a list endpoint. */
export async function restAll<T>(path: string): Promise<T[]> {
	const out: T[] = [];
	for (let page = 1; ; page++) {
		const sep = path.includes('?') ? '&' : '?';
		const items = await rest<T[]>('GET', `${path}${sep}per_page=100&page=${page}`);
		out.push(...items);
		if (items.length < 100) return out;
	}
}

export async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
	const res = await rest<{ data?: T; errors?: { message: string }[] }>('POST', '/graphql', {
		query,
		variables
	});
	if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
	return res.data as T;
}

interface DiscussionPage {
	repository: {
		discussions: {
			pageInfo: { hasNextPage: boolean; endCursor: string | null };
			nodes: { title: string; comments: { totalCount: number } }[];
		};
	};
}

/** Comment counts per key in the giscus category (PLAN §3.3 step 5). */
export async function discussionCounts(): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	let after: string | null = null;
	do {
		const data: DiscussionPage = await graphql<DiscussionPage>(
			`
				query ($owner: String!, $name: String!, $categoryId: ID!, $after: String) {
					repository(owner: $owner, name: $name) {
						discussions(first: 100, after: $after, categoryId: $categoryId) {
							pageInfo {
								hasNextPage
								endCursor
							}
							nodes {
								title
								comments {
									totalCount
								}
							}
						}
					}
				}
			`,
			{ owner: REPO_OWNER, name: REPO_NAME, categoryId: GISCUS.categoryId, after }
		);
		const d = data.repository.discussions;
		for (const n of d.nodes) {
			const key = keyFromDiscussionTitle(n.title);
			if (key !== null && n.comments.totalCount > 0) counts[key] = n.comments.totalCount;
		}
		after = d.pageInfo.hasNextPage ? d.pageInfo.endCursor : null;
	} while (after);
	return counts;
}
