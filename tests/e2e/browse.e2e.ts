import { expect, test, type Page } from '@playwright/test';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1200) < 900;
const results = (page: Page) =>
	isMobile(page)
		? page.getByRole('list', { name: 'Item keys' })
		: page.getByRole('grid', { name: 'Item keys' });
const resultCount = (page: Page) => page.getByText(/ of 30 keys$/);

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(resultCount(page)).toBeVisible();
});

test('shows active keys by default with a removable Status chip', async ({ page }) => {
	await expect(page.getByText('28 of 30 keys')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Status: Active (remove)' })).toBeVisible();
	await page.getByRole('button', { name: 'Status: Active (remove)' }).click();
	await expect(page.getByText('30 of 30 keys')).toBeVisible();
	await expect(page).toHaveURL(/status=all/);
});

test('searches with terms, phrases and column scopes', async ({ page }) => {
	const search = page.getByRole('searchbox', { name: 'Search item keys' });
	await search.fill('ANSI');
	// One of the five ANSI keys is expired, so hidden by default.
	await expect(page.getByText(/^\d+ of 30 keys$/)).toHaveText('4 of 30 keys');
	await expect(page).toHaveURL(/q=ANSI/);
	await search.fill('key:santovia');
	await expect(page.getByText(/^\d+ of 30 keys$/)).toHaveText('2 of 30 keys');
	await search.fill('"more than four cpt"');
	await expect(results(page).getByText('EnableMultipleCPTForNYVehicleForm')).toBeVisible();
});

test('filters by the Added facet and the latest-export banner', async ({ page }) => {
	if (isMobile(page)) await page.getByRole('button', { name: /^Filters/ }).click();
	const added = page.getByRole('group', { name: 'Added' });
	await expect(added.getByText('Dec 1, 2026')).toBeVisible();
	await added.getByRole('checkbox').first().check();
	if (isMobile(page)) await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByText('2 of 30 keys')).toBeVisible();
	await page.getByRole('button', { name: 'Reset filters' }).click();
	await page.getByRole('button', { name: '2 expired' }).click();
	await expect(page.getByText('2 of 30 keys')).toBeVisible();
	await expect(results(page).getByText('zopariUrl')).toBeVisible();
});

test.describe('dates in the browser timezone', () => {
	test.use({ timezoneId: 'Asia/Tokyo' });
	test('a 15:00Z sync shows as the next local day in Tokyo', async ({ page }) => {
		// 2026-12-01T15:00:00Z is Dec 2, 00:00 in Tokyo.
		await page.goto('/?key=ANSI_NewKey');
		await expect(
			page.getByRole('dialog').getByText(/Dec 2, 2026, 12:00:00\sAM GMT\+9/)
		).toBeVisible();
	});
});

test('deep links restore the selected key, including a trailing space', async ({ page }) => {
	await page.goto('/?key=MIPS_MigrateSettings_2022+');
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('MIPS_MigrateSettings_2022 ');
	await expect(dialog.getByText('␣ trailing space in key')).toBeVisible();
	await dialog.getByRole('button', { name: 'Close details' }).click();
	await expect(page).not.toHaveURL(/key=/);
});

test("row detail shows multi-line values and an expired row's last-known fields", async ({
	page
}) => {
	await page.goto('/?status=all&key=EnableMultipleCPTForNYVehicleForm');
	const dialog = page.getByRole('dialog');
	const display = dialog.locator('dt:has-text("Display name") + dd');
	expect(await display.innerText()).toContain('To allow more \n\nthan four CPT');
	await page.goto('/?status=all&key=zopariUrl');
	await expect(dialog.getByText('last known').first()).toBeVisible();
	await expect(dialog.locator('.badge.expired')).toHaveText('Expired Dec 1, 2026');
});

test('keyboard: / focuses search, arrows move, Enter opens, Escape closes', async ({ page }) => {
	test.skip(isMobile(page), 'keyboard navigation is a desktop feature');
	await page.keyboard.press('/');
	await expect(page.getByRole('searchbox')).toBeFocused();
	await page.keyboard.type('ANSI');
	await expect(page.getByText('4 of 30 keys')).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(
		'ANSI_NewKey'
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('row detail has a discussion section (giscus placeholder until configured)', async ({
	page
}) => {
	await page.route('https://giscus.app/**', (route) => route.abort());
	await page.goto('/?key=HPI');
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('heading', { name: /Discussion/ }).scrollIntoViewIfNeeded();
	await expect(
		dialog.getByTestId('giscus-placeholder').or(dialog.getByTestId('giscus'))
	).toBeVisible();
	const link = dialog.getByRole('link', { name: 'Open discussions on GitHub' });
	await expect(link).toHaveAttribute('href', /discussions_q=in%3Atitle%20key%3A%22HPI%22/);
});
