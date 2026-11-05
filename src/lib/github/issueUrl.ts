/** Prefilled issue-form URL for a proposal (PLAN §6.1). */
import { REPO_URL } from '../config.ts';
import { encodeProposal, type Proposal } from './proposal.ts';

/** Stay well below GitHub's URL limit. */
export const MAX_URL_LENGTH = 7500;

export function buildIssueUrl(p: Proposal, reason: string): { url: string; tooLong: boolean } {
	const q = (name: string, v: string) => `${name}=${encodeURIComponent(v)}`;
	const url =
		`${REPO_URL}/issues/new?` +
		[
			q('template', 'edit-proposal.yml'),
			q('title', `Edit: ${p.key}`),
			q('key', p.key),
			q('proposal', encodeProposal(p)),
			...(reason ? [q('reason', reason)] : [])
		].join('&');
	return { url, tooLong: url.length > MAX_URL_LENGTH };
}
