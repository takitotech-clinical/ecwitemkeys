<!--
	One GitHub Discussion per key via giscus (PLAN §5). Loads only when scrolled into view.
	Strict matching on `key:"<key>"` keeps HPI off HPINotes's thread and keeps trailing spaces.
-->
<script lang="ts">
	import { GISCUS, REPO, REPO_URL, discussionTerm } from '#lib/config.ts';

	let { key, count }: { key: string; count: number } = $props();

	const term = $derived(discussionTerm(key));
	const configured = GISCUS.repoId !== '' && GISCUS.categoryId !== '';
	const githubUrl = $derived(
		`${REPO_URL}/discussions/categories/${encodeURIComponent(GISCUS.category.toLowerCase().replace(/\s+/g, '-'))}?discussions_q=${encodeURIComponent(`in:title ${term}`)}`
	);

	let section: HTMLElement | undefined = $state();
	let visible = $state(false);

	$effect(() => {
		if (!section) return;
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				visible = true;
				io.disconnect();
			}
		});
		io.observe(section);
		return () => io.disconnect();
	});

	/** Attachment: injects the giscus script once the section is visible. */
	function giscus(node: HTMLDivElement) {
		if (!visible) return;
		const s = document.createElement('script');
		s.src = 'https://giscus.app/client.js';
		s.async = true;
		s.crossOrigin = 'anonymous';
		const attrs: Record<string, string> = {
			repo: REPO,
			'repo-id': GISCUS.repoId,
			category: GISCUS.category,
			'category-id': GISCUS.categoryId,
			mapping: 'specific',
			term,
			strict: '1',
			'reactions-enabled': '1',
			'emit-metadata': '0',
			'input-position': 'top',
			theme: 'preferred_color_scheme',
			lang: 'en',
			loading: 'lazy'
		};
		for (const [k, v] of Object.entries(attrs)) s.setAttribute(`data-${k}`, v);
		node.append(s);
		return () => node.replaceChildren();
	}
</script>

<section class="discussion" bind:this={section} aria-labelledby="discussion-title">
	<h3 id="discussion-title">
		Discussion {#if count > 0}<span class="count">({count})</span>{/if}
	</h3>
	{#if configured}
		<div class="giscus" {@attach giscus} data-testid="giscus"></div>
	{:else}
		<p class="placeholder" data-testid="giscus-placeholder">
			In-page discussion is not set up yet.
		</p>
	{/if}
	<p class="open">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a href={githubUrl} target="_blank" rel="noopener">Open discussions on GitHub</a>
		<span class="muted">· commenting needs a GitHub account</span>
	</p>
</section>

<style>
	.discussion {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	h3 {
		font-size: 15px;
		margin: 0 0 0.5rem;
	}
	.count,
	.muted {
		color: var(--fg-muted);
		font-weight: 400;
	}
	.giscus {
		min-height: 120px;
	}
	.placeholder {
		color: var(--fg-muted);
	}
	.open {
		font-size: 13px;
	}
</style>
