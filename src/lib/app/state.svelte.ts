import { base } from '$app/paths';

import {
	buildMonthlyStats,
	buildPeriodStats,
	buildTimelineMonths,
	calculateReference,
	currentMonthKey,
	estimateDailyAllowance,
	getActivePeriod,
	round
} from '$lib/stats';
import { defaultCompanyColor, normalizeCompanyColor } from '$lib/companyColors';
import type {
	AppData,
	Company,
	CompanySearchResult,
	CompanySuggestion,
	Contract,
	ContractDocument,
	ContractFields,
	ContractStatus,
	DocumentKind,
	FutureContract,
	MonthlyInfo,
	Project
} from '$lib/types';

export type Tab = 'pilotage' | 'calendrier' | 'contrats' | 'structures' | 'stats' | 'intermittence';

export const tabs: { id: Tab; label: string }[] = [
	{ id: 'pilotage', label: 'Dashboard' },
	{ id: 'calendrier', label: 'Calendrier' },
	{ id: 'contrats', label: 'Contrats' },
	{ id: 'structures', label: 'Structures' },
	{ id: 'stats', label: 'Stats' },
	{ id: 'intermittence', label: 'Intermittence' }
];

export const statuses: ContractStatus[] = ['Estimation', 'Signé', 'Payé'];
export const documentKinds: DocumentKind[] = [
	'AEM',
	'Contrat',
	'Fiche de paie',
	'Congé Spectacle',
	'Déclaration Guso',
	'Autre'
];

