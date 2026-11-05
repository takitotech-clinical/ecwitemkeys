import { describe, expect, it } from 'vitest';
import { discussionTerm, keyFromDiscussionTitle } from '../../src/lib/config.ts';

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
