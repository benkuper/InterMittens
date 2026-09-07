import assert from 'node:assert/strict';

import { createServer } from 'vite';

const server = await createServer({
	appType: 'custom',
	server: { middlewareMode: true }
});

try {
	const { missingRequiredDocuments, summarizeContractDocuments } = await server.ssrLoadModule(
		'/src/lib/documentPresence.ts'
	);
	const documents = [
		{ id: 'contract-1', kind: 'Contrat' },
		{ id: 'aem-1', kind: 'AEM' },
		{ id: 'pay-1', kind: 'Fiche de paie' },
		{ id: 'cs-1', kind: 'Congé Spectacle' },
		{ id: 'contract-2', kind: 'Contrat' }
	];
	const contracts = [
		{ documentIds: ['contract-1', 'aem-1', 'pay-1', 'cs-1'] },
		{ documentIds: ['contract-2'] }
	];

	assert.deepEqual(missingRequiredDocuments(documents.slice(0, 4)), []);
	assert.deepEqual(
		missingRequiredDocuments(documents.slice(4)).map(({ kind }) => kind),
		['AEM', 'Fiche de paie', 'Congé Spectacle']
	);
	assert.deepEqual(summarizeContractDocuments(contracts, documents), {
		totalContracts: 2,
		completeContracts: 1,
		incompleteContracts: 1,
		missingByKind: {
			Contrat: 0,
			AEM: 1,
			'Fiche de paie': 1,
			'Congé Spectacle': 1
		}
	});

	console.log('Document presence regression tests passed.');
} finally {
	await server.close();
}
