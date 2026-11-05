<!-- Current → proposed for each field of a proposal; line-aware for multi-line text. -->
<script lang="ts">
	import { lineDiff } from '#lib/github/diff.ts';

	let {
		fields
	}: { fields: { id: string; label: string; before: string; after: string; stale: boolean }[] } =
		$props();
</script>

{#each fields as f (f.id)}
	<div class="field">
		<div class="label">
			{f.label}
			{#if f.stale}<span class="stale" title="The current value changed after the proposal was made"
					>⚠ stale</span
				>{/if}
		</div>
		{#if f.before.includes('\n') || f.after.includes('\n')}
			<pre class="diff">{#each lineDiff(f.before, f.after) as l, k (k)}<span class={l.op}
						>{l.op === 'del' ? '− ' : l.op === 'add' ? '+ ' : '  '}{l.text || ' '}
</span>{/each}</pre>
		{:else}
			<div class="inline">
				<del
					>{#if f.before}{f.before}{:else}<span class="null">(empty)</span>{/if}</del
				>
				<span aria-hidden="true">→</span>
				<ins
					>{#if f.after}{f.after}{:else}<span class="null">(empty)</span>{/if}</ins
				>
			</div>
		{/if}
	</div>
{/each}

<style>
	.field {
		margin: 0.5rem 0;
	}
	.label {
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-muted);
	}
	.stale {
		color: var(--warn);
		margin-left: 0.4rem;
	}
	.diff {
		margin: 0.2rem 0;
		padding: 0.4rem 0.5rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 12.5px;
	}
	.del,
	del {
		color: var(--danger);
		background: color-mix(in srgb, var(--danger) 10%, transparent);
	}
	.add,
	ins {
		color: var(--ok);
		background: color-mix(in srgb, var(--ok) 12%, transparent);
		text-decoration: none;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: baseline;
		white-space: pre-wrap;
	}
</style>
