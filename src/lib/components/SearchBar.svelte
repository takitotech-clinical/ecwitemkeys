<script lang="ts">
	let {
		value = $bindable(''),
		input = $bindable(),
		onkeydown
	}: {
		value: string;
		input?: HTMLInputElement;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();
</script>

<div class="search" role="search">
	<label class="sr-only" for="search">Search item keys</label>
	<svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16"
		><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2" /><path
			d="m13 13 4.5 4.5"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		/></svg
	>
	<input
		id="search"
		type="search"
		bind:this={input}
		bind:value
		{onkeydown}
		placeholder="Search keys, remarks, descriptions…  ( / )"
		autocomplete="off"
		spellcheck="false"
		aria-describedby="search-help"
	/>
	<span id="search-help" class="sr-only">
		Terms are combined. Use "quotes" for a phrase, -term to exclude, and key:, remarks:, display: or
		description: to search one column. Arrow keys move through results; Enter opens one.
	</span>
</div>

<style>
	.search {
		position: relative;
		flex: 1;
		min-width: 12rem;
		max-width: 40rem;
		color: var(--fg-faint);
	}
	svg {
		position: absolute;
		left: 0.6rem;
		top: 50%;
		transform: translateY(-50%);
	}
	input {
		width: 100%;
		padding: 0.45rem 0.6rem 0.45rem 2rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		font-size: 15px;
	}
</style>
