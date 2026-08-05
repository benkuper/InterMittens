import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { error, type RequestHandler } from '@sveltejs/kit';

import { documentDir, readData } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const data = await readData();
	const period = data.periods.find((item) => item.id === params.id);

	if (!period || !period.sourceStoredName) error(404, 'Document introuvable.');

	const file = await readFile(path.join(documentDir, period.sourceStoredName));

	return new Response(file, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-disposition': `inline; filename="${period.sourceFileName.replace(/"/g, '')}"`
		}
	});
};
