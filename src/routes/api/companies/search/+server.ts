import { error, json, type RequestHandler } from '@sveltejs/kit';

import { searchCompanies } from '$lib/server/companySearch';

export const GET: RequestHandler = async ({ url, fetch }) => {
	const query = (url.searchParams.get('q') ?? '').trim();

	if (!query || query.length < 2) {
		return json({ results: [] });
	}

	try {
		const results = await searchCompanies(query, fetch, 8);
		return json({ results });
	} catch {
		error(502, 'La recherche de structures est momentanément indisponible.');
	}
};
