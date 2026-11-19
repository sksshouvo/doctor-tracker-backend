import { escapeRegex } from './escapeRegex.js';

export const normalize = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buildSearchTokens(...values: (string | undefined | null)[]): string[] {
  const tokens = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const n = normalize(v);
    for (const t of n.split(/[^a-z0-9@.+]+/)) if (t.length >= 1) tokens.add(t);
    // email: also index the local part and the domain separately
    if (n.includes('@')) n.split('@').forEach((p) => p && tokens.add(p));
    // phone: also index digits only
    const digits = n.replace(/\D/g, '');
    if (digits.length >= 4) tokens.add(digits);
  }
  return [...tokens].slice(0, 50);
}

/** Turns a free-text query into anchored prefix regexes usable with `$all` on `searchTokens`. */
export function searchFilter(q: string): { $all: RegExp[] } | undefined {
  const terms = normalize(q).split(/\s+/).filter(Boolean).slice(0, 5);
  if (terms.length === 0) return undefined;
  return { $all: terms.map((t) => new RegExp('^' + escapeRegex(t))) };
}
