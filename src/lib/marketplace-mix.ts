type Owned = { owner_id?: string; business_id?: string; business_name?: string };

/**
 * Mixes a marketplace list so listings from different owners alternate
 * (A1, B1, C1, A2, B2, …) instead of showing all of one owner's items before the next.
 * Order inside each owner and the order owners first appear in are kept, so the result is stable.
 */
export function interleaveByOwner<T>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const o = item as unknown as Owned;
    const key = String(o.owner_id || o.business_id || o.business_name || "");
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  const lists = [...groups.values()];
  const mixed: T[] = [];
  for (let round = 0; mixed.length < items.length; round++) {
    for (const list of lists) if (round < list.length) mixed.push(list[round]);
  }
  return mixed;
}

/**
 * Fisher–Yates shuffle. Returns a new array; does not mutate the input.
 */
export function shuffleRandom<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Pick up to `count` items at random for a marketplace showcase.
 * New random selection every call (e.g. page refresh / data load).
 */
export function pickRandomShowcase<T>(items: T[], count = 6): T[] {
  if (!items.length || count <= 0) return [];
  return shuffleRandom(items).slice(0, Math.min(count, items.length));
}

function normalizeName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(ltd|limited|llc|inc|co|company|the|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeImage(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://example.local");
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return raw.toLowerCase().split("?")[0].split("#")[0];
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n];
}

/** Names treated as the same listing: exact, containment, edit distance, or token overlap. */
export function namesFuzzyMatch(aRaw: unknown, bRaw: unknown): boolean {
  const a = normalizeName(aRaw);
  const b = normalizeName(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 3) return false;
  const dist = levenshtein(a, b);
  const similarity = 1 - dist / maxLen;
  if (similarity >= 0.85) return true;
  if (maxLen <= 12 && dist <= 2) return true;
  const ta = new Set(a.split(" ").filter((t) => t.length > 1));
  const tb = new Set(b.split(" ").filter((t) => t.length > 1));
  if (ta.size && tb.size) {
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    const union = ta.size + tb.size - inter;
    if (union > 0 && inter / union >= 0.8 && inter >= 2) return true;
  }
  return false;
}

/**
 * Marketplace cards: only one entry when the name is fuzzy-equal OR cover image matches.
 * Prefer higher views+likes when choosing which duplicate to keep.
 */
export function dedupeByNameOrImage<T extends { views?: number; likes?: number }>(
  items: T[],
  getName: (item: T) => unknown,
  getImage: (item: T) => unknown,
): T[] {
  const list = [...(items || [])].sort((a, b) => {
    const score = (x: T) => Number(x.views || 0) + Number(x.likes || 0);
    return score(b) - score(a);
  });
  const keptNames: string[] = [];
  const seenImages = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const name = normalizeName(getName(item));
    const image = normalizeImage(getImage(item));
    if (image && seenImages.has(image)) continue;
    if (name && keptNames.some((k) => namesFuzzyMatch(k, name))) continue;
    if (name) keptNames.push(name);
    if (image) seenImages.add(image);
    out.push(item);
  }
  return out;
}
