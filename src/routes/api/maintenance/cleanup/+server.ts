import { json, type RequestHandler } from '@sveltejs/kit';

import {
	isRemoteSyncEnabled,
	isSameDeployment,
	isSyncRequest,
	normalizeRemoteBaseUrl,
	syncHeaders
} from '$lib/server/remoteSync';
import { cleanupUnusedDocumentFiles, readData, saveData } from '$lib/server/storage';

export const POST: RequestHandler = async ({ request, url }) => {
	const data = await readData();
	if (
		isRemoteSyncEnabled(data) &&
		!isSameDeployment(data.settings.remoteBaseUrl, url) &&
		!isSyncRequest(request)
	) {
		const remoteBaseUrl = normalizeRemoteBaseUrl(data.settings.remoteBaseUrl);
		const response = await globalThis.fetch(`${remoteBaseUrl}/api/maintenance/cleanup`, {
			method: 'POST',
			headers: syncHeaders()
		});
		const payload = await response.json().catch(() => ({
			message: 'Réponse distante illisible.'
		}));

		if (response.ok && payload.data) await saveData(payload.data);
		return json(payload, { status: response.status });
	}

	const cleanup = await cleanupUnusedDocumentFiles(data);

	return json({
		data,
		...cleanup
	});
};
