import type { Contract, ContractDocument, DocumentKind } from '$lib/types';

export const requiredContractDocuments = [
	{ kind: 'Contrat', label: 'Contrat', shortLabel: 'Contrat' },
	{ kind: 'AEM', label: 'AEM', shortLabel: 'AEM' },
	{ kind: 'Fiche de paie', label: 'Fiche de paie', shortLabel: 'Paie' },
	{ kind: 'Congé Spectacle', label: 'Congé Spectacle', shortLabel: 'CS' }
] as const satisfies readonly {
	kind: DocumentKind;
	label: string;
	shortLabel: string;
}[];

export type RequiredContractDocumentKind = (typeof requiredContractDocuments)[number]['kind'];

export function hasRequiredDocument(
	documents: readonly Pick<ContractDocument, 'kind'>[],
	kind: RequiredContractDocumentKind
) {
	return documents.some((document) => document.kind === kind);
}

export function missingRequiredDocuments(documents: readonly Pick<ContractDocument, 'kind'>[]) {
	return requiredContractDocuments.filter(({ kind }) => !hasRequiredDocument(documents, kind));
}

export function summarizeContractDocuments(
	contracts: readonly Pick<Contract, 'documentIds'>[],
	documents: readonly Pick<ContractDocument, 'id' | 'kind'>[]
) {
	const documentsById = new Map(documents.map((document) => [document.id, document]));
	const missingByKind = Object.fromEntries(
		requiredContractDocuments.map(({ kind }) => [kind, 0])
	) as Record<RequiredContractDocumentKind, number>;
	let incompleteContracts = 0;

	for (const contract of contracts) {
		const contractDocuments = contract.documentIds.flatMap((id) => {
			const document = documentsById.get(id);
			return document ? [document] : [];
		});
		const missingDocuments = missingRequiredDocuments(contractDocuments);

		if (missingDocuments.length > 0) incompleteContracts += 1;
		for (const { kind } of missingDocuments) missingByKind[kind] += 1;
	}

	return {
		totalContracts: contracts.length,
		completeContracts: contracts.length - incompleteContracts,
		incompleteContracts,
		missingByKind
	};
}
