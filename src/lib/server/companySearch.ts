import type { CompanySearchResult } from '$lib/types';

type SearchApiResult = {
	siren: string;
	nom_complet: string;
	nom_raison_sociale: string;
	activite_principale: string;
	nature_juridique: string;
	date_mise_a_jour: string;
	tranche_effectif_salarie: string | null;
	siege: {
		siret: string;
		adresse: string;
		code_postal: string;
		libelle_commune: string;
		caractere_employeur: string;
		tranche_effectif_salarie: string | null;
	};
	complements: {
		est_association: boolean;
		est_entrepreneur_spectacle: boolean;
	};
};

type SearchApiResponse = {
	results: SearchApiResult[];
};

const API_URL = 'https://recherche-entreprises.api.gouv.fr/search';

function normalize(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function tokenScore(query: string, candidate: string) {
	const queryTokens = normalize(query).split(' ').filter(Boolean);
	const candidateText = normalize(candidate);
	if (!queryTokens.length || !candidateText) return 0;

	const matches = queryTokens.filter((token) => candidateText.includes(token)).length;
	const coverage = matches / queryTokens.length;
	const exactBonus = candidateText === queryTokens.join(' ') ? 25 : 0;
	const prefixBonus = candidateText.startsWith(queryTokens[0] ?? '') ? 10 : 0;

	return Math.round(coverage * 65 + exactBonus + prefixBonus);
}

function mapResult(query: string, result: SearchApiResult): CompanySearchResult {
	const name = result.nom_complet || result.nom_raison_sociale || 'Structure sans nom';
	const siret = result.siege.siret ?? '';
	const siren = result.siren ?? '';
	const address = result.siege.adresse ?? '';
	const city = result.siege.libelle_commune ?? '';
	const ape = result.activite_principale ?? '';
	const score = Math.min(100, tokenScore(query, `${name} ${address} ${siren} ${siret}`));

	return {
		id: siret || siren || name,
		score,
		name,
		legalName: result.nom_raison_sociale || name,
		siren,
		siret,
		ape,
		address,
		postalCode: result.siege.code_postal ?? '',
		city,
		legalCategory: result.nature_juridique ?? '',
		activityLabel: ape ? `APE ${ape}` : '',
		employeeRange: result.siege.tranche_effectif_salarie ?? result.tranche_effectif_salarie ?? '',
		isEmployer: result.siege.caractere_employeur === 'O',
		isAssociation: Boolean(result.complements.est_association),
		isEntrepreneurSpectacle: Boolean(result.complements.est_entrepreneur_spectacle),
		sourceUpdatedAt: result.date_mise_a_jour ?? '',
		sourceUrl: siren ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}` : ''
	};
}

export async function searchCompanies(query: string, fetcher: typeof fetch, limit = 8) {
	const cleanQuery = query.trim();
	if (cleanQuery.length < 2) return [];

	const apiUrl = new URL(API_URL);
	apiUrl.searchParams.set('q', cleanQuery);
	apiUrl.searchParams.set('per_page', '12');
	apiUrl.searchParams.set('minimal', 'false');

	const response = await fetcher(apiUrl);
	if (!response.ok) {
		throw new Error('La recherche de structures est momentanément indisponible.');
	}

	const payload = (await response.json()) as SearchApiResponse;
	return (payload.results ?? [])
		.map((result) => mapResult(cleanQuery, result))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
