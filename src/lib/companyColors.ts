export const companyColorPalette = [
	'#67d8c2',
	'#d9b15f',
	'#ef7d75',
	'#8fb7ff',
	'#b78cff',
	'#7ddc83',
	'#f095c8',
	'#6fd0ff',
	'#f0a15f',
	'#a6d86b',
	'#d889ff',
	'#8bd6a8'
];

function hashString(value: string) {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}

	return hash;
}

export function defaultCompanyColor(seed: string) {
	const index = hashString(seed || 'structure') % companyColorPalette.length;
	return companyColorPalette[index];
}

export function normalizeCompanyColor(value: string, seed: string) {
	return /^#[0-9a-f]{6}$/i.test(value) ? value : defaultCompanyColor(seed);
}
