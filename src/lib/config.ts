/** Repository and giscus settings (PLAN §5, §9). */
export const REPO_OWNER = 'takitotech-clinical';
export const REPO_NAME = 'ecwitemkeys';
export const REPO = `${REPO_OWNER}/${REPO_NAME}`;
export const REPO_URL = `https://github.com/${REPO}`;

/**
 * giscus: fill in from https://giscus.app after enabling Discussions, creating the
 * "Item keys" category and installing the giscus app (PLAN §9 step 4). While empty, the
 * Discussion section links to GitHub instead of embedding giscus.
 */
export const GISCUS = {
	repoId: '',
	category: 'Item keys',
	categoryId: ''
};

/** The giscus discussion term for a key; quotes keep surrounding whitespace explicit. */
export function discussionTerm(key: string): string {
	return 'key:' + JSON.stringify(key);
}

/** Inverse of {@link discussionTerm}; null if the title isn't one of ours. */
export function keyFromDiscussionTitle(title: string): string | null {
	if (!title.startsWith('key:"')) return null;
	try {
		const v: unknown = JSON.parse(title.slice(4));
		return typeof v === 'string' ? v : null;
	} catch {
		return null;
	}
}

export const LABELS = {
	proposal: 'edit-proposal',
	valid: 'proposal:valid',
	invalid: 'proposal:invalid',
	approved: 'approved',
	rejected: 'rejected',
	conflict: 'conflict',
	applied: 'applied'
} as const;
