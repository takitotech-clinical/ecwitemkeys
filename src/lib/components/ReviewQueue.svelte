<!--
	Maintainer review queue (PLAN §6.3). A fine-grained PAT stored on this device authenticates
	approve/reject; the apply Action re-checks the approver, so this is a convenience, not the
	enforcement point.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteSet } from 'svelte/reactivity';
	import approvers from '../../../config/approvers.json';
	import { LABELS } from '#lib/config.ts';
	import type { Dataset } from '#lib/data/model.ts';
	import { fieldIndex } from '#lib/data/schema.ts';
	import { forgetToken, loadToken, saveToken } from '#lib/github/auth.ts';
	import { checkProposal, staleFields, type Proposal } from '#lib/github/proposal.ts';
	import {
		addLabels,
		closeIssue,
		comment,
		getUser,
		listOpenProposals,
		type OpenProposal
	} from '#lib/github/proposals.ts';
	import ProposalDiff from './ProposalDiff.svelte';

	let { ds }: { ds: Dataset } = $props();

	let token = $state(loadToken());
	let tokenInput = $state('');
	let login = $state<string | null>(null);
	let authError = $state<string | null>(null);
	const isApprover = $derived(
		login !== null && (approvers as string[]).some((a) => a.toLowerCase() === login!.toLowerCase())
	);

	let proposals = $state.raw<OpenProposal[] | null>(null);
	let loadError = $state<string | null>(null);
	let stale = $state.raw<Map<number, string[]>>(new Map());
	let busy = $state<number | null>(null);
	let notice = $state<string | null>(null);
	let filter = $state<'all' | 'valid' | 'invalid' | 'conflict' | 'stale'>('all');
	let keyFilter = $state('');
	const selected = new SvelteSet<number>();
	let rejecting = $state<number | null>(null);
	let rejectReason = $state('');

	const schema = $derived(ds.bundle.additionalSchema);
	const ikCount = $derived(ds.bundle.itemkeysColumns.length);

	/** The key's current additional.rpt record, rebuilt from the loaded data. */
	function currentRecord(key: string): string[] | undefined {
		const i = ds.keyIndex.get(key);
		return i === undefined ? undefined : [key, ...(ds.rows[i].slice(ikCount) as string[])];
	}

	async function authenticate(t: string) {
		authError = null;
		try {
			login = (await getUser(t)).login;
			token = t;
			saveToken(t);
		} catch (e) {
			login = null;
			authError = `The token was not accepted (${e instanceof Error ? e.message : e}).`;
		}
	}

	async function load() {
		loadError = null;
		try {
			proposals = await listOpenProposals(token);
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		if (token && login === null && !authError) authenticate(token);
	});
	$effect(() => {
		void token;
		load();
	});
	$effect(() => {
		const list = proposals;
		if (!list) return;
		(async () => {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built locally, then assigned
			const m = new Map<number, string[]>();
			for (const p of list) {
				const cur = p.parsed.ok ? currentRecord(p.parsed.proposal.key) : undefined;
				if (p.parsed.ok && cur) m.set(p.number, await staleFields(p.parsed.proposal, schema, cur));
			}
			stale = m;
		})();
	});

	interface Row {
		p: OpenProposal;
		proposal: Proposal | null;
		errors: string[];
		status: 'valid' | 'invalid' | 'conflict' | 'unchecked';
		stale: string[];
		reason: string;
		expired: boolean;
	}

	function reasonOf(body: string): string {
		const m = /###\s+Reason \/ source\s*\n([\s\S]*?)(?=\n###\s|$)/.exec(
			body.replace(/\r\n/g, '\n')
		);
		const r = m?.[1].trim() ?? '';
		return r === '_No response_' ? '' : r;
	}

	const rows = $derived(
		(proposals ?? []).map((p): Row => {
			const proposal = p.parsed.ok ? p.parsed.proposal : null;
			const cur = proposal ? currentRecord(proposal.key) : undefined;
			const errors = p.parsed.ok ? checkProposal(p.parsed.proposal, schema, cur) : p.parsed.errors;
			const status = p.labels.includes(LABELS.conflict)
				? 'conflict'
				: p.labels.includes(LABELS.invalid) || errors.length > 0
					? 'invalid'
					: p.labels.includes(LABELS.valid)
						? 'valid'
						: 'unchecked';
			const i = proposal ? ds.keyIndex.get(proposal.key) : undefined;
			return {
				p,
				proposal,
				errors,
				status,
				stale: stale.get(p.number) ?? [],
				reason: reasonOf(p.body),
				expired: i !== undefined && ds.expired[i] === 1
			};
		})
	);
	const shown = $derived(
		rows.filter(
			(r) =>
				(filter === 'all' || (filter === 'stale' ? r.stale.length > 0 : r.status === filter)) &&
				(keyFilter === '' ||
					(r.proposal?.key ?? '').toLowerCase().includes(keyFilter.toLowerCase()))
		)
	);
	const approvable = (r: Row) =>
		(r.status === 'valid' || r.status === 'unchecked') &&
		r.errors.length === 0 &&
		r.stale.length === 0;

	function diffFields(r: Row) {
		if (!r.proposal) return [];
		const cur = currentRecord(r.proposal.key);
		return Object.entries(r.proposal.set).map(([id, after]) => ({
			id,
			label: schema.columns.find((c) => c.id === id)?.label ?? id,
			before: cur?.[fieldIndex(schema, id)] ?? '',
			after,
			stale: r.stale.includes(id)
		}));
	}

	function age(iso: string): string {
		const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
		return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
	}

	function done(numbers: number[], what: string) {
		proposals = (proposals ?? []).filter((p) => !numbers.includes(p.number));
		for (const n of numbers) selected.delete(n);
		notice = what;
	}

	async function approve(numbers: number[]) {
		if (!token) return;
		notice = null;
		for (const n of numbers) {
			busy = n;
			try {
				await addLabels(token, n, [LABELS.approved]);
			} catch (e) {
				notice = `Could not approve #${n}: ${e instanceof Error ? e.message : e}`;
				busy = null;
				return;
			}
		}
		busy = null;
		done(
			numbers,
			`Approved ${numbers.map((n) => `#${n}`).join(', ')}. The apply Action will commit the change.`
		);
	}

	async function reject(n: number) {
		if (!token || rejectReason.trim() === '') return;
		busy = n;
		try {
			await comment(token, n, `Rejected by @${login}: ${rejectReason.trim()}`);
			await addLabels(token, n, [LABELS.rejected]);
			await closeIssue(token, n, 'not_planned');
			rejecting = null;
			rejectReason = '';
			done([n], `Rejected #${n}.`);
		} catch (e) {
			notice = `Could not reject #${n}: ${e instanceof Error ? e.message : e}`;
		} finally {
			busy = null;
		}
	}
