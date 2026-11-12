const DAY_MS = 86_400_000;

function parseDateOnly(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Duración de un épico en días, contando inicio y fin.
 * - businessDays: lunes a viernes, sin los feriados configurados.
 * - calendarDays: todos los días.
 * Devuelve null si falta una fecha o si el fin es anterior al inicio.
 */
export function durationDays(
  start: string | null,
  end: string | null,
  mode: 'businessDays' | 'calendarDays',
  holidays: string[] = [],
): number | null {
  if (!start || !end) return null;
  const s = parseDateOnly(start);
  const e = parseDateOnly(end);
  if (s === null || e === null || e < s) return null;
  if (mode === 'calendarDays') return Math.round((e - s) / DAY_MS) + 1;

  const skip = new Set(holidays);
  let days = 0;
  for (let t = s; t <= e; t += DAY_MS) {
    const d = new Date(t);
    const weekday = d.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (skip.has(d.toISOString().slice(0, 10))) continue;
    days++;
  }
  return days;
}

const dateFmt = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Guayaquil' });
const dateTimeFmt = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Guayaquil',
});

/** Fecha corta legible. Acepta ISO o AAAA-MM-DD (este último sin desplazar por zona). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const only = parseDateOnly(value);
  if (only !== null) {
    return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(only);
  }
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}
