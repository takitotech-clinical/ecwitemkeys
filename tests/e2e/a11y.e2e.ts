import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }));
	await page.route('https://giscus.app/**', (route) => route.abort());
});

for (const [name, url, ready] of [
	['browse', '/', / of 30 keys/],
	['row detail', '/?key=HPI', /Propose edit/],
	['data health', '/health', /Total keys/],
	['review', '/review', /Maintainer access/],
	['about', '/about', /Proposing an edit/]
] as const) {
	test(`${name} has no detectable a11y violations`, async ({ page }) => {
		await page.goto(url);
		await expect(page.getByText(ready).first()).toBeVisible();
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(
			violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
		).toEqual([]);
	});
}

test.describe('dark mode', () => {
	test.use({ colorScheme: 'dark' });
	test('browse and row detail have no detectable a11y violations', async ({ page }) => {
		await page.goto('/?status=all&key=zopariUrl');
		await expect(page.getByText(/Propose edit/)).toBeVisible();
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(
			violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
		).toEqual([]);
	});
});
