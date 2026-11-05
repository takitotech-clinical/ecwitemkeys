<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { app } from '#lib/state/app.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	app.load();

	const nav = [
		{ href: resolve('/'), label: 'Browse', id: '/' },
		{ href: resolve('/health'), label: 'Data health', id: '/health' },
		{ href: resolve('/review'), label: 'Review', id: '/review' },
		{ href: resolve('/about'), label: 'About', id: '/about' }
	] as const;
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
	<header>
		<a class="brand" href={resolve('/')}>eCW Item Keys</a>
		<nav aria-label="Main">
			{#each nav as n (n.id)}
				<a href={n.href} aria-current={page.route.id === n.id ? 'page' : undefined}>{n.label}</a>
			{/each}
		</nav>
	</header>
	{#if app.updateAvailable}
		<div class="update" role="status">
			Data updated — <button class="link" onclick={() => location.reload()}>reload</button>
		</div>
	{/if}
	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem max(1rem, env(safe-area-inset-left));
		padding-top: max(0.5rem, env(safe-area-inset-top));
		border-bottom: 1px solid var(--border);
		background: var(--bg);
		flex-wrap: wrap;
	}
	.brand {
		font-weight: 650;
		color: var(--fg);
		text-decoration: none;
		font-size: 15px;
	}
	nav {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
		flex-wrap: wrap;
	}
	nav a {
		color: var(--fg-muted);
		text-decoration: none;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius);
	}
	nav a:hover {
		background: var(--bg-hover);
	}
	nav a[aria-current='page'] {
		color: var(--fg);
		background: var(--bg-soft);
	}
	.update {
		padding: 0.4rem 1rem;
		background: var(--bg-active);
		text-align: center;
	}
	.link {
		border: 0;
		background: none;
		color: var(--accent);
		padding: 0;
		text-decoration: underline;
	}
	main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
