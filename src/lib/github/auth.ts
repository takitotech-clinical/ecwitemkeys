/** The review queue's fine-grained PAT, kept in localStorage on this device only (PLAN §6.3). */
const KEY = 'ecwitemkeys:github-token';

export function loadToken(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function saveToken(token: string): void {
	try {
		localStorage.setItem(KEY, token);
	} catch {
		// Storage unavailable: the token lasts for this page view only.
	}
}

export function forgetToken(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing stored.
	}
}
