import { json, type RequestHandler } from '@sveltejs/kit';

import type { AppSettings } from '$lib/types';

export const POST: RequestHandler = async ({ request }) => {
	const settings = (await request.json()) as Partial<AppSettings>;

	if (!(settings.transatEmail ?? '').trim()) {
		return json(
			{
				message:
					'Ajoute au minimum l’adresse e-mail de ton compte Transat pour préparer la configuration.'
			},
			{ status: 400 }
		);
	}

	if (!(settings.ghsApiBaseUrl ?? '').trim() || !(settings.ghsApiToken ?? '').trim()) {
		return json(
			{
				message:
					'GHS publie des bouquets API Contrats/Paies, mais ils nécessitent une activation et une documentation partenaire. Renseigne l’URL API et le jeton fournis par GHS pour brancher la synchronisation réelle.'
			},
			{ status: 501 }
		);
	}

	return json(
		{
			message:
				'Configuration API présente. Le mapping exact des endpoints Contrats/Paies GHS doit être validé avec la documentation partenaire avant envoi automatique.'
		},
		{ status: 501 }
	);
};
