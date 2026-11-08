<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import takitotechLogo from '#lib/assets/takitotech.svg';
	import { app } from '#lib/state/app.svelte.ts';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Fixed overlays stop above the footer; its height depends on how the disclaimer wraps.
	let footerHeight = $state(0);
	$effect(() => {
		if (footerHeight > 0) {
			document.documentElement.style.setProperty('--footer-h', `${footerHeight}px`);
		}
	});

	app.load();

	const nav = [
		{ href: resolve('/'), label: 'Browse', id: '/' },
		{ href: resolve('/health'), label: 'Health', id: '/health' },
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
	<footer bind:offsetHeight={footerHeight}>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a class="brandlink" href="https://takitotech.com" target="_blank" rel="noopener">
			<span class="powered">Powered by</span>
			<img src={takitotechLogo} alt="" width="22" height="22" />
			<span class="wordmark">takito<span class="tech">tech</span></span>
			<span class="sep" aria-hidden="true">·</span>
			<span class="domain">takitotech.com</span>
		</a>
		<p class="disclaimer">
			TakitoTech does not own, does not claim to own, and is not responsible for the community
			contributed content. All data are contributed by community members and were not officially
			provided by eClinicalWorks. Always validate the item key and its functionality with
			eClinicalWorks before activating it. <a href="{resolve('/about')}#disclaimer">Details</a>
		</p>
	</footer>
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
	@media (max-width: 600px) {
		header {
			gap: 0.5rem;
			padding-left: 0.6rem;
			padding-right: 0.6rem;
		}
		nav a {
			padding: 0.2rem 0.4rem;
		}
	}
	main {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	footer {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0 1.25rem;
		padding: 0.25rem max(1rem, env(safe-area-inset-right))
			max(0.35rem, env(safe-area-inset-bottom, 0px)) max(1rem, env(safe-area-inset-left));
		border-top: 1px solid var(--border);
		background: var(--bg-soft);
		font-size: 13px;
		text-align: center;
	}
	.brandlink {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2rem;
		padding: 0 0.6rem;
		border-radius: 999px;
		color: var(--fg-muted);
		text-decoration: none;
		white-space: nowrap;
	}
	.brandlink:hover {
		background: var(--bg-hover);
	}
	.brandlink:hover .domain {
		text-decoration: underline;
	}
	footer img {
		display: block;
	}
	.wordmark {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--fg);
	}
	.tech {
		color: var(--brand);
	}
	.sep {
		color: var(--fg-faint);
	}
	.domain {
		color: var(--accent);
	}
	.disclaimer {
		margin: 0;
		max-width: 50rem;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--fg-muted);
	}
	@media (max-width: 380px) {
		footer {
			padding-left: 0.5rem;
			padding-right: 0.5rem;
			font-size: 12px;
		}
		.brandlink {
			gap: 0.3rem;
			padding: 0 0.4rem;
		}
		.wordmark {
			font-size: 14px;
		}
	}
</style>
