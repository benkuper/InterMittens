import { json, type RequestHandler } from '@sveltejs/kit';

import { cleanupUnusedDocumentFiles, readData } from '$lib/server/storage';

export const POST: RequestHandler = async () => {
	const data = await readData();
	const cleanup = await cleanupUnusedDocumentFiles(data);

	return json({
		data,
		...cleanup
	});
};
