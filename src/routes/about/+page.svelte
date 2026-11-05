<script lang="ts">
	import { REPO_URL } from '#lib/config.ts';
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>About · eCW Item Keys</title></svelte:head>

<div class="page prose">
	<h1>About</h1>
	<p>
		This site lists every eCW item key from <span class="mono">mobiledoc.dbo.itemkeys</span>, joined
		with community-maintained descriptions and categories. Search, filter and share links to any
		key; discuss a key; and propose better descriptions.
	</p>

	<h2>Searching</h2>
	<ul>
		<li>Words are combined: <code>claim batch</code> finds keys mentioning both.</li>
		<li><code>"exact phrase"</code> matches a phrase, even across line breaks.</li>
		<li><code>-word</code> excludes keys that mention it.</li>
		<li>
			<code>key:</code>, <code>remarks:</code>, <code>display:</code> and
			<code>description:</code> search a single column, e.g. <code>key:hpi</code>.
		</li>
		<li>
			Keyboard: <kbd>/</kbd> focuses search, <kbd>↑</kbd>/<kbd>↓</kbd> move,
			<kbd>Enter</kbd> opens, <kbd>Esc</kbd> closes.
		</li>
		<li>
			Only active keys are shown by default. Remove the <em>Status: Active</em> filter to include
			keys that have disappeared from eCW (marked <em>Expired</em>, with their last-known values).
		</li>
	</ul>

	<h2>Proposing an edit</h2>
	<ol>
		<li>Open a key and click <strong>Propose edit</strong>.</li>
		<li>
			Change the description or category. Line breaks and <code>|</code> are fine; the backtick
			<code>`</code> is not allowed. The key and the Added/Expired dates can't be edited.
		</li>
		<li>
			Click <strong>Open proposal on GitHub</strong>. GitHub opens in a new tab with everything
			filled in. You need a GitHub account. <strong>Click “Submit new issue”</strong> — the proposal isn't
			sent until you do.
		</li>
		<li>
			A bot checks the proposal within a minute and comments with a before/after view. A maintainer
			then approves or rejects it. Approved changes appear here a few minutes later.
		</li>
	</ol>
	<p>
		If someone else changes the same field first, your proposal is marked
		<em>conflict</em> instead of overwriting their change; open a new one from the app if it is still
		needed.
	</p>

	<h2>Discussing a key</h2>
	<p>
		Each key has its own discussion thread on GitHub Discussions, shown at the bottom of the key's
		details. Commenting needs a GitHub account. Threads are created with the first comment.
	</p>

	<h2>Where the data comes from</h2>
	<p>
		The item keys come from a periodic SQL export. When a new export arrives, new keys are marked
		<em>New</em> and keys that disappeared are marked <em>Expired</em> with the date they were first
		missing. See <a href={resolve('/health')}>Data health</a> for details.
	</p>
	<p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		Source and history: <a href={REPO_URL}>{REPO_URL.replace('https://', '')}</a>.
	</p>

	<h2 id="disclaimer">Disclaimer</h2>
	<p class="disclaimer">
		TakitoTech does not own, does not claim to own, and is not responsible for any of the content.
		All data are contributed by community members.
	</p>
</div>

<style>
	.prose {
		max-width: 46rem;
		line-height: 1.6;
	}
	h1 {
		font-size: 22px;
	}
	h2 {
		font-size: 16px;
		margin-top: 1.75rem;
	}
	.disclaimer {
		padding: 0.6rem 0.9rem;
		border-left: 3px solid var(--border);
		background: var(--bg-soft);
		border-radius: var(--radius);
	}
	code,
	kbd {
		font-family: var(--mono);
		font-size: 0.9em;
		background: var(--bg-soft);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 0.3em;
	}
</style>
