import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { error, type RequestHandler } from '@sveltejs/kit';
import { documentDir, readData } from '$lib/server/storage';

export const GET: RequestHandler = async ({ params }) => {
	const data = await readData();
	const payment = [...data.royalties, ...data.congesPayments, ...data.franceTravailDocs].find(
		(item) => item.id === params.id
	);
	if (!payment?.storedName) error(404, 'Document introuvable.');
	const root = path.resolve(documentDir);
	const target = path.resolve(root, payment.storedName);
	if (!target.startsWith(`${root}${path.sep}`)) error(400, 'Chemin invalide.');
	const file = new Uint8Array(await readFile(target));
	return new Response(file, {
		headers: {
			'content-type': payment.fileName.toLowerCase().endsWith('.txt')
				? 'text/plain; charset=utf-8'
				: 'application/pdf',
			'content-disposition': `inline; filename="${payment.fileName.replace(/["\r\n]/g, '')}"`
		}
	});
};
