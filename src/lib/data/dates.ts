/**
 * Managed timestamps are stored in UTC as `YYYY-MM-DDTHH:MM:SSZ` and shown in the viewer's
 * timezone (PLAN §2.5).
 */

export const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real UTC timestamp in the exact `YYYY-MM-DDTHH:MM:SSZ` format. */
export function isTimestamp(s: string): boolean {
	if (!TIMESTAMP_RE.test(s)) return false;
	const d = new Date(s);
	return !Number.isNaN(d.getTime()) && toTimestamp(d) === s;
}

/** True for a real calendar date `YYYY-MM-DD`. */
export function isDate(s: string): boolean {
	return DATE_RE.test(s) && isTimestamp(`${s}T00:00:00Z`);
}

/** Formats a Date as a UTC timestamp, truncated to whole seconds. */
export function toTimestamp(d: Date): string {
	return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function nowTimestamp(): string {
	return toTimestamp(new Date());
}

/**
 * Parses an SSMS `Completion time` such as `2026-11-03T18:06:30.0935360-05:00` (7 fractional
 * digits, which `Date` does not accept).
 */
export function parseCompletionTime(s: string): Date | null {
	const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(
		s.trim()
	);
	if (!m) return null;
	const ms = m[2] ? `.${m[2].padEnd(3, '0').slice(0, 3)}` : '';
	const d = new Date(`${m[1]}${ms}${m[3] ?? 'Z'}`);
	return Number.isNaN(d.getTime()) ? null : d;
}

export interface DisplayOptions {
	/** IANA zone; defaults to the viewer's own. */
	timeZone?: string;
	locale?: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(kind: string, o: DisplayOptions, f: Intl.DateTimeFormatOptions) {
	const id = `${kind}|${o.locale ?? ''}|${o.timeZone ?? ''}`;
	let fmt = formatters.get(id);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat(o.locale ?? 'en-US', { ...f, timeZone: o.timeZone });
		formatters.set(id, fmt);
	}
	return fmt;
}

/** Short local date, e.g. "Nov 4, 2026". */
export function formatLocalDate(ts: string | Date, o: DisplayOptions = {}): string {
	return formatter('date', o, { dateStyle: 'medium' }).format(new Date(ts));
}

/** Short local time, e.g. "9:03 AM". */
export function formatLocalTime(ts: string | Date, o: DisplayOptions = {}): string {
	return formatter('time', o, { timeStyle: 'short' }).format(new Date(ts));
}

/** Full local date and time with zone, e.g. "Nov 4, 2026, 9:03:27 AM EST". */
export function formatLocalDateTime(ts: string | Date, o: DisplayOptions = {}): string {
	return formatter('datetime', o, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
		timeZoneName: 'short'
	}).format(new Date(ts));
}

/** The local calendar day of a timestamp as `YYYY-MM-DD`, for grouping. */
export function localDayKey(ts: string | Date, o: DisplayOptions = {}): string {
	const parts = formatter(
		'day',
		{ ...o, locale: 'en-CA' },
		{
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}
	).formatToParts(new Date(ts));
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')}`;
}
