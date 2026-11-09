<script lang="ts">
	import DataHealth from '#lib/components/DataHealth.svelte';
	import { app } from '#lib/state/app.svelte.ts';
</script>

<svelte:head><title>data health · ecw item keys · takitotech</title></svelte:head>

<div class="page">
	{#if app.error}
		<p>Could not load data: {app.error}</p>
	{:else if app.ds}
		<DataHealth ds={app.ds} />
	{:else}
		<p>Loading…</p>
	{/if}
</div>
