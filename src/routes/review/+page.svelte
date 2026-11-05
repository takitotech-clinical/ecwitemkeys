<script lang="ts">
	import ReviewQueue from '#lib/components/ReviewQueue.svelte';
	import { app } from '#lib/state/app.svelte.ts';
</script>

<svelte:head><title>Review · eCW Item Keys</title></svelte:head>

<div class="page">
	<h1>Review proposals</h1>
	{#if app.error}
		<p>Could not load data: {app.error}</p>
	{:else if app.ds}
		<ReviewQueue ds={app.ds} />
	{:else}
		<p>Loading…</p>
	{/if}
</div>

<style>
	h1 {
		font-size: 22px;
	}
</style>
