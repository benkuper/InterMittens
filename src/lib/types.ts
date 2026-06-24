export type ContractStatus = 'Estimation' | 'Signe' | 'Paye';
export type DocumentKind = 'AEM' | 'Contrat' | 'Fiche de paie' | 'Autre';

export type Company = {
	id: string;
	name: string;
	legalName: string;
	contactName: string;
	email: string;
	phone: string;
	address: string;
	siret: string;
	ape: string;
	notes: string;
};

export type Project = {
	id: string;
	companyId: string;
	name: string;
	role: string;
	location: string;
	startDate: string;
	endDate: string;
	notes: string;
};

export type ContractDocument = {
	id: string;
	contractId: string;
	kind: DocumentKind;
	fileName: string;
	storedName: string;
	mimeType: string;
	size: number;
	uploadedAt: string;
	extractedTextPreview: string;
	extractedFields: Partial<ContractFields>;
	analysisNotes: string[];
};

export type ContractFields = {
	companyId: string;
	projectId: string;
	title: string;
	startDate: string;
	endDate: string;
	hours: number;
	cachets: number;
	netSalary: number;
	taxableNetSalary: number;
	grossSalary: number;
	contributions: number;
	netHourlyRate: number;
	grossHourlyRate: number;
	status: ContractStatus;
	notes: string;
};

export type Contract = ContractFields & {
	id: string;
	documentIds: string[];
	createdAt: string;
	updatedAt: string;
};

export type FutureContract = {
	id: string;
	label: string;
	companyId: string;
	projectName: string;
	expectedStartDate: string;
	expectedEndDate: string;
	expectedHours: number;
	expectedCachets: number;
	expectedGrossSalary: number;
	probability: number;
	notes: string;
};

export type MonthlyInfo = {
	month: string;
	congeSpectacle: number;
	realIndemnity: number;
	dailyIndemnity: number;
	notes: string;
};

export type AppSettings = {
	referenceStartDate: string;
	targetHours: number;
	annex: 'Annexe 8';
	minDailyAllowance: number;
	smicHourlyGross: number;
	annex8SalaryCoefficient: number;
	annex8HoursCoefficient: number;
	annex8FixedCoefficient: number;
	monthlyWorkDayDivisor: number;
	monthlyShiftCoefficient: number;
	pmss: number;
	cumulPmssMultiplier: number;
};

export type AppData = {
	version: 1;
	updatedAt: string;
	companies: Company[];
	projects: Project[];
	contracts: Contract[];
	documents: ContractDocument[];
	futureContracts: FutureContract[];
	monthlyInfos: MonthlyInfo[];
	settings: AppSettings;
};

export type MonthlyStats = {
	month: string;
	label: string;
	hours: number;
	cachets: number;
	netSalary: number;
	taxableNetSalary: number;
	grossSalary: number;
	contributions: number;
	contributionRate: number;
	netHourlyRate: number;
	grossHourlyRate: number;
	contractCount: number;
	workedDaysEstimate: number;
	estimatedDailyAllowance: number;
	estimatedIndemnity: number;
	realIndemnity: number;
	congeSpectacle: number;
	totalIncomeEstimated: number;
	totalIncomeReal: number;
};
