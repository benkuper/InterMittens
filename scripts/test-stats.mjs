import assert from 'node:assert/strict';

import { createServer } from 'vite';

const server = await createServer({
	appType: 'custom',
	server: { middlewareMode: true }
});

function contract(title, startDate, hours, grossSalary) {
	return {
		id: title.toLowerCase().replace(/\s+/g, '-'),
		companyId: '',
		projectId: '',
		title,
		startDate,
		endDate: startDate,
		hours,
		cachets: 0,
		employmentStatus: 'Technicien',
		netSalary: 0,
		taxableNetSalary: 0,
		grossSalary,
		contributions: 0,
		netHourlyRate: 0,
		grossHourlyRate: 0,
		status: 'Signé',
		notes: '',
		documentIds: [],
		createdAt: '',
		updatedAt: ''
	};
}

try {
	const stats = await server.ssrLoadModule('/src/lib/stats.ts');
	const data = {
		periods: [
			{
				id: 'period-2026',
				indemnizationStartDate: '2026-07-10',
				anniversaryDate: '2027-07-09',
				referenceStartDate: '',
				referenceEndDate: ''
			}
		],
		settings: {
			activePeriodId: 'period-2026',
			monthlyWorkDayDivisor: 10,
			monthlyShiftCoefficient: 1,
			pmss: 0,
			cumulPmssMultiplier: 0,
			minDailyAllowance: 0
		},
		contracts: [
			contract('Année précédente', '2026-07-09', 6, 180),
			contract('Premier jour', '2026-07-10', 7, 210),
			contract('Fin juillet', '2026-07-20', 8, 240),
			contract('Dernier jour', '2027-07-09', 9, 270),
			contract('Année suivante', '2027-07-10', 10, 300)
		],
		monthlyInfos: []
	};

	const declaration = stats.buildMonthlyContractBreakdown(data, '2026-07');
	assert.deepEqual(
		declaration.map((detail) => detail.contract.title),
		['Premier jour', 'Fin juillet']
	);
	assert.equal(
		declaration.reduce((total, detail) => total + detail.grossSalary, 0),
		450
	);

	const periodJuly = stats
		.buildMonthlyStats(data)
		.find((monthStats) => monthStats.month === '2026-07');
	assert.equal(periodJuly?.grossSalary, 450);

	assert.deepEqual(
		stats.buildMonthlyContractBreakdown(data, '2027-07').map((detail) => detail.contract.title),
		['Dernier jour']
	);

	console.log('Stats regression tests passed.');
} finally {
	await server.close();
}
