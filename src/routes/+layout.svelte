<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import takitotechLogo from '#lib/assets/takitotech.svg';
	import ThemeToggle from '#lib/components/ThemeToggle.svelte';
	import { app } from '#lib/state/app.svelte.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
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

	$effect(() => theme.init());

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
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a
			class="brand"
			href="https://takitotech.com"
			target="_blank"
			rel="noopener"
			aria-label="takitotech.com (opens in a new tab)"
		>
			<img src={takitotechLogo} alt="" width="28" height="28" />
			<span class="wordmark">takito<span class="tech">tech</span></span>
		</a>
		<span class="slash" aria-hidden="true">/</span>
		<a class="page-name" href={resolve('/')}>ecw item keys</a>
		<nav aria-label="Main">
			{#each nav as n (n.id)}
				<a href={n.href} aria-current={page.route.id === n.id ? 'page' : undefined}>{n.label}</a>
			{/each}
		</nav>
		<ThemeToggle />
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
		<p class="disclaimer">
			This information is shared for informational purposes only and does not imply any transfer of
			ownership, license, or endorsement. TakitoTech is not responsible for the community
			contributed content. Always validate the item key and its functionality with eClinicalWorks
			before activating it.
		</p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a class="brandlink" href="https://takitotech.com" target="_blank" rel="noopener">
			<span class="powered">Powered by</span>
			<img src={takitotechLogo} alt="" width="22" height="22" />
			<span class="wordmark">takito<span class="tech">tech</span></span>
		</a>
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
		gap: 0.6rem;
		padding: 0.7rem max(1.25rem, env(safe-area-inset-right)) 0.7rem
			max(1.25rem, env(safe-area-inset-left));
		padding-top: max(0.7rem, env(safe-area-inset-top));
		border-bottom: 1px solid var(--line);
		background: var(--bg);
		flex-wrap: wrap;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		text-decoration: none;
	}
	.brand img {
		display: block;
	}
	.wordmark {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: var(--fg-strong);
	}
	.tech {
		background: linear-gradient(90deg, var(--accent), var(--accent-2));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.slash {
		color: var(--slash);
		font-size: 19px;
	}
	.page-name {
		font-family: var(--mono);
		font-size: 15px;
		color: var(--fg-muted);
		text-decoration: none;
	}
	.page-name:hover {
		color: var(--accent);
	}
	nav {
		display: flex;
		gap: 0.3rem;
		margin-left: auto;
		flex-wrap: wrap;
	}
	nav a {
		color: var(--fg-muted);
		text-decoration: none;
		padding: 0.3rem 0.75rem;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 500;
	}
	nav a:hover {
		color: var(--fg);
		background: var(--tint-hover);
	}
	nav a[aria-current='page'] {
		color: var(--fg);
		background: var(--tint);
		border-color: var(--line);
	}
	.update {
		padding: 0.4rem 1rem;
		background: var(--accent-soft);
		color: var(--fg-2);
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
			gap: 0.45rem;
			padding-left: 0.75rem;
			padding-right: 0.75rem;
		}
		.brand .wordmark {
			display: none;
		}
		nav a {
			padding: 0.25rem 0.55rem;
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
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.55rem max(1.25rem, env(safe-area-inset-right))
			max(0.5rem, env(safe-area-inset-bottom, 0px)) max(1.25rem, env(safe-area-inset-left));
		border-top: 1px solid var(--line);
		background: var(--bg);
		font-size: 12px;
		color: var(--fg-faint);
		text-align: center;
	}
	footer p {
		margin: 0;
		max-width: 50rem;
	}
	footer a {
		color: var(--fg-muted);
	}
	.disclaimer {
		font-size: 11.5px;
		line-height: 1.45;
	}
	.brandlink {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2rem;
		padding: 0 0.7rem;
		border-radius: 999px;
		color: var(--fg-muted);
		font-size: 13px;
		text-decoration: none;
		white-space: nowrap;
	}
	.brandlink:hover {
		background: var(--tint-hover);
		color: var(--fg-muted);
	}
	.brandlink img {
		display: block;
	}
	.brandlink .wordmark {
		font-size: 15px;
	}
	@media (max-width: 380px) {
		footer {
			padding-left: 0.6rem;
			padding-right: 0.6rem;
		}
		.brandlink {
			gap: 0.3rem;
			padding: 0 0.4rem;
			font-size: 12px;
		}
		.brandlink .wordmark {
			font-size: 14px;
		}
	}
</style>
