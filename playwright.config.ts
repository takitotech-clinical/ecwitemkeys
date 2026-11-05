import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	use: { baseURL: 'http://localhost:4173' },
	webServer: {
		// Built at the root path so tests don't need to know the Pages base path.
		command: 'BASE_PATH= pnpm build && BASE_PATH= pnpm preview --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	projects: [
		{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
		{ name: 'pixel-7', use: { ...devices['Pixel 7'] } },
		{ name: 'iphone-14', use: { ...devices['iPhone 14'] } }
	]
});
