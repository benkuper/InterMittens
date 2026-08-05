import { formatIsoDateFr } from '$lib/date';

export function formatCurrency(value: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
		maximumFractionDigits: 0
	}).format(value || 0);
}

export function formatPreciseCurrency(value: number) {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
		maximumFractionDigits: 2
	}).format(value || 0);
}

export function formatNumber(value: number, digits = 0) {
	return new Intl.NumberFormat('fr-FR', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(value || 0);
}

export function formatDate(value: string) {
	return formatIsoDateFr(value) || '-';
}
