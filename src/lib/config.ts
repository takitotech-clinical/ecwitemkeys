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

/**
 * Color and description of each label. The Labels workflow creates or updates them, because an
 * issue form silently drops a label that doesn't exist yet.
 */
export const LABEL_STYLES: Record<string, { color: string; description: string }> = {
	[LABELS.proposal]: {
		color: '1d76db',
		description: 'Proposed edit to an item key (created by the app)'
	},
	[LABELS.valid]: { color: '0e8a16', description: 'Proposal passed validation' },
	[LABELS.invalid]: { color: 'd93f0b', description: 'Proposal failed validation' },
	[LABELS.approved]: { color: '2da44e', description: 'Approved by a maintainer; will be applied' },
	[LABELS.rejected]: { color: 'b60205', description: 'Rejected by a maintainer' },
	[LABELS.conflict]: {
		color: 'fbca04',
		description: 'The value changed after the proposal was made'
	},
	[LABELS.applied]: { color: '5319e7', description: 'Applied to the data' }
};