function createLocalId(prefix: string) {
	return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

type ServerPayloadFallback = {
	message?: string;
	analysis?: { notes?: string[] };
};

type DataMutationPayload = ServerPayloadFallback & {
	data?: AppData;
	deletedCount?: number;
};

type DocumentUploadPayload = {
	data?: AppData;
	companySuggestions: CompanySuggestion[];
	analysis: { notes: string[] };
	message?: string;
};

type DocumentImportPayload = DocumentUploadPayload & {
	createdContractId: string;
	routedContractId: string;
	periodIds: string[];
};

type AreNotificationPayload = {
	data?: AppData;
	period: { indemnizationStartDate: string };
	analysis: { notes: string[] };
	message?: string;
};

function textFromHtml(value: string) {
	return value
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

async function readServerPayload<T extends ServerPayloadFallback>(response: Response, fallback: T) {
	const raw = await response.text().catch(() => '');
	if (!raw.trim()) return fallback;

	try {
		return JSON.parse(raw) as T;
	} catch {
		const readable = textFromHtml(raw).slice(0, 180);
		const message = readable
			? `Réponse serveur illisible (${response.status}) : ${readable}`
			: `Réponse serveur illisible (${response.status}).`;

		return {
			...fallback,
			message,
			analysis: fallback.analysis ? { notes: [message] } : fallback.analysis
		} as T;
	}
}

function createCompany(name = 'Nouvelle structure'): Company {
	const id = createLocalId('company');

	return {
		id,
		name,
		legalName: '',
		contactName: '',
		email: '',
		phone: '',
		address: '',
		postalCode: '',
		city: '',
		siren: '',
		siret: '',
		ape: '',
		legalCategory: '',
		activityLabel: '',
		color: defaultCompanyColor(`${id}:${name}`),
		source: '',
		sourceUpdatedAt: '',
		notes: ''
	};
}

function createProject(companyId = ''): Project {
	return {
		id: createLocalId('project'),
		companyId,
		name: 'Nouveau projet',
		role: '',
		location: '',
		startDate: '',
		endDate: '',
		notes: ''
	};
}

function createContract(companyId = '', projectId = '', project?: Project): Contract {
	return {
		id: createLocalId('contract'),
		companyId: project?.companyId ?? companyId,
		projectId,
		title: 'Nouveau contrat',
		startDate: project?.startDate ?? '',
		endDate: project?.endDate ?? '',
		hours: 0,
		cachets: 0,
		employmentStatus: '',
		netSalary: 0,
		taxableNetSalary: 0,
		grossSalary: 0,
		contributions: 0,
		netHourlyRate: 0,
		grossHourlyRate: 0,
		status: 'Estimation',
		notes: '',
		documentIds: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString()
	};
}

export type IntermittensState = ReturnType<typeof createIntermittensState>;

export function createIntermittensState(initialData: AppData) {
	const initialSnapshot = structuredClone(initialData);
	const initialMonth = currentMonthKey();

	if (
		initialSnapshot.periods.length &&
		!initialSnapshot.periods.some((period) => period.id === initialSnapshot.settings.activePeriodId)
	) {
		initialSnapshot.settings.activePeriodId = initialSnapshot.periods[0].id;
	}

	let appData = $state<AppData>(initialSnapshot);
	let activeTab = $state<Tab>('pilotage');
	let selectedCompanyId = $state(initialSnapshot.companies[0]?.id ?? '');
	let selectedProjectId = $state(initialSnapshot.projects[0]?.id ?? '');
	let selectedContractId = $state(initialSnapshot.contracts[0]?.id ?? '');
	let selectedMonth = $state(initialMonth);
	let companyEditId = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let uploadState = $state<Record<string, string>>({});
	let contractImportState = $state('');
	let companySuggestionState = $state<CompanySuggestion[]>([]);
	let areUploadState = $state('');
	let cleanupFilesState = $state('');
	let syncState = $state<'idle' | 'checking' | 'blocked' | 'ready'>('idle');
	let dirty = $state(false);
	let changeRevision = $state(0);

	let activePeriod = $derived(getActivePeriod(appData));
	let monthlyStats = $derived(buildMonthlyStats(appData));
	let periodStats = $derived(buildPeriodStats(appData));
	let timelineMonths = $derived(buildTimelineMonths(appData));
	let reference = $derived(calculateReference(appData));
	let dailyAllowance = $derived(estimateDailyAllowance(appData));
	let selectedContract = $derived(
		appData.contracts.find((contract) => contract.id === selectedContractId)
	);
	let selectedCompany = $derived(
		appData.companies.find((company) => company.id === selectedCompanyId)
	);
	let selectedProject = $derived(
		appData.projects.find((project) => project.id === selectedProjectId)
	);
	let selectedMonthInfo = $derived(
		appData.monthlyInfos.find(
			(info) =>
				info.month === selectedMonth &&
				(!appData.settings.activePeriodId || info.periodId === appData.settings.activePeriodId)
		)
	);
	let selectedMonthStats = $derived(
		monthlyStats.find((stats) => stats.month === selectedMonth) ?? monthlyStats[0]
	);
	let recentContracts = $derived(
		[...appData.contracts]
			.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
			.slice(0, 8)
	);
	let totalNet = $derived(monthlyStats.reduce((total, stats) => total + stats.netSalary, 0));
	let totalGross = $derived(monthlyStats.reduce((total, stats) => total + stats.grossSalary, 0));
	let totalContributions = $derived(
		monthlyStats.reduce((total, stats) => total + stats.contributions, 0)
	);

	function touch() {
		changeRevision += 1;
		dirty = true;
		if (saveState === 'saved' || saveState === 'error') saveState = 'idle';
	}

	function ensureMonthlyInfo(month: string): MonthlyInfo {
		const periodId = appData.settings.activePeriodId;
		let info = appData.monthlyInfos.find(
			(item) => item.month === month && (!periodId || item.periodId === periodId)
		);

		if (!info) {
			info = {
				month,
				periodId,
				congeSpectacle: 0,
				realIndemnity: 0,
				dailyIndemnity: 0,
				notes: ''
			};
			appData.monthlyInfos.push(info);
		}

		return info;
	}

	function selectPeriod(periodId: string) {
		appData.settings.activePeriodId = periodId;
		const period = appData.periods.find((item) => item.id === periodId);
		if (!period) return;
		if (period.referenceStartDate) appData.settings.referenceStartDate = period.referenceStartDate;
		if (period.dailyAllowance) appData.settings.minDailyAllowance = period.dailyAllowance;
		ensureMonthlyInfo(selectedMonth);
		touch();
	}

	function companyName(id: string) {
		return appData.companies.find((company) => company.id === id)?.name || 'Sans structure';
	}

	function projectName(id: string) {
		return appData.projects.find((project) => project.id === id)?.name || 'Sans projet';
	}

	function companyColor(id: string) {
		const company = appData.companies.find((item) => item.id === id);
		return normalizeCompanyColor(company?.color ?? '', `${id}:${company?.name ?? ''}`);
	}

	function normalizeDigits(value: string) {
		return value.replace(/\D/g, '');
	}

	function documentsFor(contract: Contract) {
		return contract.documentIds
			.map((id) => appData.documents.find((document) => document.id === id))
			.filter(Boolean) as ContractDocument[];
	}

	function selectMonth(month: string) {
		selectedMonth = month;
		ensureMonthlyInfo(month);
	}

	async function saveData(revision = changeRevision) {
		if (saveState === 'saving') return;

		const body = JSON.stringify(appData);
		saveState = 'saving';

		try {
			const response = await fetch(`${base}/api/data`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body
			});

			if (!response.ok) {
				saveState = 'error';
				return;
			}

			const savedData = await response.json();
			if (changeRevision === revision) {
				appData = savedData;
				dirty = false;
				saveState = 'saved';
				return;
			}

			dirty = true;
			saveState = 'idle';
		} catch {
			saveState = 'error';
		}
	}

	function addCompany(name = 'Nouvelle structure') {
		const company = createCompany(name);
		appData.companies.unshift(company);
		selectedCompanyId = company.id;
		companyEditId = company.id;
		activeTab = 'structures';
		touch();
	}

	function fillCompanyFromSearchResult(company: Company, result: CompanySearchResult) {
		company.name = result.name;
		company.legalName = result.legalName;
		company.address = result.address;
		company.postalCode = result.postalCode;
		company.city = result.city;
		company.siren = result.siren;
		company.siret = result.siret;
		company.ape = result.ape;
		company.legalCategory = result.legalCategory;
		company.activityLabel = result.activityLabel;
		company.color = normalizeCompanyColor(company.color, `${company.id}:${company.name}`);
		company.source = result.sourceUrl;
		company.sourceUpdatedAt = result.sourceUpdatedAt;
	}

	function applyCompanySearchResult(company: Company, result: CompanySearchResult) {
		fillCompanyFromSearchResult(company, result);
		touch();
	}

	function mergeCompanySuggestions(suggestions: CompanySuggestion[] = []) {
		if (!suggestions.length) return;

		const knownSirets = new Set(appData.companies.map((company) => normalizeDigits(company.siret)));
		const byKey = new Map(
			companySuggestionState.map((suggestion) => [
				`${suggestion.contractId}:${suggestion.siret}`,
				suggestion
			])
		);

		for (const suggestion of suggestions) {
			if (knownSirets.has(normalizeDigits(suggestion.result.siret || suggestion.siret))) continue;
			byKey.set(`${suggestion.contractId}:${suggestion.siret}`, suggestion);
		}

		companySuggestionState = [...byKey.values()];
	}

	function dismissCompanySuggestion(suggestion: CompanySuggestion) {
		companySuggestionState = companySuggestionState.filter(
			(item) => item.contractId !== suggestion.contractId || item.siret !== suggestion.siret
		);
	}

	function applyCompanySuggestion(suggestion: CompanySuggestion) {
		const resultSiret = normalizeDigits(suggestion.result.siret || suggestion.siret);
		const resultSiren = normalizeDigits(suggestion.result.siren);
		let company = appData.companies.find(
			(item) =>
				(resultSiret && normalizeDigits(item.siret) === resultSiret) ||
				(resultSiren && normalizeDigits(item.siren) === resultSiren)
		);

		if (!company) {
			company = createCompany(suggestion.result.name);
			appData.companies.unshift(company);
		}

		fillCompanyFromSearchResult(company, suggestion.result);

		const contract = appData.contracts.find((item) => item.id === suggestion.contractId);
		if (contract) {
			contract.companyId = company.id;
			const project = appData.projects.find((item) => item.id === contract.projectId);
			if (project && project.companyId !== company.id) contract.projectId = '';
			contract.updatedAt = new Date().toISOString();
		}

		for (const document of appData.documents) {
			if (document.contractId === suggestion.contractId && !document.extractedFields.companyId) {
				document.extractedFields.companyId = company.id;
			}
		}

		selectedCompanyId = company.id;
		selectedContractId = suggestion.contractId || selectedContractId;
		companySuggestionState = companySuggestionState.filter(
			(item) => item.contractId !== suggestion.contractId || item.siret !== suggestion.siret
		);
		touch();
	}

	function removeCompany(company: Company) {
		if (!window.confirm(`Supprimer ${company.name} ? Les projets et contrats seront conservés.`)) {
			return;
		}

		appData.companies = appData.companies.filter((item) => item.id !== company.id);
		for (const project of appData.projects) {
			if (project.companyId === company.id) project.companyId = '';
		}
		for (const contract of appData.contracts) {
			if (contract.companyId === company.id) contract.companyId = '';
		}
		selectedCompanyId = appData.companies[0]?.id ?? '';
		if (companyEditId === company.id) companyEditId = '';
		touch();
	}

	function addProject(companyId = selectedCompanyId) {
		const project = createProject(companyId);
		appData.projects.unshift(project);
		selectedProjectId = project.id;
		activeTab = 'structures';
		touch();
	}

	async function removeProject(project: Project) {
		if (
			!window.confirm(`Supprimer le projet ${project.name}, ses contrats liés et leurs documents ?`)
		) {
			return;
		}

		try {
			const response = await fetch(`${base}/api/projects/${encodeURIComponent(project.id)}`, {
				method: 'DELETE'
			});
			const payload = await readServerPayload<DataMutationPayload>(response, {
				message: 'Réponse serveur illisible.'
			});

			if (!response.ok || !payload.data) {
				window.alert(payload.message ?? 'Suppression du projet impossible.');
				return;
			}

			appData = payload.data;
			selectedProjectId = appData.projects[0]?.id ?? '';
			selectedContractId = appData.contracts[0]?.id ?? '';
			cleanupFilesState = `${payload.deletedCount ?? 0} fichier(s) supprimé(s) avec le projet.`;
			dirty = false;
			saveState = 'saved';
		} catch {
			window.alert('Erreur réseau pendant la suppression du projet.');
		}
	}

	function addContract(projectId = selectedProjectId) {
		const project = appData.projects.find((item) => item.id === projectId);
		const contract = createContract(selectedCompanyId, projectId, project);
		appData.contracts.unshift(contract);
		selectedContractId = contract.id;
		contractImportState = '';
		activeTab = 'contrats';
		touch();
	}

	function removeContract(contract: Contract) {
		if (!window.confirm(`Supprimer le contrat ${contract.title} `)) return;
		appData.contracts = appData.contracts.filter((item) => item.id !== contract.id);
		appData.documents = appData.documents.filter((document) => document.contractId !== contract.id);
		selectedContractId = appData.contracts[0]?.id ?? '';
		touch();
	}

	function updateRates(contract: Contract) {
		if (contract.hours > 0) {
			contract.netHourlyRate = round(contract.netSalary / contract.hours);
			contract.grossHourlyRate = round(contract.grossSalary / contract.hours);
		}

		if (!contract.contributions && contract.grossSalary && contract.netSalary) {
			contract.contributions = round(contract.grossSalary - contract.netSalary);
		}

		contract.updatedAt = new Date().toISOString();
		touch();
	}

	function setStatus(contract: Contract, status: ContractStatus) {
		contract.status = status;
		contract.updatedAt = new Date().toISOString();
		touch();
	}

	function statusFromDocuments(documents: ContractDocument[]): ContractStatus | undefined {
		if (
			documents.some(
				(document) =>
					document.kind === 'AEM' ||
					document.kind === 'Fiche de paie' ||
					document.kind === 'Congé Spectacle' ||
					document.kind === 'Déclaration Guso'
			)
		) {
			return 'Payé';
		}

		if (documents.some((document) => document.kind === 'Contrat')) return 'Signé';
		return undefined;
	}

	function changeDocumentKind(document: ContractDocument, kind: DocumentKind) {
		if (document.kind === kind) return;

		document.kind = kind;
		const contract = appData.contracts.find((item) => item.id === document.contractId);

		if (contract) {
			const nextStatus = statusFromDocuments(documentsFor(contract));
			if (nextStatus) contract.status = nextStatus;
			contract.updatedAt = new Date().toISOString();
		}

		touch();
	}

	function applyFields(contract: Contract, fields: Partial<ContractFields>) {
		for (const [key, value] of Object.entries(fields) as [
			keyof ContractFields,
			ContractFields[keyof ContractFields]
		][]) {
			(contract[key] as ContractFields[keyof ContractFields]) = value;
		}
		updateRates(contract);
	}

	async function uploadDocument(contract: Contract, event: Event, kind: DocumentKind) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadState[contract.id] = 'Analyse...';

		const body = new FormData();
		body.set('contractId', contract.id);
		body.set('kind', kind);
		body.set('file', file);

		const response = await fetch(`${base}/api/documents`, { method: 'POST', body });
		input.value = '';
		const payload = await readServerPayload<DocumentUploadPayload>(response, {
			analysis: { notes: ['Réponse serveur illisible.'] },
			companySuggestions: [],
			message: 'Réponse serveur illisible.'
		});

		if (!response.ok || !payload.data) {
			uploadState[contract.id] = payload.message ?? 'Erreur upload.';
			return;
		}

		appData = payload.data;
		mergeCompanySuggestions(payload.companySuggestions);
		dirty = false;
		saveState = 'saved';
		uploadState[contract.id] = payload.analysis.notes?.join(' ') ?? 'Document importé.';
	}

	async function createContractFromDocument(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;

		contractImportState =
			files.length === 1
				? 'Import et rangement automatique du document...'
				: `Import et rangement automatique de ${files.length} documents...`;

		let importedCount = 0;
		let lastRoutedContractId = '';
		let sawPeriodImport = false;
		const feedback: string[] = [];
		const errors: string[] = [];

		for (const [index, file] of files.entries()) {
			if (files.length > 1) {
				contractImportState = `Import ${index + 1}/${files.length} : ${file.name}`;
			}

			const body = new FormData();
			body.set('autoRoute', 'true');
			body.set('kind', 'Autre');
			body.set('file', file);

			let response: Response;
			let payload: DocumentImportPayload;

			try {
				response = await fetch(`${base}/api/documents`, { method: 'POST', body });
				payload = await readServerPayload<DocumentImportPayload>(response, {
					analysis: { notes: ['Réponse serveur illisible.'] },
					companySuggestions: [],
					createdContractId: '',
					message: 'Réponse serveur illisible.',
					periodIds: [],
					routedContractId: ''
				});
			} catch {
				errors.push(`${file.name} : erreur réseau.`);
				continue;
			}

			if (!response.ok) {
				errors.push(`${file.name} : ${payload.message ?? 'Erreur pendant l’import.'}`);
				continue;
			}

			if (!payload.data) {
				errors.push(`${file.name} : réponse serveur incomplète.`);
				continue;
			}

			importedCount += 1;
			appData = payload.data;
			mergeCompanySuggestions(payload.companySuggestions);

			const routedContractId = payload.routedContractId || payload.createdContractId || '';
			if (routedContractId) {
				lastRoutedContractId = routedContractId;
				uploadState[routedContractId] =
					payload.analysis.notes?.join(' ') ??
					(payload.createdContractId
						? 'Contrat créé depuis le document.'
						: 'Document rangé dans un contrat existant.');
			}

			if (payload.periodIds.length) sawPeriodImport = true;

			const note = payload.analysis.notes.join(' ');
			if (note) {
				feedback.push(`${file.name} : ${note}`);
			} else if (routedContractId) {
				feedback.push(
					`${file.name} : ${
						payload.createdContractId
							? 'contrat créé depuis le document.'
							: 'document rangé dans un contrat existant.'
					}`
				);
			}
		}

		input.value = '';

		if (lastRoutedContractId) {
			selectedContractId = lastRoutedContractId;
			activeTab = 'contrats';
		} else if (sawPeriodImport) {
			activeTab = 'intermittence';
		}

		if (importedCount > 0) {
			dirty = false;
			saveState = 'saved';
		}

		const summary =
			importedCount === files.length
				? `${importedCount} document(s) importé(s) et classé(s).`
				: importedCount > 0
					? `${importedCount}/${files.length} document(s) importé(s).`
					: 'Aucun document importé.';
		const details = [...errors, ...feedback].slice(0, 4);
		const hiddenDetailsCount = Math.max(0, errors.length + feedback.length - details.length);
		contractImportState = [
			summary,
			...details,
			hiddenDetailsCount ? `+${hiddenDetailsCount} message(s).` : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	async function cleanupUnusedFiles() {
		cleanupFilesState = 'Nettoyage des fichiers non utilisés...';

		try {
			const response = await fetch(`${base}/api/maintenance/cleanup`, { method: 'POST' });
			const payload = await readServerPayload<DataMutationPayload>(response, {
				message: 'Réponse serveur illisible.'
			});

			if (!response.ok || !payload.data) {
				cleanupFilesState = payload.message ?? 'Nettoyage impossible.';
				return;
			}

			appData = payload.data;
			dirty = false;
			saveState = 'saved';
			cleanupFilesState = `${payload.deletedCount ?? 0} fichier(s) non utilisé(s) supprimé(s).`;
		} catch {
			cleanupFilesState = 'Erreur réseau pendant le nettoyage.';
		}
	}

	async function uploadAreNotification(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		areUploadState = 'Analyse de la notification ARE...';

		const body = new FormData();
		body.set('file', file);

		const response = await fetch(`${base}/api/are/notifications`, { method: 'POST', body });
		input.value = '';
		const payload = await readServerPayload<AreNotificationPayload>(response, {
			analysis: { notes: ['Réponse serveur illisible.'] },
			period: { indemnizationStartDate: '' },
			message: 'Réponse serveur illisible.'
		});

		if (!response.ok || !payload.data) {
			areUploadState = payload.message ?? 'Erreur pendant l’analyse de la notification ARE.';
			return;
		}

		appData = payload.data;
		if (payload.period.indemnizationStartDate) {
			selectedMonth = payload.period.indemnizationStartDate.slice(0, 7);
			ensureMonthlyInfo(selectedMonth);
			await saveData();
		} else {
			dirty = false;
			saveState = 'saved';
		}
		areUploadState = payload.analysis.notes.join(' ');
	}

	async function removePeriod(periodId: string) {
		const period = appData.periods.find((item) => item.id === periodId);
		if (!period) return;
		if (!window.confirm(`Supprimer la notification ARE "${period.label}" `)) return;

		areUploadState = 'Suppression de la notification ARE...';

		try {
			const response = await fetch(`${base}/api/periods/${encodeURIComponent(periodId)}`, {
				method: 'DELETE'
			});
			const payload = await readServerPayload<DataMutationPayload>(response, {
				message: 'Réponse serveur illisible.'
			});

			if (!response.ok || !payload.data) {
				areUploadState = payload.message ?? 'Suppression ARE impossible.';
				return;
			}

			appData = payload.data;
			selectedMonth = currentMonthKey();
			ensureMonthlyInfo(selectedMonth);
			dirty = false;
			saveState = 'saved';
			areUploadState = `${payload.deletedCount ?? 0} fichier(s) supprimé(s) avec la notification ARE.`;
		} catch {
			areUploadState = 'Erreur réseau pendant la suppression ARE.';
		}
	}

	function addFutureContract() {
		const future: FutureContract = {
			id: createLocalId('future'),
			companyName: selectedCompany?.name ?? '',
			amount: 0,
			amountType: 'gross',
			estimatedHours: 0,
			notes: ''
		};

		appData.futureContracts.unshift(future);
		activeTab = 'intermittence';
		touch();
	}

	function removeFutureContract(future: FutureContract) {
		appData.futureContracts = appData.futureContracts.filter((item) => item.id !== future.id);
		touch();
	}

	async function checkGhsSync() {
		syncState = 'checking';

		const response = await fetch(`${base}/api/transat/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(appData.settings)
		});
		const payload = await response.json();

		appData.settings.ghsLastSyncAt = new Date().toISOString();
		appData.settings.ghsLastSyncStatus = payload.message;
		syncState = response.ok ? 'ready' : 'blocked';
		touch();
	}

	ensureMonthlyInfo(initialMonth);

	return {
		get appData() {
			return appData;
		},
		set appData(value: AppData) {
			appData = value;
		},
		get activeTab() {
			return activeTab;
		},
		set activeTab(value: Tab) {
			activeTab = value;
		},
		get selectedCompanyId() {
			return selectedCompanyId;
		},
		set selectedCompanyId(value: string) {
			selectedCompanyId = value;
		},
		get selectedProjectId() {
			return selectedProjectId;
		},
		set selectedProjectId(value: string) {
			selectedProjectId = value;
		},
		get selectedContractId() {
			return selectedContractId;
		},
		set selectedContractId(value: string) {
			selectedContractId = value;
		},
		get selectedMonth() {
			return selectedMonth;
		},
		set selectedMonth(value: string) {
			selectedMonth = value;
		},
		get companyEditId() {
			return companyEditId;
		},
		set companyEditId(value: string) {
			companyEditId = value;
		},
		get saveState() {
			return saveState;
		},
		get uploadState() {
			return uploadState;
		},
		get contractImportState() {
			return contractImportState;
		},
		get companySuggestionState() {
			return companySuggestionState;
		},
		get syncState() {
			return syncState;
		},
		get areUploadState() {
			return areUploadState;
		},
		get cleanupFilesState() {
			return cleanupFilesState;
		},
		get dirty() {
			return dirty;
		},
		get changeRevision() {
			return changeRevision;
		},
		get activePeriod() {
			return activePeriod;
		},
		get monthlyStats() {
			return monthlyStats;
		},
		get periodStats() {
			return periodStats;
		},
		get timelineMonths() {
			return timelineMonths;
		},
		get reference() {
			return reference;
		},
		get dailyAllowance() {
			return dailyAllowance;
		},
		get selectedContract() {
			return selectedContract;
		},
		get selectedCompany() {
			return selectedCompany;
		},
		get selectedProject() {
			return selectedProject;
		},
		get selectedMonthInfo() {
			return selectedMonthInfo;
		},
		get selectedMonthStats() {
			return selectedMonthStats;
		},
		get recentContracts() {
			return recentContracts;
		},
		get totalNet() {
			return totalNet;
		},
		get totalGross() {
			return totalGross;
		},
		get totalContributions() {
			return totalContributions;
		},
		touch,
		companyName,
		projectName,
		companyColor,
		documentsFor,
		selectMonth,
		selectPeriod,
		saveData,
		addCompany,
		applyCompanySearchResult,
		applyCompanySuggestion,
		dismissCompanySuggestion,
		removeCompany,
		addProject,
		removeProject,
		addContract,
		removeContract,
		updateRates,
		setStatus,
		changeDocumentKind,
		applyFields,
		uploadDocument,
		createContractFromDocument,
		cleanupUnusedFiles,
		uploadAreNotification,
		removePeriod,
		addFutureContract,
		removeFutureContract,
		checkGhsSync
	};
}
