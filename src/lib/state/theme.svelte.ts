/**
 * Theme preference: follow the system, or force light or dark. The choice is stored per device
 * and applied as data-theme on <html>; app.html applies the stored choice before first paint.
 */
import { readPref, writePref } from './prefs.ts';

export type ThemeChoice = 'system' | 'light' | 'dark';

const ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

function systemDark(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

class Theme {
	choice = $state<ThemeChoice>('system');
	#systemDark = $state(false);

	/** The theme actually shown. */
	resolved = $derived<'light' | 'dark'>(
		this.choice === 'system' ? (this.#systemDark ? 'dark' : 'light') : this.choice
	);

	/** Reads the stored choice and tracks system changes. Call once from the root layout. */
	init(): () => void {
		const stored = readPref<string>('theme', 'system');
		this.choice = ORDER.includes(stored as ThemeChoice) ? (stored as ThemeChoice) : 'system';
		this.#systemDark = systemDark();
		const mq = matchMedia('(prefers-color-scheme: dark)');
		const onChange = (e: MediaQueryListEvent) => (this.#systemDark = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	}

	set(choice: ThemeChoice): void {
		this.choice = choice;
		writePref('theme', choice === 'system' ? undefined : choice);
		if (choice === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = choice;
	}

	/** Next choice in the cycle system → light → dark. */
	get next(): ThemeChoice {
		return ORDER[(ORDER.indexOf(this.choice) + 1) % ORDER.length];
	}
}

export const theme = new Theme();
