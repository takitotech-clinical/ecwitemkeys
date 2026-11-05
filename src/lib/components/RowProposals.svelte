<!-- RowDetail's edit section: the Propose edit button and this key's pending proposals. -->
<script lang="ts">
	import type { Dataset } from '#lib/data/model.ts';
	import type { OpenProposal } from '#lib/github/proposals.ts';
	import ProposeEditForm from './ProposeEditForm.svelte';

	let { ds, i, proposals }: { ds: Dataset; i: number; proposals: OpenProposal[] } = $props();

	let editing = $state(false);
</script>

<section class="edits" aria-label="Edits">
	{#if editing}
		<ProposeEditForm {ds} {i} oncancel={() => (editing = false)} />
	{:else}
		<button class="btn primary" onclick={() => (editing = true)}>✎ Propose edit</button>
	{/if}
	{#if proposals.length > 0}
		<h3>Pending proposals</h3>
		<ul>
			{#each proposals as p (p.number)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
					<a href={p.url} target="_blank" rel="noopener">#{p.number}</a>
					by {p.author}
					{#if p.labels.includes('proposal:invalid')}<span class="badge">invalid</span>{/if}
					{#if p.labels.includes('conflict')}<span class="badge pending">conflict</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.edits {
		margin-top: 1rem;
	}
	h3 {
		font-size: 14px;
		margin: 1rem 0 0.3rem;
	}
	ul {
		margin: 0;
		padding-left: 1.2rem;
	}
</style>
