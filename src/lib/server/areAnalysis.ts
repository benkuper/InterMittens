import type { IntermittencePeriod } from '$lib/types';
import { frenchDatePattern, parseFrenchDate } from '$lib/date';

const moneyPattern = String.raw`([0-9]{1,3}(?:[\s.][0-9]{3})+(?:[,.][0-9]{1,2})?|[0-9]+(?:[,.][0-9]{1,2}))`;
const numberPattern = String.raw`([0-9]+(?:[,.][0-9]+)?)`;
const dateCapture = String.raw`(${frenchDatePattern})`;

function normalizeForSearch(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[\u2019']/g, ' ')
		.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
		.replace(/\u0000/g, '')
		.replace(/\r/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function toNumber(value: string | undefined) {
	if (!value) return 0;
	const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+^${}()|[\]\\]/g, '\\$&');
}

function labelPattern(label: string) {
	return escapeRegExp(normalizeForSearch(label)).replace(/\s+/g, String.raw`\s+`);
}

function fiscalWithholdingContext(value: string) {
	return /impot|prelevement|source|revenu|fiscal|mis en place|csg/.test(
		normalizeForSearch(value).toLowerCase()
	);
}

function matchDate(
	text: string,
	labels: string[],
	distance = 180,
	options: { rejectContext?: (context: string) => boolean } = {}
) {
	for (const label of labels) {
		const pattern = new RegExp(`${labelPattern(label)}[\\s\\S]{0,${distance}}?${dateCapture}`, 'i');
		const globalPattern = new RegExp(pattern.source, 'gi');
		for (const match of text.matchAll(globalPattern)) {
			const start = match.index ?? 0;
			const context = text.slice(start, start + match[0].length);
			const value = parseFrenchDate(match[1]);
			if (value && !options.rejectContext?.(context)) return value;
		}
	}

	return '';
}

function matchIssueDate(text: string) {
	const head = text.slice(0, 1000);
	const pattern = new RegExp(
		String.raw`(?:^|[\n ])[a-z][a-z\s-]{1,40},\s+le\s+${dateCapture}`,
		'i'
	);
	return parseFrenchDate(head.match(pattern)?.[1]);
}

function matchNumber(text: string, labels: string[]) {
	for (const label of labels) {
		const normalizedLabel = labelPattern(label);
		const beforePattern = new RegExp(
			`${numberPattern}\\s*(?:jours?|heures?)?(?:\\s+de)?\\s+${normalizedLabel}`,
			'i'
		);
		const beforeValue = toNumber(text.match(beforePattern)?.[1]);
		if (beforeValue) return beforeValue;

		const afterPattern = new RegExp(`${normalizedLabel}.{0,90}?${numberPattern}`, 'i');
		const afterValue = toNumber(text.match(afterPattern)?.[1]);
		if (afterValue) return afterValue;
	}

	return 0;
}

function matchMoney(text: string, labels: string[]) {
	for (const label of labels) {
		const pattern = new RegExp(
			`${labelPattern(label)}.{0,120}?${moneyPattern}\\s*(?:EUR|euros)`,
			'i'
		);
		const value = toNumber(text.match(pattern)?.[1]);
		if (value) return value;
	}

	return 0;
}

function matchReferencePeriod(text: string) {
	const patterns = [
		String.raw`periode[\s\S]{0,80}?reference[\s\S]{0,140}?(?:du|entre\s+le)\s+${dateCapture}[\s\S]{0,80}?(?:au|et\s+le)\s+${dateCapture}`,
		String.raw`reference[\s\S]{0,140}?(?:du|entre\s+le)\s+${dateCapture}[\s\S]{0,80}?(?:au|et\s+le)\s+${dateCapture}`,
		String.raw`affiliation[\s\S]{0,140}?(?:du|entre\s+le)\s+${dateCapture}[\s\S]{0,80}?(?:au|et\s+le)\s+${dateCapture}`,
		String.raw`recherche[\s\S]{0,140}?(?:du|entre\s+le)\s+${dateCapture}[\s\S]{0,80}?(?:au|et\s+le)\s+${dateCapture}`,
		String.raw`507[\s\S]{0,140}?(?:du|entre\s+le)\s+${dateCapture}[\s\S]{0,80}?(?:au|et\s+le)\s+${dateCapture}`,
		String.raw`periode\s+du\s+${dateCapture}[\s\S]{0,80}?(?:au|et\s+le)\s+${dateCapture}`
	];

	const match = patterns.map((pattern) => text.match(new RegExp(pattern, 'i'))).find(Boolean);

	return {
		referenceStartDate: parseFrenchDate(match?.[1]),
		referenceEndDate: parseFrenchDate(match?.[2])
	};
}

function addOneYearMinusOneDay(value: string) {
	if (!value) return '';
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return '';
	date.setFullYear(date.getFullYear() + 1);
	date.setDate(date.getDate() - 1);
	return date.toISOString().slice(0, 10);
}

function labelFromDates(start: string, end: string) {
	const startYear = start.slice(0, 4);
	const endYear = end.slice(0, 4);
	if (startYear && endYear && startYear !== endYear) return `ARE ${startYear}-${endYear}`;
	const year = startYear || endYear;
	return year ? `ARE ${year}` : 'Notification ARE';
}

function preview(text: string) {
	return text.length > 1400 ? `${text.slice(0, 1400)}...` : text;
}

export function analyzeAreNotification(
	text: string,
	source: {
		id: string;
		fileName: string;
		storedName: string;
	}
): IntermittencePeriod {
	const normalized = normalizeForSearch(text);
	const { referenceStartDate, referenceEndDate } = matchReferencePeriod(normalized);
	const indemnizationStartDate =
		matchDate(normalized, [
			'vous etes indemnisable a partir du',
			'vous etes indemnisable a compter du',
			'indemnisable a partir du',
			'indemnisable a compter du',
			'prise en charge a compter du',
			'vos droits debutent le',
			'debut de votre indemnisation',
			'debut d indemnisation',
			'indemnisation debute',
			'indemnisation prendra effet'
		]) ||
		matchDate(normalized, ['a partir du'], 120, { rejectContext: fiscalWithholdingContext }) ||
		matchDate(normalized, ['a compter du'], 120, { rejectContext: fiscalWithholdingContext });
	const anniversaryDate =
		matchDate(normalized, [
			'date anniversaire',
			'anniversaire',
			'fin de droits',
			'droits sont ouverts jusqu au',
			'jusqu au'
		]) || addOneYearMinusOneDay(indemnizationStartDate);
	const admissionDate =
		matchIssueDate(normalized) ||
		matchDate(normalized, ['notification du', 'decision du']) ||
		matchDate(normalized, [
			'admission au benefice',
			'ouverture de droits',
			'ouverture de droit',
			'ouvertures de droits'
		]);
	const dailyAllowance = matchMoney(normalized, [
		'allocation journaliere',
		'allocation journaliere nette',
		'allocation brute journaliere',
		'montant journalier',
		'montant de votre allocation'
	]);
	const hours = matchNumber(normalized, [
		'heures retenues',
		'nombre d heures',
		'nombre d heures travaillees',
		'heures prises en compte',
		'total heures',
		'heures'
	]);
	const cachets = matchNumber(normalized, ['cachets retenus', 'nombre de cachets', 'cachets']);
	const grossSalary = matchMoney(normalized, [
		'salaire de reference',
		'salaires de reference',
		'remunerations retenues',
		'remuneration brute',
		'salaire brut'
	]);
	const waitingDays = matchNumber(normalized, ['delai d attente', 'attente']);
	const salaryFranchiseDays = matchNumber(normalized, [
		'franchise salaire',
		'franchise salaires',
		'franchise specifique'
	]);
	const congeFranchiseDays = matchNumber(normalized, [
		'franchise conges payes',
		'franchise conges spectacles',
		'conges spectacles'
	]);
	const notes: string[] = [];

	if (!normalized) {
		notes.push('Aucun texte exploitable détecté. Un scan image nécessitera une OCR externe.');
	} else if (!indemnizationStartDate && !anniversaryDate && !dailyAllowance) {
		notes.push('Texte détecté, mais les champs principaux de notification ARE restent à vérifier.');
	} else {
		notes.push('Notification ARE analysée automatiquement. Vérifie les valeurs avant usage.');
	}

	return {
		id: source.id,
		label: labelFromDates(
			indemnizationStartDate || referenceStartDate,
			anniversaryDate || referenceEndDate
		),
		status: 'Notifie',
		admissionDate,
		indemnizationStartDate,
		anniversaryDate,
		referenceStartDate,
		referenceEndDate,
		hours,
		cachets,
		grossSalary,
		dailyAllowance,
		waitingDays,
		salaryFranchiseDays,
		congeFranchiseDays,
		sourceFileName: source.fileName,
		sourceStoredName: source.storedName,
		sourceTextPreview: preview(normalized),
		analysisNotes: notes,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		notes: ''
	};
}
