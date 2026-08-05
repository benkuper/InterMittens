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
				id: 'period-2025',
				indemnizationStartDate: '2025-07-16',
				anniversaryDate: '2026-07-15',
				referenceStartDate: '',
				referenceEndDate: ''
			}
		],
		settings: {
			activePeriodId: 'period-2025',
			monthlyWorkDayDivisor: 10,
			monthlyShiftCoefficient: 1,
			pmss: 0,
			cumulPmssMultiplier: 0,
			minDailyAllowance: 0
		},
		contracts: [
			contract('Avant anniversaire', '2026-07-10', 7, 210),
			contract('Après anniversaire', '2026-07-20', 8, 240),
			contract('Mois suivant', '2026-08-02', 6, 180)
		],
		monthlyInfos: []
	};

	const declaration = stats.buildMonthlyContractBreakdown(data, '2026-07');
	assert.deepEqual(
		declaration.map((detail) => detail.contract.title),
		['Avant anniversaire', 'Après anniversaire']
	);
	assert.equal(
		declaration.reduce((total, detail) => total + detail.grossSalary, 0),
		450
	);

	const periodJuly = stats
		.buildMonthlyStats(data)
		.find((monthStats) => monthStats.month === '2026-07');
	assert.equal(periodJuly?.grossSalary, 210);
	assert.equal(stats.buildMonthlyContractBreakdown(data, '2026-08').length, 0);

	console.log('Stats regression tests passed.');
} finally {
	await server.close();
}
