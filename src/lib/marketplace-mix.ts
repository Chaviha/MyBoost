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
