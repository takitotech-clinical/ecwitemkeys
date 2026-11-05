/** Data shared by every route: loaded once per page load. */
import { buildDataset, type Dataset } from '../data/model.ts';
import { loadBundle, watchVersion, type Version } from '../data/load.ts';
import { cachedOpenProposals, type OpenProposal } from '../github/proposals.ts';

class AppData {
	ds = $state.raw<Dataset | null>(null);
	error = $state<string | null>(null);
	version = $state.raw<Version | null>(null);
	updateAvailable = $state(false);
	/** Open proposals for pending badges; null until loaded or if GitHub is unavailable. */
	proposals = $state.raw<OpenProposal[] | null>(null);
	#loading: Promise<void> | null = null;

	/** Open proposals by key. */
	proposalsByKey = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt, never mutated later
		const m = new Map<string, OpenProposal[]>();
		for (const p of this.proposals ?? []) {
			if (p.key !== null) m.set(p.key, [...(m.get(p.key) ?? []), p]);
		}
		return m;
	});

	loadProposals(): void {
		cachedOpenProposals().then((p) => (this.proposals = p));
	}

	load(): Promise<void> {
		this.#loading ??= loadBundle()
			.then(({ version, bundle }) => {
				this.version = version;
				this.ds = buildDataset(bundle);
				watchVersion(version, () => (this.updateAvailable = true));
				this.loadProposals();
			})
			.catch((e: unknown) => {
				this.error = e instanceof Error ? e.message : String(e);
			});
		return this.#loading;
	}
}

export const app = new AppData();
