import { expect, test, type Route } from '@playwright/test';

const body = (p: object, reason = '_No response_') =>
	`### Key\n\nx\n\n### Proposal\n\n\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\`\n\n### Reason / source\n\n${reason}`;
const EMPTY = 'sha256:e3b0c44298fc1c14';
const issue = (number: number, p: object, labels: string[], reason?: string) => ({
	number,
	title: `Edit: ${(p as { key: string }).key}`,
	html_url: `https://github.com/takitotech-clinical/ecwitemkeys/issues/${number}`,
	created_at: '2026-12-02T10:00:00Z',
	user: { login: 'alice' },
	labels: ['edit-proposal', ...labels].map((name) => ({ name })),
	body: body(p, reason)
});

const ISSUES = [
	issue(
		51,
		{
			v: 1,
			key: 'HPI',
			base: { description: 'sha256:0000000000000000' },
			set: { description: 'New HPI text' }
		},
		['proposal:valid']
	),
	issue(
		52,
		{
			v: 1,
			key: 'ANSI5010',
			base: { description: EMPTY },
			set: { description: 'Line one\nLine two' }
		},
		['proposal:valid'],
		'From the 5010 guide'
	),
	issue(53, { v: 1, key: 'zopariUrl', base: { category: EMPTY }, set: { category: 'nope' } }, [
		'proposal:invalid'
	])
];

test('review queue: diffs, stale warnings, approve and reject against a mocked GitHub API', async ({
	page
}) => {
	const calls: { method: string; url: string; body: unknown }[] = [];
	await page.route('https://api.github.com/**', async (route: Route) => {
		const req = route.request();
		const url = req.url();
		calls.push({ method: req.method(), url, body: req.postDataJSON?.() ?? null });
		if (url.endsWith('/user')) return route.fulfill({ json: { login: 'TriStarGodAI' } });
		if (url.includes('/issues?')) return route.fulfill({ json: ISSUES });
		return route.fulfill({ json: {} });
	});

	await page.goto('/review');
	await page.getByLabel('GitHub token').fill('github_pat_test');
	await page.getByRole('button', { name: 'Save token' }).click();
	await expect(page.getByText('Signed in as TriStarGodAI')).toBeVisible();
	await expect(page.getByText(/approver\./)).toBeVisible();
	await expect(page.getByRole('heading', { name: /Open proposals \(3\)/ })).toBeVisible();

	const cards = page.locator('li.card');
	// HPI's base hash doesn't match its current (multi-line) description: stale.
	const hpi = cards.filter({ hasText: '#51' });
	await expect(hpi.getByText('stale', { exact: true })).toBeVisible();
	await expect(hpi.getByRole('checkbox')).toHaveCount(0);
	await expect(hpi.locator('.diff .del').first()).toHaveText('− Progress Note HPI category.');

	const ansi = cards.filter({ hasText: '#52' });
	await expect(ansi.locator('.diff .add')).toHaveText(['+ Line one', '+ Line two']);
	await expect(ansi.getByText('From the 5010 guide')).toBeVisible();

	const bad = cards.filter({ hasText: '#53' });
	await expect(bad.getByText('Expired')).toBeVisible();
	await expect(bad.getByText(/category: Must be one of/)).toBeVisible();
	await expect(bad.getByRole('button', { name: 'Approve' })).toBeDisabled();

	await ansi.getByRole('checkbox').check();
	await page.getByRole('button', { name: 'Approve selected (1)' }).click();
	await expect(page.getByRole('status')).toContainText('Approved #52');
	expect(calls).toContainEqual(
		expect.objectContaining({
			method: 'POST',
			url: expect.stringMatching(/issues\/52\/labels$/),
			body: { labels: ['approved'] }
		})
	);

	await bad.getByRole('button', { name: 'Reject…' }).click();
	const confirm = bad.getByRole('button', { name: 'Confirm reject' });
	await expect(confirm).toBeDisabled();
	await bad.getByLabel('Reason for rejecting').fill('Not a valid category');
	await confirm.click();
	await expect(page.getByRole('status')).toContainText('Rejected #53');
	const patch = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/issues/53'));
	expect(patch?.body).toEqual({ state: 'closed', state_reason: 'not_planned' });
	expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/issues/53/comments'))).toBe(
		true
	);
});

test('review queue is read-only for non-approvers', async ({ page }) => {
	await page.route('https://api.github.com/**', (route) =>
		route.fulfill({ json: route.request().url().endsWith('/user') ? { login: 'someone' } : ISSUES })
	);
	await page.goto('/review');
	await page.getByLabel('GitHub token').fill('github_pat_x');
	await page.getByRole('button', { name: 'Save token' }).click();
	await expect(page.getByText(/read-only/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});
