import { PDFDocument } from 'pdf-lib';

import {
	classifyDocumentKind,
	extractPdfTextFromBuffer,
	extractPdfTextFromBufferAsync,
	extractPdfPagesText,
	extractTextFromBuffer
} from '$lib/server/documentAnalysis';
import type { DocumentKind } from '$lib/types';

export type DocumentPart = {
	kind: DocumentKind;
	buffer: Buffer;
	text: string;
	fileName: string;
	pageStart: number;
	pageEnd: number;
	isSplit: boolean;
};

function suffixFileName(fileName: string, pageStart: number, pageEnd: number) {
	const dot = fileName.lastIndexOf('.');
	const base = dot > 0 ? fileName.slice(0, dot) : fileName;
	const ext = dot > 0 ? fileName.slice(dot) : '.pdf';
	const pages = pageStart === pageEnd ? `p${pageStart}` : `p${pageStart}-${pageEnd}`;
	return `${base}-${pages}${ext}`;
}

function normalizeFileHint(value: string) {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

export function documentKindFromFileName(fileName: string, fallback: DocumentKind): DocumentKind {
	const normalized = normalizeFileHint(fileName);
	const prefix = normalized.match(/^\s*\[([^\]]+)\]/)?.[1]?.trim() ?? '';
	const searchable = prefix || normalized.replace(/\.[^.]+$/, '');
	const tokens = searchable.split(/[^a-z0-9]+/).filter(Boolean);

	if (tokens.includes('aem')) return 'AEM';
	if (tokens.includes('bp') || /\b(?:bulletin|fiche|paie)\b/.test(searchable)) {
		return 'Fiche de paie';
	}
	if (tokens.includes('cs') || /\b(?:conge|conges|spectacle|spectacles)\b/.test(searchable)) {
		return 'Congé Spectacle';
	}
	if (tokens.includes('guso')) return 'Déclaration Guso';
	if (
		tokens.includes('are') ||
		/\b(?:notification|france\s+travail|pole\s+emploi)\b/.test(searchable)
	) {
		return 'Notification ARE';
	}
	if (tokens.includes('contrat')) return 'Contrat';

	return fallback;
}

function classifyWithFileName(text: string, fileName: string, fallbackKind: DocumentKind) {
	return classifyDocumentKind(text, documentKindFromFileName(fileName, fallbackKind));
}

async function createPdfFromPages(source: PDFDocument, pageIndexes: number[]) {
	const output = await PDFDocument.create();
	const pages = await output.copyPages(source, pageIndexes);
	for (const page of pages) output.addPage(page);
	return Buffer.from(await output.save());
}

export async function splitAndClassifyDocument(
	fileName: string,
	mimeType: string,
	buffer: Buffer,
	fallbackKind: DocumentKind
): Promise<DocumentPart[]> {
	const lowerName = fileName.toLowerCase();
	const lowerType = mimeType.toLowerCase();

	if (!lowerName.endsWith('.pdf') && !lowerType.includes('pdf')) {
		const text = await extractTextFromBuffer(fileName, mimeType, buffer);
		return [
			{
				kind: classifyWithFileName(text, fileName, fallbackKind),
				buffer,
				text,
				fileName,
				pageStart: 1,
				pageEnd: 1,
				isSplit: false
			}
		];
	}

	try {
		const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
		const pageCount = source.getPageCount();
		const pageTexts = await extractPdfPagesText(buffer);
		const fullText = await extractPdfTextFromBufferAsync(buffer);
		const fullKind = classifyWithFileName(fullText, fileName, fallbackKind);

		if (pageCount <= 1) {
			return [
				{
					kind: fullKind,
					buffer,
					text: fullText,
					fileName,
					pageStart: 1,
					pageEnd: 1,
					isSplit: false
				}
			];
		}

		const pages = await Promise.all(
			Array.from({ length: pageCount }, async (_, index) => {
				const pageBuffer = await createPdfFromPages(source, [index]);
				const text =
					pageTexts[index] ||
					(await extractPdfTextFromBufferAsync(pageBuffer)) ||
					extractPdfTextFromBuffer(pageBuffer);
				return {
					index,
					text,
					kind: classifyWithFileName(text || fullText, fileName, fullKind)
				};
			})
		);

		const hasSeveralKinds = new Set(pages.map((page) => page.kind)).size > 1;
		if (!hasSeveralKinds) {
			return [
				{
					kind: pages[0]?.kind ?? fullKind,
					buffer,
					text: fullText,
					fileName,
					pageStart: 1,
					pageEnd: pageCount,
					isSplit: false
				}
			];
		}

		const groups: { kind: DocumentKind; indexes: number[]; text: string }[] = [];
		for (const page of pages) {
			const last = groups.at(-1);
			if (last && last.kind === page.kind) {
				last.indexes.push(page.index);
				last.text = `${last.text}\n\n${page.text}`.trim();
			} else {
				groups.push({ kind: page.kind, indexes: [page.index], text: page.text });
			}
		}

		return Promise.all(
			groups.map(async (group) => {
				const pageStart = group.indexes[0] + 1;
				const pageEnd = group.indexes[group.indexes.length - 1] + 1;
				const groupBuffer = await createPdfFromPages(source, group.indexes);

				return {
					kind: group.kind,
					buffer: groupBuffer,
					text: group.text,
					fileName: suffixFileName(fileName, pageStart, pageEnd),
					pageStart,
					pageEnd,
					isSplit: true
				};
			})
		);
	} catch {
		const text = extractPdfTextFromBuffer(buffer);
		return [
			{
				kind: classifyWithFileName(text, fileName, fallbackKind),
				buffer,
				text,
				fileName,
				pageStart: 1,
				pageEnd: 1,
				isSplit: false
			}
		];
	}
}
