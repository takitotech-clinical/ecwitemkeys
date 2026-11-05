<!-- A cell value: SQL NULL as a muted italic NULL, empty as blank, matches highlighted. -->
<script lang="ts">
	import { highlightRanges } from '#lib/search/search.ts';

	let { value, needles = [] }: { value: string | null; needles?: string[] } = $props();

	const parts = $derived.by(() => {
		if (!value) return [];
		const out: { text: string; mark: boolean }[] = [];
		let at = 0;
		for (const [s, e] of highlightRanges(value, needles)) {
			if (s > at) out.push({ text: value.slice(at, s), mark: false });
			out.push({ text: value.slice(s, e), mark: true });
			at = e;
		}
		if (at < value.length) out.push({ text: value.slice(at), mark: false });
		return out;
	});
</script>

{#if value === null}<span class="null">NULL</span>{:else}{#each parts as p, i (i)}{#if p.mark}<mark
				>{p.text}</mark
			>{:else}{p.text}{/if}{/each}{/if}
