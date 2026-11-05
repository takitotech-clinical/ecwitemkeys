<script lang="ts">
	import type { Dataset } from '#lib/data/model.ts';
	import { formatLocalDate } from '#lib/data/dates.ts';

	let { ds, i, pending = 0 }: { ds: Dataset; i: number; pending?: number } = $props();

	const expiredAt = $derived(ds.rows[i][ds.byId.get('expired')!.index]);
</script>

{#if ds.isNew[i]}<span class="badge new">New</span>{/if}
{#if expiredAt}<span class="badge expired" title="Expired {expiredAt} (UTC)"
		>Expired {formatLocalDate(expiredAt)}</span
	>{/if}
{#if ds.discussions[i] > 0}<span
		class="badge"
		title="{ds.discussions[i]} discussion comments"
		aria-label="{ds.discussions[i]} discussion comments">💬 {ds.discussions[i]}</span
	>{/if}
{#if pending > 0}<span
		class="badge pending"
		title="{pending} pending edit proposal{pending > 1 ? 's' : ''}"
		aria-label="{pending} pending edit proposals">✎ {pending}</span
	>{/if}