</script>

<section class="auth" aria-labelledby="auth-title">
	<h2 id="auth-title">Maintainer access</h2>
	{#if token && login}
		<p>
			Signed in as <strong>{login}</strong> —
			{#if isApprover}approver.{:else}<span class="warn"
					>not in config/approvers.json, so the queue is read-only.</span
				>{/if}
			<button
				class="btn"
				onclick={() => {
					forgetToken();
					token = null;
					login = null;
				}}>Forget token</button
			>
		</p>
	{:else}
		<p>
			<strong>Approvers don't need a token.</strong> Open a proposal on GitHub and add the
			<span class="mono">{LABELS.approved}</span> label; the apply Action commits it. The repository
			owner and everyone in <span class="mono">config/approvers.json</span> can approve.
		</p>
		<p class="help">
			To approve and reject from this page instead, paste a
			<strong>fine-grained personal access token</strong> limited to the
			<span class="mono">takitotech-clinical/ecwitemkeys</span> repository with
			<em>Issues: read and write</em> and <em>Metadata: read</em>, expiring in 90 days or less. It
			is stored in this browser only (localStorage). Anyone with access to this device and browser
			profile can use it until you click “Forget token” or it expires — don't use a shared computer.
		</p>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				if (tokenInput.trim()) authenticate(tokenInput.trim());
				tokenInput = '';
			}}
		>
			<label class="sr-only" for="token">GitHub token</label>
			<input
				id="token"
				type="password"
				autocomplete="off"
				bind:value={tokenInput}
				placeholder="github_pat_…"
			/>
			<button class="btn primary" type="submit">Save token</button>
		</form>
		{#if authError}<p class="error" role="alert">{authError}</p>{/if}
	{/if}
</section>

<section aria-labelledby="queue-title">
	<div class="queue-head">
		<h2 id="queue-title">
			Open proposals {#if proposals}<span class="muted">({proposals.length})</span>{/if}
		</h2>
		<label>
			Show
			<select bind:value={filter}>
				<option value="all">All</option>
				<option value="valid">Valid</option>
				<option value="invalid">Invalid</option>
				<option value="conflict">Conflict</option>
				<option value="stale">Stale</option>
			</select>
		</label>
		<label>
			Key <input type="search" bind:value={keyFilter} placeholder="Filter by key" />
		</label>
		<button class="btn" onclick={load}>Refresh</button>
		{#if isApprover}
			<button
				class="btn primary"
				disabled={selected.size === 0 || busy !== null}
				onclick={() => approve([...selected])}>Approve selected ({selected.size})</button
			>
		{/if}
	</div>
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{#if loadError}
		<p class="error" role="alert">Could not load proposals: {loadError}</p>
	{:else if !proposals}
		<p>Loading…</p>
	{:else if shown.length === 0}
		<p class="muted">No proposals to show.</p>
	{/if}

	<ul class="list">
		{#each shown as r (r.p.number)}
			<li class="card">
				<div class="top">
					{#if isApprover && approvable(r)}
						<input
							type="checkbox"
							aria-label="Select #{r.p.number} for bulk approval"
							checked={selected.has(r.p.number)}
							onchange={(e) =>
								e.currentTarget.checked ? selected.add(r.p.number) : selected.delete(r.p.number)}
						/>
					{/if}
					{#if r.proposal}
						<a
							class="mono key"
							href="{resolve('/')}?status=all&key={encodeURIComponent(r.proposal.key)}"
							>{r.proposal.key}</a
						>
					{:else}
						<span class="muted">{r.p.title}</span>
					{/if}
					{#if r.expired}<span class="badge expired">Expired</span>{/if}
					<span class="badge status-{r.status}"
						>{r.status === 'unchecked' ? 'not yet checked' : r.status}</span
					>
					{#if r.stale.length > 0}<span class="badge pending">stale</span>{/if}
				</div>
				<div class="meta">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
					<a href={r.p.url} target="_blank" rel="noopener">#{r.p.number}</a>
					by {r.p.author} · {age(r.p.createdAt)}
				</div>
				{#if r.errors.length > 0}
					<ul class="errors">
						{#each r.errors as e (e)}<li>{e}</li>{/each}
					</ul>
				{/if}
				<ProposalDiff fields={diffFields(r)} />
				{#if r.stale.length > 0}
					<p class="warn">
						⚠ {r.stale.join(', ')} changed after this proposal was prepared. Check the current value;
						the apply Action will refuse it as a conflict.
					</p>
				{/if}
				{#if r.reason}<p class="reason"><strong>Reason:</strong> {r.reason}</p>{/if}
				{#if isApprover}
					<div class="actions">
						<button
							class="btn primary"
							disabled={busy !== null || r.errors.length > 0}
							onclick={() => approve([r.p.number])}>Approve</button
						>
						{#if rejecting === r.p.number}
							<label class="sr-only" for="reject-{r.p.number}">Reason for rejecting</label>
							<input
								id="reject-{r.p.number}"
								class="reject-reason"
								bind:value={rejectReason}
								placeholder="Reason (required)"
							/>
							<button
								class="btn danger"
								disabled={busy !== null || rejectReason.trim() === ''}
								onclick={() => reject(r.p.number)}>Confirm reject</button
							>
							<button class="btn" onclick={() => (rejecting = null)}>Cancel</button>
						{:else}
							<button
								class="btn danger"
								disabled={busy !== null}
								onclick={() => {
									rejecting = r.p.number;
									rejectReason = '';
								}}>Reject…</button
							>
						{/if}
					</div>
				{:else if !login && approvable(r)}
					<div class="actions">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
						<a class="btn" href={r.p.url} target="_blank" rel="noopener">Approve on GitHub</a>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	h2 {
		font-size: 16px;
	}
	.help,
	.muted {
		color: var(--fg-muted);
	}
	.help {
		font-size: 13px;
	}
	form {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	input,
	select {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	#token {
		flex: 1;
		min-width: 14rem;
	}
	.queue-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1.5rem;
	}
	.queue-head h2 {
		margin: 0 auto 0 0;
	}
	.list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 0.9rem;
	}
	.top {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.key {
		font-weight: 600;
		white-space: pre;
	}
	.meta {
		font-size: 13px;
		color: var(--fg-muted);
		margin: 0.2rem 0;
	}
	.status-valid {
		color: var(--ok);
	}
	.status-invalid {
		color: var(--danger);
	}
	.status-conflict {
		color: var(--warn);
	}
	.errors,
	.error {
		color: var(--danger);
		font-size: 13px;
	}
	.warn {
		color: var(--warn);
		font-size: 13px;
	}
	.reason {
		font-size: 13px;
		white-space: pre-wrap;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.reject-reason {
		flex: 1;
		min-width: 12rem;
	}
	.notice {
		padding: 0.4rem 0.7rem;
		background: var(--bg-active);
		border-radius: var(--radius);
	}
</style>
