import { describe, expect, it } from 'vitest';
import approvers from '../../config/approvers.json';
import {
	discussionTerm,
	keyFromDiscussionTitle,
	LABEL_STYLES,
	LABELS,
	REPO_OWNER
} from '../../src/lib/config.ts';

describe('discussion terms', () => {
	it('quote the key so surrounding whitespace survives, and round-trip', () => {
		expect(discussionTerm('MIPS_MigrateSettings_2023 ')).toBe('key:"MIPS_MigrateSettings_2023 "');
		for (const k of ['HPI', 'MIPS_MigrateSettings_2023 ', 'a "quoted" \\ key']) {
			expect(keyFromDiscussionTitle(discussionTerm(k))).toBe(k);
		}
		expect(keyFromDiscussionTitle('Something else')).toBeNull();
		expect(keyFromDiscussionTitle('key:"broken')).toBeNull();
	});
});

describe('labels and approvers', () => {
	it('defines a style for every label', () => {
		expect(Object.keys(LABEL_STYLES).sort()).toEqual(Object.values(LABELS).sort());
		for (const s of Object.values(LABEL_STYLES)) expect(s.color).toMatch(/^[0-9a-f]{6}$/);
	});
	it('lists the repository owner as an approver', () => {
		expect(approvers).toContain(REPO_OWNER);
	});
});
