import assert from 'node:assert/strict';

import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createServer } from 'vite';

const server = await createServer({
	appType: 'custom',
	server: { middlewareMode: true }
});

try {
	const documentAnalysis = await server.ssrLoadModule('/src/lib/server/documentAnalysis.ts');
	const pdfParts = await server.ssrLoadModule('/src/lib/server/pdfParts.ts');
	assert.equal(pdfParts.documentKindFromFileName('cs-2026-08.pdf', 'Autre'), 'Congé Spectacle');
	assert.equal(pdfParts.documentKindFromFileName('aem-2026-08.pdf', 'Autre'), 'AEM');
	assert.equal(pdfParts.documentKindFromFileName('bp-2026-08.pdf', 'Autre'), 'Fiche de paie');
	assert.equal(pdfParts.documentKindFromFileName('contrat-katabasis.pdf', 'Autre'), 'Contrat');
	const contractText = [
		"CONTRAT D'ENGAGEMENT TECHNICIEN",
		'Contrat 123456',
		'La description du projet : Projet Aurora',
		'Le projet se déroule à Paris',
		'Le présent engagement couvre la période du 08/07/2026 au 09/07/2026',
		'pour les dates travaillées suivantes :',
		'08/07/2026 - 7 Heure(s)',
		'09/07/2026 - 7 Heure(s)',
		'RÉMUNÉRATION',
		'Il sera alloué à Camille Martin à titre de salaire la somme de 420,00 euros bruts.',
		'RETRAITE ET CONGÉS PAYÉS',
		'Les cotisations seront versées à Audiens et à la caisse des Congés Spectacles.'
	].join(' ');

	assert.equal(documentAnalysis.classifyDocumentKind(contractText, 'Autre'), 'Contrat');
	assert.deepEqual(documentAnalysis.analyzeDocumentText(contractText).fields, {
		startDate: '2026-07-08',
		endDate: '2026-07-09',
		title: 'Projet Aurora',
		hours: 14,
		employmentStatus: 'Technicien',
		grossSalary: 420,
		grossHourlyRate: 30
	});

	const movinmotionText = [
		"Conseiller technique à la réalisation Contrat d'engagement à Durée Déterminée d'Usage n°7000000000000000",
		'Nom de la production : KATABASIS',
		'Fonction : C o n s e i l l e r t e c h n i q u e à l a r é a l i s a t i o n',
		"Numéro d'objet : 251Z000000000000000",
		'Statut : Technicien Cadre',
		'Lieu de travail : PARIS',
		'Rémunération : 274,40 € bruts par jour (7h)',
		'Le SALARIE est engagé du 20 juillet 2026 au 31 juillet 2026 pour une durée de 70.0 h sur 10.0 jours travaillés,',
		'pour une rémunération totale de 2 744,00 € bruts.',
		'Les destinataires de ces données sont notamment les organismes de sécurité sociale, Pôle emploi et les services des impôts.',
		'Le document est soumis à la convention de preuve de la signature électronique de Movinmotion.'
	].join(' ');

	assert.equal(documentAnalysis.classifyDocumentKind(movinmotionText, 'Autre'), 'Contrat');
	assert.deepEqual(documentAnalysis.analyzeDocumentText(movinmotionText).fields, {
		startDate: '2026-07-20',
		endDate: '2026-07-31',
		title: 'Katabasis',
		hours: 70,
		employmentStatus: 'Technicien cadre',
		grossSalary: 2744,
		grossHourlyRate: 39.2
	});

	const movinmotionPayslipText = [
		'Movinmotion',
		'Fiche de paie',
		'Salaire brut : 1 500,00 €',
		'Net a payer : 1 164,00 €',
		'Cotisations salariales : 336,00 €'
	].join(' ');

	assert.equal(
		documentAnalysis.classifyDocumentKind(movinmotionPayslipText, 'Autre'),
		'Fiche de paie'
	);
	assert.equal(
		documentAnalysis.analyzeDocumentText(movinmotionPayslipText).fields.grossSalary,
		1500
	);
	assert.equal(documentAnalysis.analyzeDocumentText(movinmotionPayslipText).fields.netSalary, 1164);

	const movinmotionCongeSpectacleText = [
		'Movinmotion',
		'Congé Spectacle',
		'Indemnité de congés spectacle',
		'Montant brut : 120,00 €',
		'Net a payer : 96,00 €',
		'Caisse des Congés Spectacles'
	].join(' ');

	assert.equal(
		documentAnalysis.classifyDocumentKind(movinmotionCongeSpectacleText, 'Autre'),
		'Congé Spectacle'
	);

	const aemText = [
		'ATTESTATION (AEM)',
		"Nombre d'HEURES effectuées Nombre de CACHETS* 5/ AUTHENTIFICATION PAR L'EMPLOYEUR",
		'SILAE X X 03 08 2026 31 08 2026 X 147 21 5762.40 5762.40'
	].join(' ');
	const aemFields = documentAnalysis.analyzeDocumentText(aemText).fields;
	assert.equal(aemFields.hours, 147);
	assert.equal(aemFields.cachets, undefined);

	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const firstPage = pdf.addPage();
	firstPage.drawText(contractText, { font, maxWidth: 500, size: 10, x: 40, y: 760 });
	const secondPage = pdf.addPage();
	secondPage.drawText('Suite du contrat. Fait en double exemplaire. Signatures.', {
		font,
		size: 10,
		x: 40,
		y: 760
	});

	const parts = await pdfParts.splitAndClassifyDocument(
		'123456-signed.pdf',
		'application/pdf',
		Buffer.from(await pdf.save()),
		'Autre'
	);

	assert.equal(parts.length, 1);
	assert.equal(parts[0].kind, 'Contrat');
	assert.equal(parts[0].pageStart, 1);
	assert.equal(parts[0].pageEnd, 2);
	assert.equal(parts[0].isSplit, false);
	assert.deepEqual(parts[0].extractionNotes, []);

	const prefixedPdf = await PDFDocument.create();
	const prefixedFirstPage = prefixedPdf.addPage();
	prefixedFirstPage.drawText('CERTIFICAT DE CONGES SPECTACLES', {
		font,
		size: 10,
		x: 40,
		y: 760
	});
	const prefixedSecondPage = prefixedPdf.addPage();
	prefixedSecondPage.drawText('CONTRAT DE TRAVAIL', { font, size: 10, x: 40, y: 760 });

	const prefixedParts = await pdfParts.splitAndClassifyDocument(
		'contrat-katabasis.pdf',
		'application/pdf',
		Buffer.from(await prefixedPdf.save()),
		'Autre'
	);

	assert.equal(prefixedParts.length, 1);
	assert.equal(prefixedParts[0].kind, 'Contrat');
	assert.equal(prefixedParts[0].pageStart, 1);
	assert.equal(prefixedParts[0].pageEnd, 2);
	assert.equal(prefixedParts[0].isSplit, false);

	const scannedCanvas = createCanvas(1400, 1800);
	const scannedContext = scannedCanvas.getContext('2d');
	scannedContext.fillStyle = '#ffffff';
	scannedContext.fillRect(0, 0, scannedCanvas.width, scannedCanvas.height);
	scannedContext.fillStyle = '#111111';
	scannedContext.font = 'bold 42px Arial';
	scannedContext.fillText("CONTRAT D'ENGAGEMENT A DUREE DETERMINEE DIT D'USAGE", 80, 120);
	scannedContext.font = '30px Arial';
	[
		'Compagnie Ultreia',
		'Monsieur Test est engage en qualite de Artiste visuel.',
		'Le present engagement couvre la periode du 06/09/26 au 08/09/26.',
		'Nombre de jour(s) ou cachet(s) : 3 (soit 24 heure(s)).',
		'Il sera alloue a Monsieur Test a titre de salaire la somme de 480,00 euros bruts.'
	].forEach((line, index) => scannedContext.fillText(line, 80, 240 + index * 70));

	const scannedPdf = await PDFDocument.create();
	const scannedImage = await scannedPdf.embedPng(scannedCanvas.toBuffer('image/png'));
	const scannedPage = scannedPdf.addPage([700, 900]);
	scannedPage.drawImage(scannedImage, { x: 0, y: 0, width: 700, height: 900 });
	const scannedParts = await pdfParts.splitAndClassifyDocument(
		'scan.pdf',
		'application/pdf',
		Buffer.from(await scannedPdf.save()),
		'Autre'
	);
	const scannedAnalysis = documentAnalysis.analyzeDocumentText(scannedParts[0].text);

	assert.equal(scannedParts[0].kind, 'Contrat');
	assert.match(scannedParts[0].extractionNotes.join(' '), /OCR française appliquée/);
	assert.deepEqual(scannedAnalysis.fields, {
		startDate: '2026-09-06',
		endDate: '2026-09-08',
		hours: 24,
		employmentStatus: 'Artiste visuel',
		grossSalary: 480,
		grossHourlyRate: 20
	});

	console.log('Document analysis regression tests passed.');
} finally {
	await server.close();
}
