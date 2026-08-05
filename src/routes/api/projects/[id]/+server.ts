import { error, json, type RequestHandler } from '@sveltejs/kit';

import { deleteStoredFiles, mutateData } from '$lib/server/storage';

export const DELETE: RequestHandler = async ({ params }) => {
	const projectId = params?.id ?? '';
	if (!projectId) error(400, 'Projet manquant.');

	let storedNames: string[] = [];

	const data = await mutateData((current) => {
		const project = current.projects.find((item) => item.id === projectId);
		if (!project) error(404, 'Projet introuvable.');

		const contractIds = new Set(
			current.contracts
				.filter((contract) => contract.projectId === projectId)
				.map((contract) => contract.id)
		);
		const documents = current.documents.filter((document) => contractIds.has(document.contractId));
		storedNames = documents.map((document) => document.storedName).filter(Boolean);

		current.projects = current.projects.filter((item) => item.id !== projectId);
		current.contracts = current.contracts.filter((contract) => !contractIds.has(contract.id));
		current.documents = current.documents.filter(
			(document) => !contractIds.has(document.contractId)
		);

		return current;
	});

	const deletedFiles = await deleteStoredFiles(storedNames);

	return json({
		data,
		deletedFiles,
		deletedCount: deletedFiles.length
	});
};
