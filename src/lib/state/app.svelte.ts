/** Data shared by every route: loaded once per page load. */
import { buildDataset, type Dataset } from '../data/model.ts';
import { loadBundle, watchVersion, type Version } from '../data/load.ts';

class AppData {
	ds = $state.raw<Dataset | null>(null);
	error = $state<string | null>(null);
	version = $state.raw<Version | null>(null);
	updateAvailable = $state(false);
	#loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.#loading ??= loadBundle()
			.then(({ version, bundle }) => {
				this.version = version;
				this.ds = buildDataset(bundle);
				watchVersion(version, () => (this.updateAvailable = true));
			})
			.catch((e: unknown) => {
				this.error = e instanceof Error ? e.message : String(e);
			});
		return this.#loading;
	}
}

export const app = new AppData();
