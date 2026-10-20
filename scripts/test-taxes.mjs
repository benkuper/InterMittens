import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true } });

try {
	const { buildTaxYear, taxYearCsv, taxYears } = await server.ssrLoadModule('/src/lib/taxes.ts');
	const { normalizeData, defaultTaxYear, usedStoredFiles } = await server.ssrLoadModule(
		'/src/lib/server/storage.ts'
	);
	const { analyzeCongesStatement } = await server.ssrLoadModule(
		'/src/lib/server/congesAnalysis.ts'
	);
	const { analyzeRoyaltyStatement } = await server.ssrLoadModule(
		'/src/lib/server/royaltyAnalysis.ts'
	);
	const { analyzeFranceTravailLetter } = await server.ssrLoadModule(
		'/src/lib/server/franceTravailAnalysis.ts'
	);
	const { estimateDailyAllowance, estimateMonthlyIndemnity } =
		await server.ssrLoadModule('/src/lib/stats.ts');

	const data = normalizeData({
		settings: { activePeriodId: 'other-period' },
		companies: [{ id: 'a', name: 'Employeur "A"; studio' }],
		contracts: [
			{
				id: 'paid',
				companyId: 'a',
				startDate: '2025-01-10',
				endDate: '2025-01-10',
				status: 'Payé',
				grossSalary: 20000,
				netSalary: 15000,
				taxableNetSalary: 16000,
				hours: 600
			},
			{
				id: 'missing',
				companyId: 'a',
				startDate: '2025-12-10',
				status: 'Payé',
				grossSalary: 1000,
				netSalary: 800
			},
			{ id: 'signed', startDate: '2025-01-10', status: 'Signé', taxableNetSalary: 9000 },
			{ id: 'estimated', startDate: '2025-01-10', status: 'Estimation', taxableNetSalary: 9000 },
			{ id: 'other-year', startDate: '2024-01-10', status: 'Payé', taxableNetSalary: 9000 }
		],
		monthlyInfos: [
			{ month: '2025-01', periodId: 'previous-period', realIndemnity: 1000, congeSpectacle: 200 },
			{ month: '2025-12', periodId: 'other-period', realIndemnity: 500 }
		],
		royalties: [
			{
				source: 'SACEM',
				paymentDate: '2025-06-01',
				grossAmount: 1000,
				netAmount: 850,
				taxableAmount: 900,
				status: 'Reçu'
			},
			{
				source: 'Droits directs',
				paymentDate: '2025-07-01',
				grossAmount: 100,
				netAmount: 80,
				status: 'Déclaré'
			},
			{ paymentDate: '2025-07-01', taxableAmount: 5000, status: 'Attendu' }
		]
	});
	const settings = defaultTaxYear();
	const summary = buildTaxYear(data, '2025', settings);
	assert.equal(summary.months.length, 12);
	assert.equal(summary.salaryTaxable, 16800);
	assert.equal(summary.contractsWithoutTaxable, 1);
	assert.equal(summary.unemployment, 1500);
	assert.equal(summary.congesSpectacles, 200);
	assert.equal(summary.royaltiesTaxable, 980);
	assert.equal(summary.royaltiesTaxableDirect, 80);
	assert.equal(summary.royaltiesTaxableSocieties, 900);
	assert.equal(summary.royaltiesWithoutTaxable, 1);
	assert.equal(summary.totalTaxable, 19480);
	assert.equal(summary.flatDeduction, 1948);
	assert.equal(summary.netTaxable, 17532);
	assert.equal(summary.employers[0].contracts, 2);
	assert.match(taxYearCsv(summary), /"Employeur ""A""; studio"/);
	assert.match(taxYearCsv(summary), /"19480,00"/);

	const expenses = buildTaxYear(data, '2025', {
		...settings,
		mileageKm: 10000,
		mileageRate: 0.5,
		meals: 300
	});
	assert.equal(expenses.bestIsActual, true);
	assert.equal(expenses.bestDeduction, 5300);
	assert.equal(buildTaxYear(normalizeData({}), '2025', settings).flatDeduction, 0);

	const zero = buildTaxYear(data, '2025', {
		...settings,
		unemploymentTaxable: 0,
		congesSpectaclesTaxable: 0
	});
	assert.equal(zero.unemployment, 0);
	assert.equal(zero.congesSpectacles, 0);
	assert.equal(zero.unemploymentIsEstimate, false);
	assert.equal(zero.congesSpectaclesIsEstimate, false);

	const conges = analyzeCongesStatement(
		'État récapitulatif des paiements Congés. Congés saison 2024. Réglé le 05/02/2025. TOTAL 1000,00 900,00 10 200,00 800,00. NET IMPOSABLE 820,00. NET IMPOSABLE 100,00. Impôts 40,00 NET A PAYER TOTAL'
	);
	assert.equal(conges.paymentDate, '2025-02-05');
	assert.equal(conges.taxableAmount, 920);
	assert.equal(conges.withheldTax, 40);
	data.congesPayments.push({
		...conges,
		id: 'conges',
		fileName: 'audiens.pdf',
		storedName: 'audiens.pdf'
	});
	const exactConges = buildTaxYear(data, '2025', settings);
	assert.equal(exactConges.congesSpectacles, 920);
	assert.equal(exactConges.months[0].congesSpectacles, 0);
	assert.equal(exactConges.months[1].congesSpectacles, 920);
	assert.equal(exactConges.congesSpectaclesIsEstimate, false);
	assert.equal(exactConges.congesWithheldTax, 40);
	assert.equal(
		analyzeCongesStatement('Bulletin de paie : cotisation Congés Spectacles 123,00'),
		undefined
	);

	const royalty = analyzeRoyaltyStatement(
		"Décompte de droits Studio Période du 01/04/2025 au 30/04/2025. Droits d'auteur 1000,00. Total retenues *** 150,00. Net à payer *** 850,00. Net imposable *** 900,00. Payé le 05/05/2025",
		'droits.pdf'
	);
	assert.equal(royalty.taxableAmount, 900);
	assert.equal(royalty.paymentDate, '2025-05-05');
	assert.equal(
		analyzeRoyaltyStatement(
			"Contrat de cession de droits d'auteur. Net à payer 1000,00",
			'contrat.pdf'
		),
		undefined
	);

	const certificate = analyzeFranceTravailLetter(
		'France Travail. Justificatif pour votre déclaration fiscale 2025. Lignes AP à FP) de votre déclaration de revenus de 2025 : 2 345,67',
		'fiscal.pdf'
	);
	assert.equal(certificate.kind, 'Attestation fiscale');
	assert.equal(certificate.amount, 2345.67);
	assert.equal(
		analyzeFranceTravailLetter(
			'France Travail. Justificatif pour votre déclaration fiscale 2025. Montant illisible.',
			'illisible.pdf'
		).year,
		''
	);
	data.franceTravailDocs.push({ ...certificate, id: 'ft', storedName: 'ft.pdf' });
	assert.equal(buildTaxYear(data, '2025', settings).unemployment, 2345.67);
	assert.equal(buildTaxYear(data, '2025', settings).unemploymentIsEstimate, false);
	assert.equal(
		analyzeFranceTravailLetter(
			'France Travail notification admission ouverture de droits',
			'are.pdf'
		),
		undefined
	);
	assert.equal(
		analyzeFranceTravailLetter('France Travail fin de droits', 'fin.pdf').kind,
		'Fin de droits'
	);
	assert.ok(usedStoredFiles(data).has('audiens.pdf'));
	assert.ok(usedStoredFiles(data).has('ft.pdf'));
	data.congesPayments.push({ ...conges, paymentDate: '2019-01-01' });
	assert.ok(taxYears(data).includes('2019'));
	const roundTrip = normalizeData(JSON.parse(JSON.stringify(data)));
	assert.deepEqual(buildTaxYear(roundTrip, '2025', settings), buildTaxYear(data, '2025', settings));

	// The notified AJ is separate from the formula minimum, including old saved data.
	const notified = normalizeData({
		settings: { minDailyAllowance: 60, activePeriodId: 'p' },
		periods: [{ id: 'p', dailyAllowance: 60 }]
	});
	assert.equal(notified.settings.minDailyAllowance, 31.96);
	assert.equal(
		normalizeData({ settings: { minDailyAllowance: 31.97 } }).settings.minDailyAllowance,
		31.96
	);
	assert.equal(estimateDailyAllowance(notified), 60);
	assert.equal(estimateMonthlyIndemnity(notified, '2026-04', 40, 800).estimatedIndemnity, 1380);
	notified.settings.annex = 'Annexe 10';
	assert.equal(estimateMonthlyIndemnity(notified, '2026-04', 40, 800).estimatedIndemnity, 1440);
	assert.equal(
		normalizeData({}).settings.taxYears && Object.keys(normalizeData({}).settings.taxYears).length,
		0
	);
	console.log('Tax and allowance integration tests passed.');
} finally {
	await server.close();
}
