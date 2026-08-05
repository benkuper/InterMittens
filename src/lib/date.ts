const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const frenchMonthPattern = String.raw`(?:janv(?:ier)?\.?|fevr(?:ier)?\.?|fev(?:rier)?\.?|mars|avr(?:il)?\.?|mai|juin|juil(?:let)?\.?|aout|sept(?:embre)?\.?|oct(?:obre)?\.?|nov(?:embre)?\.?|dec(?:embre)?\.?)`;
export const frenchNumericDatePattern = String.raw`[0-3]?\d\s*[\/.-]\s*[01]?\d\s*[\/.-]\s*(?:\d{4}|\d{2})`;
export const frenchTextualDatePattern = String.raw`(?:1er|[0-3]?\d)\s+${frenchMonthPattern}\s+(?:\d{4}|\d{2})`;
export const frenchIsoDatePattern = String.raw`\d{4}-[01]?\d-[0-3]?\d`;
export const frenchDatePattern = String.raw`(?:${frenchIsoDatePattern}|${frenchNumericDatePattern}|${frenchTextualDatePattern})`;

export function normalizeDateText(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[\u2019']/g, ' ')
		.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
		.replace(/\u0000/g, '')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
		.toLowerCase();
}

function isValidDate(year: number, month: number, day: number) {
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

function isoFromParts(year: number, month: number, day: number) {
	const fullYear = year < 100 ? 2000 + year : year;
	if (!isValidDate(fullYear, month, day)) return '';

	return `${String(fullYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
		day
	).padStart(2, '0')}`;
}

function monthNumber(value: string) {
	const month = normalizeDateText(value).replace(/\.$/, '');

	if (month.startsWith('janv')) return 1;
	if (month.startsWith('fev')) return 2;
	if (month === 'mars') return 3;
	if (month.startsWith('avr')) return 4;
	if (month === 'mai') return 5;
	if (month === 'juin') return 6;
	if (month.startsWith('juil')) return 7;
	if (month === 'aout') return 8;
	if (month.startsWith('sept')) return 9;
	if (month.startsWith('oct')) return 10;
	if (month.startsWith('nov')) return 11;
	if (month.startsWith('dec')) return 12;

	return 0;
}

export function parseFrenchDate(value: string | undefined) {
	if (!value) return '';

	const raw = value.trim();
	const isoMatch = raw.match(isoDatePattern);
	if (isoMatch) {
		return isoFromParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
	}

	const normalized = normalizeDateText(raw);
	const numericMatch = normalized.match(
		/\b([0-3]?\d)\s*[\/.-]\s*([01]?\d)\s*[\/.-]\s*(\d{4}|\d{2})\b/
	);

	if (numericMatch) {
		return isoFromParts(Number(numericMatch[3]), Number(numericMatch[2]), Number(numericMatch[1]));
	}

	const textualMatch = normalized.match(
		new RegExp(String.raw`\b(1er|[0-3]?\d)\s+(${frenchMonthPattern})\s+(\d{4}|\d{2})\b`, 'i')
	);

	if (textualMatch) {
		const day = textualMatch[1] === '1er' ? 1 : Number(textualMatch[1]);
		return isoFromParts(Number(textualMatch[3]), monthNumber(textualMatch[2]), day);
	}

	return '';
}

export function extractFrenchDate(value: string) {
	const match = normalizeDateText(value).match(new RegExp(frenchDatePattern, 'i'));
	return parseFrenchDate(match?.[0]);
}

export function formatIsoDateFr(value: string | undefined) {
	const iso = parseFrenchDate(value);
	if (!iso) return '';

	const [, year, month, day] = iso.match(isoDatePattern) ?? [];
	return year && month && day ? `${day}/${month}/${year}` : '';
}
