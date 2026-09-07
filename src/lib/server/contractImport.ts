import type { ContractFields, Project } from '$lib/types';

type ContractPayFields = Pick<
	ContractFields,
	'hours' | 'netSalary' | 'grossSalary' | 'contributions' | 'netHourlyRate' | 'grossHourlyRate'
>;

const frenchMonths = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

export function normalizeProjectName(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

export function findProjectForProduction(
	projects: Project[],
	productionName: string,
	companyId = ''
) {
	const productionKey = normalizeProjectName(productionName);
	if (!productionKey) return undefined;

	const matches = projects.filter(
		(project) => normalizeProjectName(project.name) === productionKey
	);
	if (!matches.length) return undefined;

	if (companyId) {
		return (
			matches.find((project) => project.companyId === companyId) ??
			(matches.length === 1 && !matches[0].companyId ? matches[0] : undefined)
		);
	}

	return matches.length === 1 ? matches[0] : undefined;
}

export function importMonthLabel(dateValue: string) {
	const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(dateValue);
	if (!match) return '';

	const monthIndex = Number(match[2]) - 1;
	const month = frenchMonths[monthIndex];
	return month ? `${month} ${match[1]}` : '';
}

export function importedContractTitle(subject: string, dateValue: string) {
	const cleanedSubject = subject.replace(/\s+/g, ' ').trim();
	const month = importMonthLabel(dateValue);

	if (cleanedSubject && month) return `${cleanedSubject} · ${month}`;
	return cleanedSubject || (month ? `Contrat · ${month}` : 'Contrat importé');
}

export function deriveMissingPayFields(contract: ContractPayFields) {
	const derived: Partial<ContractPayFields> = {};

	if (contract.hours > 0 && contract.grossSalary > 0 && !contract.grossHourlyRate) {
		derived.grossHourlyRate = Number((contract.grossSalary / contract.hours).toFixed(2));
	}

	if (contract.hours > 0 && contract.netSalary > 0 && !contract.netHourlyRate) {
		derived.netHourlyRate = Number((contract.netSalary / contract.hours).toFixed(2));
	}

	if (!contract.contributions && contract.grossSalary > 0 && contract.netSalary > 0) {
		derived.contributions = Number((contract.grossSalary - contract.netSalary).toFixed(2));
	}

	return derived;
}
