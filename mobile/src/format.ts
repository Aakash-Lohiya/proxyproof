export function fmtTime(ms: number | null | undefined) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(ms: number | null | undefined) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function fmtDateTime(ms: number | null | undefined) {
  if (!ms) return '—';
  return `${fmtDate(ms)} · ${fmtTime(ms)}`;
}

export function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/** First name for greetings, skipping titles like "Prof." or "Dr". */
export function firstName(name: string | undefined) {
  const parts = (name ?? '').split(/\s+/).filter(Boolean);
  const real = parts.find((p) => !/^(prof|dr|mr|mrs|ms|sir)\.?$/i.test(p));
  return real ?? parts[0] ?? '';
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function pct(n: number | null | undefined) {
  return n === null || n === undefined ? '—' : `${n}%`;
}
