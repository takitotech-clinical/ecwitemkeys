<!-- A managed UTC timestamp shown in the viewer's timezone; UTC in the tooltip (PLAN §2.5). -->
<script lang="ts">
	import { formatLocalDate, formatLocalDateTime } from '#lib/data/dates.ts';

	let { value, full = false }: { value: string | null; full?: boolean } = $props();
</script>

{#if value}<time datetime={value} title="{value} (UTC)"
		>{full ? formatLocalDateTime(value) : formatLocalDate(value)}</time
	>{/if}
