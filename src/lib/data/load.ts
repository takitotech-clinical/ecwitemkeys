/** Browser loading (PLAN §4.2): version.json (no-cache), then the immutable hashed bundle. */
import { asset } from '$app/paths';
import type { ItemsBundle } from './join.ts';

/** The data files are generated at build time, so they aren't in the typed asset list. */
const dataUrl = (file: string) => asset(`data/${file}` as Parameters<typeof asset>[0]);

export interface Version {
	file: string;
	generatedAt: string;
}

export async function fetchVersion(): Promise<Version> {
	const res = await fetch(dataUrl('version.json'), { cache: 'no-cache' });
	if (!res.ok) throw new Error(`Could not load data version (${res.status})`);
	return res.json();
}

export async function loadBundle(): Promise<{ version: Version; bundle: ItemsBundle }> {
	const version = await fetchVersion();
	const res = await fetch(dataUrl(version.file));
	if (!res.ok) throw new Error(`Could not load data (${res.status})`);
	return { version, bundle: await res.json() };
}

const CHECK_INTERVAL = 10 * 60 * 1000;

/**
 * Re-checks version.json when the window regains focus, at most every 10 minutes, and calls
 * `onUpdate` once a newer file is published. Returns a cleanup function.
 */
export function watchVersion(current: Version, onUpdate: (v: Version) => void): () => void {
	let last = Date.now();
	let done = false;
	const check = async () => {
		if (done || Date.now() - last < CHECK_INTERVAL) return;
		last = Date.now();
		try {
			const v = await fetchVersion();
			if (v.file !== current.file) {
				done = true;
				onUpdate(v);
			}
		} catch {
			// Offline or transient: try again later.
		}
	};
	const onVisible = () => document.visibilityState === 'visible' && check();
	window.addEventListener('focus', check);
	document.addEventListener('visibilitychange', onVisible);
	const timer = setInterval(check, CHECK_INTERVAL);
	return () => {
		window.removeEventListener('focus', check);
		document.removeEventListener('visibilitychange', onVisible);
		clearInterval(timer);
	};
}
