import { describe, expect, it } from 'vitest';
import {
	formatLocalDate,
	formatLocalDateTime,
	isTimestamp,
	localDayKey,
	parseCompletionTime,
	toTimestamp
} from '../../src/lib/data/dates.ts';

describe('timestamps', () => {
	it('accepts only real UTC timestamps in the exact format', () => {
		expect(isTimestamp('2026-11-04T14:03:27Z')).toBe(true);
		expect(isTimestamp('2026-11-04T14:03:27.000Z')).toBe(false);
		expect(isTimestamp('2026-11-04 14:03:27Z')).toBe(false);
		expect(isTimestamp('2026-02-30T00:00:00Z')).toBe(false);
		expect(isTimestamp('2026-11-04T14:03:27+00:00')).toBe(false);
	});

	it('parses the SSMS completion time with 7 fractional digits and an offset', () => {
		const d = parseCompletionTime('2026-11-03T18:06:30.0935360-05:00')!;
		expect(toTimestamp(d)).toBe('2026-11-03T23:06:30Z');
	});
});

describe('display in the viewer timezone', () => {
	// 23:30 UTC on Nov 4 is Nov 4 in New York but Nov 5 in Tokyo.
	const ts = '2026-11-04T23:30:00Z';
	const zones = {
		UTC: ['Nov 4, 2026', '2026-11-04', /11:30:00 PM UTC/],
		'America/New_York': ['Nov 4, 2026', '2026-11-04', /6:30:00 PM EST/],
		'Asia/Tokyo': ['Nov 5, 2026', '2026-11-05', /8:30:00 AM GMT\+9/]
	} as const;

	for (const [timeZone, [date, day, full]] of Object.entries(zones)) {
		it(`formats for ${timeZone}`, () => {
			expect(formatLocalDate(ts, { timeZone })).toBe(date);
			expect(localDayKey(ts, { timeZone })).toBe(day);
			expect(formatLocalDateTime(ts, { timeZone })).toMatch(full);
		});
	}

	it('uses the process timezone by default', () => {
		const expected = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(ts));
		expect(formatLocalDate(ts)).toBe(expected);
	});
});
