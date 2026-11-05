/**
 * Search normalization: lowercase, NFKD with diacritics stripped, and all whitespace (line
 * breaks included) collapsed to one space and trimmed. Computed once per value at load time.
 */
export function normalize(s: string | null): string {
	if (!s) return '';
	return s
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}
