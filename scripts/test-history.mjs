import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ appType: 'custom', server: { middlewareMode: true } });
try {
	const { normalizeData } = await server.ssrLoadModule('/src/lib/server/storage.ts');
	const years = await server.ssrLoadModule('/src/lib/years.ts');
	const { buildYearHistory, elapsedMonths } = await server.ssrLoadModule('/src/lib/history.ts');
	const stats = await server.ssrLoadModule('/src/lib/stats.ts');
	const today = new Date('2026-10-20T12:00:00');
	const data = normalizeData({
		settings: {
			anniversaries: { 2024: '2024-11-15', 2025: '2025-11-15', 2026: '2026-11-15' },
			targetHours: 507
		},
		companies: [
			{ id: 'a', name: 'Compagnie A' },
			{ id: 'b', name: 'Compagnie B' }
		],
		periods: [{ id: 'old-period', anniversaryDate: '2025-11-15', dailyAllowance: 60 }],
		contracts: [
			{
				id: '2024',
				startDate: '2024-03-01',
				hours: 10,
				grossSalary: 800,
				netSalary: 640,
				status: 'Payé',
				employmentStatus: 'Technicien',
				companyId: 'a'
			},
			{
				id: '2025',
				startDate: '2025-03-01',
				hours: 10,
				grossSalary: 1000,
				netSalary: 800,
				employerCost: 1500,
				status: 'Payé',
				employmentStatus: 'Technicien',
				companyId: 'a'
			},
			{
				id: 'artist',
				startDate: '2025-11-15',
				cachets: 2,
				grossSalary: 200,
				netSalary: 160,
				status: 'Payé',
				employmentStatus: 'Artiste',
				companyId: 'b'
			},
			{
				id: 'current',
				startDate: '2025-11-16',
				hours: 20,
				grossSalary: 300,
				netSalary: 240,
				status: 'Payé',
				companyId: 'a'
			},
			{
				id: 'unpaid',
				startDate: '2026-08-01',
				grossSalary: 200,
				netSalary: 160,
				status: 'Signé',
				companyId: 'a'
			},
			{ id: 'future', startDate: '2026-11-16', hours: 100, grossSalary: 3000, status: 'Signé' }
		],
		monthlyInfos: [
			{ month: '2025-11', periodId: 'old-period', realIndemnity: 1000, congeSpectacle: 200 },
			{ month: '2025-11', periodId: 'year:2026', realIndemnity: 300 }
		]
	});
	assert.equal(years.yearOfDate(data, '2025-11-15'), 2025);
	assert.equal(years.yearOfDate(data, '2025-11-16'), 2026);
	assert.equal(years.currentIntermittenceYear(data, today).year, 2026);
	const list = buildYearHistory(data, today);
	assert.deepEqual(
		list.map((entry) => entry.year.year),
		[2026, 2025, 2024]
	);
	const previous = list.find((entry) => entry.year.year === 2025);
	assert.equal(previous.hours, 34);
	assert.equal(previous.annexes.annex8, 10);
	assert.equal(previous.annexes.annex10, 24);
	assert.equal(previous.realIndemnity, 1000);
	assert.equal(previous.totalIncome, 2160);
	assert.equal(previous.employerCost, 1500);
	assert.equal(previous.grossChange, 0.5);
	assert.equal(previous.employers[0].name, 'Compagnie B');
	assert.equal(list[0].netSalary, 240, 'unpaid net must not be reported as received');
	assert.equal(list[0].grossChange, undefined);
	assert.equal(elapsedMonths('2024-11-16', '2025-11-15', today), 12);
	assert.equal(years.anniversaryFor(normalizeData({}), 2025).date, '2025-12-31');

	data.settings.activePeriodId = 'year:2025';
	assert.equal(stats.calculateReference(data).hours, 34);
	assert.equal(stats.getActivePeriod(data).dailyAllowance, 60);
	assert.equal(stats.buildPeriodStats(data).realIndemnity, 1000);
	assert.equal(stats.buildMonthlyContractBreakdown(data, '2025-11').length, 1);
	data.settings.activePeriodId = 'year:2026';
	assert.equal(stats.buildPeriodStats(data).realIndemnity, 300);
	data.settings.activePeriodId = 'old-period';
	assert.equal(
		stats.getActivePeriod(data).id,
		'old-period',
		'existing notification IDs stay valid'
	);

	data.settings.congesSpectaclesByYear['2025'] = 600;
	data.congesPayments.push({
		id: 'audiens',
		paymentDate: '2025-05-01',
		netAmount: 700,
		withheldTax: 50,
		taxableAmount: 720,
		fileName: '',
		storedName: '',
		grossAmount: 800,
		days: 10,
		season: '2024',
		notes: ''
	});
	assert.equal(
		buildYearHistory(data, today).find((entry) => entry.year.year === 2025).congeSpectacle,
		600,
		'annual correction takes precedence over imported statements'
	);
	delete data.settings.congesSpectaclesByYear['2025'];
	assert.equal(
		buildYearHistory(data, today).find((entry) => entry.year.year === 2025).congeSpectacle,
		650,
		'history uses money received after withholding'
	);
	data.settings.congesSpectaclesByYear['2025'] = 600;
	assert.equal(
		buildYearHistory(data, today).find((entry) => entry.year.year === 2025).totalIncome,
		2560
	);
	data.settings.congesSpectaclesByYear['2025'] = 0;
	assert.equal(
		buildYearHistory(data, today).find((entry) => entry.year.year === 2025).congeSpectacle,
		0
	);
	data.settings.congesSpectaclesByYear['2022'] = 100;
	assert.ok(buildYearHistory(data, today).some((entry) => entry.year.year === 2022));
	const restored = normalizeData(JSON.parse(JSON.stringify(data)));
	assert.deepEqual(buildYearHistory(restored, today), buildYearHistory(data, today));
	console.log('History and anniversary regression tests passed.');
} finally {
	await server.close();
}
