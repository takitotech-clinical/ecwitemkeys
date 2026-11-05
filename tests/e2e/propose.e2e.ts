import { expect, test } from '@playwright/test';

const pendingIssue = {
	number: 41,
	title: 'Edit: HPI',
	html_url: 'https://github.com/takitotech-clinical/ecwitemkeys/issues/41',
	created_at: '2026-12-02T10:00:00Z',
	user: { login: 'alice' },
	labels: [{ name: 'edit-proposal' }, { name: 'proposal:valid' }],
	body: '### Key\n\nHPI\n\n### Proposal\n\n```json\n{"v":1,"key":"HPI","base":{"category":"sha256:0000000000000000"},"set":{"category":""}}\n```\n\n### Reason / source\n\n_No response_'
};

test.beforeEach(async ({ page }) => {
	await page.route('https://api.github.com/**', (route) =>
		route.fulfill({ json: route.request().url().includes('/issues?') ? [pendingIssue] : [] })
	);
	await page.route('https://giscus.app/**', (route) => route.abort());
	await page.addInitScript(() => {
		window.open = (url) => {
			(window as unknown as { __opened: string }).__opened = String(url);
			return null;
		};
	});
});

test('shows pending-proposal badges and the facet', async ({ page }) => {
	await page.goto('/?key=HPI');
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByLabel('1 pending edit proposals')).toBeVisible();
	await expect(dialog.getByRole('link', { name: '#41' })).toHaveAttribute(
		'href',
		pendingIssue.html_url
	);
	await page.goto('/?pending=yes');
	await expect(page.getByText('1 of 30 keys')).toBeVisible();
});

test('propose-edit form: managed columns read-only, | and line breaks ok, backtick blocked', async ({
	page
}) => {
	await page.goto('/?key=MIPS_MigrateSettings_2022+');
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Propose edit' }).click();
	const form = dialog.getByRole('form', { name: 'Propose an edit' });

	// Only user columns are editable.
	await expect(form.getByLabel('Description')).toBeEditable();
	await expect(form.getByLabel('Category')).toBeVisible();
	await expect(form.getByLabel('Added')).toHaveCount(0);
	await expect(form.getByLabel('Expired')).toHaveCount(0);

	const submit = form.getByRole('button', { name: 'Open proposal on GitHub' });
	await expect(submit).toBeDisabled();

	const description = form.getByLabel('Description');
	await description.fill('Migration toggle for 2022 (yes|no)');
	await description.press('Enter');
	await description.pressSequentially('Second line');
	await expect(form.getByText('46 / 2,000')).toBeVisible();
	await expect(submit).toBeEnabled();

	await description.pressSequentially(' with `tick');
	await expect(form.getByText('The backtick character ` is not allowed.')).toBeVisible();
	await expect(submit).toBeDisabled();
	await description.fill('Migration toggle for 2022 (yes|no)\nSecond line');
	await form.getByLabel('Category').selectOption('system');
	await form.getByLabel('Reason / source').fill('Admin guide p. 12');
	await submit.click();

	const opened = await page.evaluate(() => (window as unknown as { __opened: string }).__opened);
	const url = new URL(opened);
	expect(url.origin + url.pathname).toBe(
		'https://github.com/takitotech-clinical/ecwitemkeys/issues/new'
	);
	expect(url.searchParams.get('template')).toBe('edit-proposal.yml');
	expect(url.searchParams.get('title')).toBe('Edit: MIPS_MigrateSettings_2022 ');
	expect(url.searchParams.get('reason')).toBe('Admin guide p. 12');
	expect(JSON.parse(url.searchParams.get('proposal')!)).toEqual({
		v: 1,
		key: 'MIPS_MigrateSettings_2022 ',
		base: { description: 'sha256:e3b0c44298fc1c14', category: 'sha256:e3b0c44298fc1c14' },
		set: { description: 'Migration toggle for 2022 (yes|no)\nSecond line', category: 'system' }
	});
	await expect(form.getByRole('status')).toContainText('GitHub opened in a new tab');
});
