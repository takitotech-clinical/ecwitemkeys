<!--
	Propose an edit to the user columns of one row (PLAN §6.1). Key and managed dates are shown
	read-only; only changed fields go into the proposal; it opens as a prefilled GitHub issue.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { Dataset } from '#lib/data/model.ts';
	import { maxLengthOf } from '#lib/data/schema.ts';
	import { normalizeInput, validateUserValue, valueLength } from '#lib/data/validate.ts';
	import { buildIssueUrl } from '#lib/github/issueUrl.ts';
	import { baseHash, type Proposal } from '#lib/github/proposal.ts';
	import Timestamp from './Timestamp.svelte';

	let { ds, i, oncancel }: { ds: Dataset; i: number; oncancel: () => void } = $props();

	const key = $derived(ds.keys[i]);
	const userCols = $derived(ds.columns.filter((c) => c.source === 'additional' && !c.def?.managed));
	const managed = $derived(ds.columns.filter((c) => c.def?.managed));
	const current = (id: string) => ds.rows[i][ds.byId.get(id)!.index] ?? '';

	// The form starts from the row's current values (it is re-created per row).
	let values = $state<Record<string, string>>(
		untrack(() => Object.fromEntries(userCols.map((c) => [c.id, ds.rows[i][c.index] ?? ''])))
	);
	let reason = $state('');
	let opened = $state<string | null>(null);
	let urlError = $state<string | null>(null);

	const normalized = $derived(
		Object.fromEntries(Object.entries(values).map(([id, v]) => [id, normalizeInput(v)]))
	);
	const errors = $derived(
		Object.fromEntries(
			userCols.map((c) => [c.id, c.def ? validateUserValue(c.def, normalized[c.id]) : []])
		)
	);
	const changed = $derived(
		userCols.filter((c) => normalized[c.id] !== current(c.id)).map((c) => c.id)
	);
	const valid = $derived(Object.values(errors).every((e) => e.length === 0));
	const canSubmit = $derived(valid && changed.length > 0);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!canSubmit) return;
		const proposal: Proposal = { v: 1, key, base: {}, set: {} };
		for (const id of changed) {
			proposal.set[id] = normalized[id];
			proposal.base[id] = await baseHash(current(id));
		}
		const { url, tooLong } = buildIssueUrl(proposal, normalizeInput(reason));
		if (tooLong) {
			urlError =
				'This proposal is too long to send through a GitHub link. Shorten the text, or open an issue on GitHub and paste it there.';
			return;
		}
		urlError = null;
		opened = url;
		window.open(url, '_blank', 'noopener');
	}
</script>

<form class="propose" onsubmit={submit} aria-labelledby="propose-title" novalidate>
	<h3 id="propose-title">Propose an edit</h3>
	<p class="help">
		Your proposal opens as a prefilled GitHub issue in a new tab. Review it there and click
		<strong>Submit new issue</strong>. A maintainer approves it before it changes the data.
	</p>

	<dl class="readonly">
		<dt>Key</dt>
		<dd class="mono">{key}</dd>
		{#each managed as c (c.id)}
			<dt>{c.label}</dt>
			<dd>
				{#if ds.rows[i][c.index]}<Timestamp value={ds.rows[i][c.index]} full />{:else}—{/if}
			</dd>
		{/each}
	</dl>

	{#each userCols as c (c.id)}
		{@const def = c.def!}
		{@const errs = errors[c.id]}
		<div class="field" class:changed={changed.includes(c.id)}>
			<label for="f-{c.id}">{c.label}</label>
			{#if def.help}<p class="hint" id="h-{c.id}">{def.help}</p>{/if}
			{#if def.type === 'enum'}
				<select
					id="f-{c.id}"
					bind:value={values[c.id]}
					aria-describedby={def.help ? `h-${c.id}` : undefined}
				>
					<option value="">(not set)</option>
					{#each def.values ?? [] as v (v)}<option value={v}>{v}</option>{/each}
				</select>
			{:else if def.type === 'date'}
				<input id="f-{c.id}" type="date" bind:value={values[c.id]} />
			{:else if def.multiline}
				<textarea
					id="f-{c.id}"
					rows="6"
					bind:value={values[c.id]}
					aria-invalid={errs.length > 0}
					aria-describedby="e-{c.id} n-{c.id}"></textarea>
			{:else}
				<input
					id="f-{c.id}"
					type="text"
					bind:value={values[c.id]}
					aria-invalid={errs.length > 0}
					aria-describedby="e-{c.id}"
				/>
			{/if}
			{#if def.type === 'text'}
				<div
					class="counter"
					id="n-{c.id}"
					class:over={valueLength(normalized[c.id]) > maxLengthOf(def)}
				>
					{valueLength(normalized[c.id]).toLocaleString()} / {maxLengthOf(def).toLocaleString()}
				</div>
			{/if}
			<ul class="errors" id="e-{c.id}" aria-live="polite">
				{#each errs as e (e)}<li>{e}</li>{/each}
			</ul>
		</div>
	{/each}

	<div class="field">
		<label for="f-reason">Reason / source <span class="opt">(optional)</span></label>
		<textarea id="f-reason" rows="2" bind:value={reason}></textarea>
	</div>

	{#if urlError}<p class="errors" role="alert">{urlError}</p>{/if}
	{#if opened}
		<p class="opened" role="status">
			GitHub opened in a new tab. If it didn't,
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
			<a href={opened} target="_blank" rel="noopener">open the proposal on GitHub</a>.
		</p>
	{/if}

	<div class="actions">
		<button class="btn primary" type="submit" disabled={!canSubmit}>Open proposal on GitHub</button>
		<button class="btn" type="button" onclick={oncancel}>Cancel</button>
		{#if valid && changed.length === 0}<span class="hint">Change a field to propose an edit.</span
			>{/if}
	</div>
</form>

<style>
	.propose {
		margin-top: 1rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-soft);
	}
	h3 {
		margin: 0 0 0.4rem;
		font-size: 15px;
	}
	.help,
	.hint {
		color: var(--fg-muted);
		font-size: 13px;
		margin: 0.2rem 0;
	}
	.readonly {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.15rem 0.75rem;
		font-size: 13px;
	}
	.readonly dt {
		color: var(--fg-muted);
	}
	.readonly dd {
		margin: 0;
		white-space: pre-wrap;
	}
	.field {
		margin-top: 0.9rem;
	}
	.field label {
		font-weight: 600;
		display: block;
	}
	.field.changed label::after {
		content: ' • changed';
		color: var(--accent);
		font-weight: 400;
		font-size: 12px;
	}
	textarea,
	input,
	select {
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	textarea {
		resize: vertical;
	}
	[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.counter {
		text-align: right;
		font-size: 12px;
		color: var(--fg-muted);
	}
	.counter.over {
		color: var(--danger);
	}
	.errors {
		color: var(--danger);
		font-size: 13px;
		margin: 0.2rem 0 0;
		padding-left: 1.1rem;
	}
	.errors:empty {
		display: none;
	}
	.opt {
		font-weight: 400;
		color: var(--fg-muted);
	}
	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.opened {
		font-size: 13px;
	}
</style>
