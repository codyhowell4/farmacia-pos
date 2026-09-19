import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

// LFPDPPP: nunca imprimir la CURP completa en tickets — solo los últimos 4.
export function maskCurp(curp) {
	if (!curp) return curp;
	const s = String(curp);
	if (s.length <= 4) return s;
	return '•'.repeat(s.length - 4) + s.slice(-4);
}