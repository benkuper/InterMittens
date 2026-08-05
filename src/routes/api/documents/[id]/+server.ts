import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { error, type RequestHandler } from '@sveltejs/kit';

import { documentDir, readData } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const data = await readData();
	const document = data.documents.find((item) => item.id === params.id);

	if (!document) error(404, 'Document introuvable.');

	const file = await readFile(path.join(documentDir, document.storedName));

	return new Response(file, {
		headers: {
			'content-type': document.mimeType,
			'content-disposition': `inline; filename="${document.fileName.replace(/"/g, '')}"`
		}
	});
};
