const intFmt = new Intl.NumberFormat('es-EC');
const pctFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1 });

export const fmtInt = (n: number) => intFmt.format(n);
export const fmtDec = (n: number) => decFmt.format(n);

/** "42,5 %" o "—" si no puede calcularse. */
export function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${pctFmt.format(n)} %`;
}

export function plural(n: number, one: string, many: string): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}
