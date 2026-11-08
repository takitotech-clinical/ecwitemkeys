import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// Default base is /ecwitemkeys (GitHub Pages project URL). CI sets BASE_PATH= (empty) for the custom domain.
const base = (process.env.BASE_PATH ?? '/ecwitemkeys') as '' | `/${string}`;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: '404.html' }),
			paths: { base }
		})
	],
	test: {
		expect: { requireAssertions: true },
		include: ['src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts', 'tests/unit/**/*.test.ts']
	}
});
