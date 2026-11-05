/** Per-device preferences in localStorage. Every access tolerates storage being unavailable. */

export function readPref<T>(name: string, fallback: T): T {
	try {
		const v = localStorage.getItem(`ecwitemkeys:${name}`);
		return v === null ? fallback : (JSON.parse(v) as T);
	} catch {
		return fallback;
	}
}

export function writePref(name: string, value: unknown): void {
	try {
		if (value === undefined) localStorage.removeItem(`ecwitemkeys:${name}`);
		else localStorage.setItem(`ecwitemkeys:${name}`, JSON.stringify(value));
	} catch {
		// Storage unavailable (private mode, blocked): preferences just don't persist.
	}
}
