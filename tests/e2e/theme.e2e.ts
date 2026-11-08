import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.use({ colorScheme: 'light' });

test.beforeEach(async ({ page }) => {
	await page.route('https://api.github.com/**', (route) => route.fulfill({ json: [] }));
	await page.goto('/about');
	await expect(page.getByText(/Proposing an edit/)).toBeVisible();
});

test('theme switch cycles system → light → dark and persists across reloads', async ({ page }) => {
	const toggle = page.getByTestId('theme-toggle');
	const html = page.locator('html');

	await expect(toggle).toHaveAttribute('data-choice', 'system');
	await expect(html).not.toHaveAttribute('data-theme');
	expect(await bg(page)).toBe('rgb(255, 255, 255)');

	await toggle.click();
	await expect(toggle).toHaveAttribute('data-choice', 'light');
	await expect(html).toHaveAttribute('data-theme', 'light');

	await toggle.click();
	await expect(toggle).toHaveAttribute('data-choice', 'dark');
	await expect(html).toHaveAttribute('data-theme', 'dark');
	expect(await bg(page)).toBe('rgb(9, 9, 11)');

	// Applied by app.html before the app starts, so there is no light flash.
	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(toggle).toHaveAttribute('data-choice', 'dark');

	await toggle.click();
	await expect(toggle).toHaveAttribute('data-choice', 'system');
	await expect(html).not.toHaveAttribute('data-theme');
	await page.reload();
	expect(await bg(page)).toBe('rgb(255, 255, 255)');
});

test('forced dark theme on a light system has no detectable a11y violations', async ({ page }) => {
	await page.getByTestId('theme-toggle').click();
	await page.getByTestId('theme-toggle').click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	const { violations } = await new AxeBuilder({ page }).analyze();
	expect(
		violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
	).toEqual([]);
});
