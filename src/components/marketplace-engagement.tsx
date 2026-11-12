import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Heart, MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MarketplaceReview } from "@/lib/types";

export type EngagementKind = "business" | "asset" | "product";

type EngagementState = {
  views: number;
  likes: number;
  reviews: MarketplaceReview[];
};

const EVENT_NAME = "lb-marketplace-engagement";
const POLL_MS = 8_000;

type EngagementEventDetail = {
  kind: EngagementKind;
  id: string;
  views: number;
  likes: number;
  reviews?: MarketplaceReview[];
  review_count?: number;
};

function storageKey(kind: EngagementKind, id: string, action: "like" | "view") {
  return `lb_mkt_${action}_${kind}_${id}`;
}

function hasSessionFlag(kind: EngagementKind, id: string, action: "like" | "view") {
  try {
    return sessionStorage.getItem(storageKey(kind, id, action)) === "1";
  } catch {
    return false;
  }
}

function setSessionFlag(kind: EngagementKind, id: string, action: "like" | "view") {
  try {
    sessionStorage.setItem(storageKey(kind, id, action), "1");
  } catch {
    /* ignore */
  }
}

function hasLikeFlag(kind: EngagementKind, id: string) {
  try {
    return localStorage.getItem(storageKey(kind, id, "like")) === "1";
  } catch {
    return false;
  }
}

function setLikeFlag(kind: EngagementKind, id: string) {
  try {
    localStorage.setItem(storageKey(kind, id, "like"), "1");
  } catch {
    /* ignore */
  }
}

function engagementBase(kind: EngagementKind, id: string) {
  if (kind === "business") return `/api/public/marketplace/businesses/${encodeURIComponent(id)}`;
  if (kind === "asset") return `/api/public/marketplace/assets/${encodeURIComponent(id)}`;
  return `/api/public/marketplace/products/${encodeURIComponent(id)}`;
}

function broadcastEngagement(detail: EngagementEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  try {
    const bc = new BroadcastChannel("lb-marketplace-engagement");
    bc.postMessage(detail);
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

async function postEngagement(
  kind: EngagementKind,
  id: string,
  action: "view" | "like" | "review",
  body?: Record<string, unknown>,
): Promise<EngagementState | null> {
  try {
    const res = await fetch(`${engagementBase(kind, id)}/${action}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      views?: number;
      likes?: number;
      reviews?: MarketplaceReview[];
    };
    if (!data.ok) return null;
    return {
      views: Number(data.views || 0),
      likes: Number(data.likes || 0),
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    };
  } catch {
    return null;
  }
}

async function fetchEngagement(kind: EngagementKind, id: string): Promise<EngagementState | null> {
  try {
    const res = await fetch(`${engagementBase(kind, id)}/engagement`, {
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      views?: number;
      likes?: number;
      reviews?: MarketplaceReview[];
    };
    if (!data.ok) return null;
    return {
      views: Number(data.views || 0),
      likes: Number(data.likes || 0),
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    };
  } catch {
    return null;
  }
}

function mergeState(prev: EngagementState, next: Partial<EngagementState> | null): EngagementState {
  if (!next) return prev;
  return {
    views: Math.max(prev.views, Number(next.views ?? prev.views)),
    likes: Math.max(prev.likes, Number(next.likes ?? prev.likes)),
    reviews:
      Array.isArray(next.reviews) && next.reviews.length >= prev.reviews.length
        ? next.reviews
        : prev.reviews,
  };
}

/** Compact views / likes / reviews with real-time view counting. */
export function MarketplaceEngagement({
  kind,
  id,
  views = 0,
  likes = 0,
  reviews = [],
  className = "",
  recordViewOnMount = false,
  compact = false,
  live = true,
}: {
  kind: EngagementKind;
  id: string;
  views?: number;
  likes?: number;
  reviews?: MarketplaceReview[];
  className?: string;
  /** Record a view when the counter enters the viewport (preferred) or on mount. */
  recordViewOnMount?: boolean;
  compact?: boolean;
  /** Poll server + listen for broadcasts so counts stay live. */
  live?: boolean;
}) {
  const [state, setState] = useState<EngagementState>({
    views: Number(views || 0),
    likes: Number(likes || 0),
    reviews: Array.isArray(reviews) ? reviews : [],
  });
  const [liked, setLiked] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(5);
  const [saving, setSaving] = useState(false);
  const [pulse, setPulse] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewedRef = useRef(false);
  const prevViewsRef = useRef(Number(views || 0));

  // Sync from parent props without decreasing live counts
  useEffect(() => {
    setState((prev) =>
      mergeState(prev, {
        views: Number(views || 0),
        likes: Number(likes || 0),
        reviews: Array.isArray(reviews) ? reviews : [],
      }),
    );
  }, [id, views, likes, reviews]);

  useEffect(() => {
    setLiked(hasLikeFlag(kind, id));
    viewedRef.current = hasSessionFlag(kind, id, "view");
  }, [kind, id]);

  const applyLive = useCallback((next: EngagementState | null) => {
    if (!next) return;
    setState((prev) => {
      const merged = mergeState(prev, next);
      if (merged.views > prev.views) {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 600);
      }
      return merged;
    });
    broadcastEngagement({
      kind,
      id,
      views: next.views,
      likes: next.likes,
      reviews: next.reviews,
      review_count: next.reviews.length,
    });
  }, [kind, id]);

  const recordView = useCallback(async () => {
    if (!id || viewedRef.current) return;
    viewedRef.current = true;
    setSessionFlag(kind, id, "view");
    // Optimistic real-time bump
    setState((prev) => {
      const next = { ...prev, views: prev.views + 1 };
      prevViewsRef.current = next.views;
      return next;
    });
    setPulse(true);
    window.setTimeout(() => setPulse(false), 600);
    const server = await postEngagement(kind, id, "view");
    if (server) applyLive(server);
  }, [kind, id, applyLive]);

  // IntersectionObserver: count when the counter is actually seen
  useEffect(() => {
    if (!recordViewOnMount || !id) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      void recordView();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.35)) {
          void recordView();
          io.disconnect();
        }
      },
      { threshold: [0.35, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, recordViewOnMount, recordView]);

  // Cross-component / cross-tab live updates
  useEffect(() => {
    if (!live) return;
    const onLocal = (ev: Event) => {
      const detail = (ev as CustomEvent<EngagementEventDetail>).detail;
      if (!detail || detail.kind !== kind || detail.id !== id) return;
      setState((prev) =>
        mergeState(prev, {
          views: detail.views,
          likes: detail.likes,
          reviews: detail.reviews,
        }),
      );
    };
    window.addEventListener(EVENT_NAME, onLocal);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("lb-marketplace-engagement");
      bc.onmessage = (msg) => {
        const detail = msg.data as EngagementEventDetail;
        if (!detail || detail.kind !== kind || detail.id !== id) return;
        setState((prev) =>
          mergeState(prev, {
            views: detail.views,
            likes: detail.likes,
            reviews: detail.reviews,
          }),
        );
      };
    } catch {
      bc = null;
    }
    return () => {
      window.removeEventListener(EVENT_NAME, onLocal);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, [kind, id, live]);

  // Poll server for real-time counts from other visitors
  useEffect(() => {
    if (!live || !id) return;
    let cancelled = false;
    const tick = async () => {
      const next = await fetchEngagement(kind, id);
      if (cancelled || !next) return;
      setState((prev) => {
        const merged = mergeState(prev, next);
        if (merged.views > prevViewsRef.current) {
          prevViewsRef.current = merged.views;
          setPulse(true);
          window.setTimeout(() => setPulse(false), 600);
        }
        return merged;
      });
    };
    const interval = window.setInterval(() => void tick(), POLL_MS);
    // First refresh shortly after mount so open tabs catch up
    const first = window.setTimeout(() => void tick(), 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(first);
    };
  }, [kind, id, live]);

  const reviewCount = state.reviews.length;
  const avgRating = useMemo(() => {
    if (!state.reviews.length) return 0;
    const sum = state.reviews.reduce((a, r) => a + Number(r.rating || 0), 0);
    return Math.round((sum / state.reviews.length) * 10) / 10;
  }, [state.reviews]);

  async function handleLike(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (liked) {
      toast.message("You already liked this.");
      return;
    }
    setLiked(true);
    setLikeFlag(kind, id);
    setState((prev) => ({ ...prev, likes: prev.likes + 1 }));
    const next = await postEngagement(kind, id, "like");
    if (next) applyLive(next);
    toast.success("Thanks for the like!");
  }

  async function submitReview() {
    if (!text.trim()) {
      toast.error("Write a short review first.");
      return;
    }
    setSaving(true);
    const next = await postEngagement(kind, id, "review", {
      author_name: author.trim() || "Anonymous",
      text: text.trim(),
      rating,
    });
    setSaving(false);
    if (!next) {
      toast.error("Could not send review. Try again.");
      return;
    }
    applyLive(next);
    setText("");
    setRating(5);
    setReviewOpen(false);
    toast.success("Review submitted.");
  }

  return (
    <div ref={rootRef} className={className} onClick={(e) => e.stopPropagation()}>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        <span
          className={`inline-flex items-center gap-1 text-ink-muted transition ${
            pulse ? "scale-110 text-forest font-semibold" : ""
          }`}
          title="Views (updates live)"
        >
          <Eye className={compact ? "size-3.5" : "size-4"} />
          <span className="tabular-nums">{state.views}</span>
        </span>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition hover:bg-leaf/40 ${
            liked ? "text-clay" : "text-ink-muted"
          }`}
          title="Like"
          onClick={handleLike}
        >
          <Heart className={`${compact ? "size-3.5" : "size-4"} ${liked ? "fill-current" : ""}`} />
          <span className="tabular-nums">{state.likes}</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink-muted transition hover:bg-leaf/40"
          title="Reviews"
          onClick={(e) => {
            e.stopPropagation();
            setReviewOpen(true);
          }}
        >
          <MessageSquare className={compact ? "size-3.5" : "size-4"} />
          <span className="tabular-nums">{reviewCount}</span>
          {avgRating > 0 ? (
            <span className="tabular-nums text-ink-faint">· {avgRating}★</span>
          ) : null}
        </button>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="w-[min(calc(100%-2rem),28rem)] max-h-[min(90dvh,36rem)]">
          <DialogHeader>
            <DialogTitle>Reviews</DialogTitle>
            <DialogDescription>
              {reviewCount
                ? `${reviewCount} review${reviewCount === 1 ? "" : "s"}${avgRating ? ` · avg ${avgRating}★` : ""}`
                : "Be the first to leave a review."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-40 space-y-2 overflow-y-auto">
            {state.reviews.length ? (
              [...state.reviews].reverse().map((r) => (
                <div key={r.review_id} className="rounded-md border border-ink/10 bg-canvas/50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.author_name}</p>
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-700">
                      <Star className="size-3 fill-current" />
                      {r.rating}
                    </span>
                  </div>
                  <p className="mt-1 text-ink-muted whitespace-pre-wrap">{r.text}</p>
                  {r.created_at ? (
                    <p className="mt-1 text-[10px] text-ink-faint">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-muted">No reviews yet.</p>
            )}
          </div>

          <div className="space-y-2 border-t border-ink/10 pt-3">
            <p className="text-sm font-medium">Write a review</p>
            <Input
              placeholder="Your name (optional)"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-muted">Rating</span>
              <select
                className="h-9 rounded-md border border-ink/15 bg-paper px-2 text-sm"
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} star{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="min-h-20 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm"
              placeholder="What did you like or notice?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setReviewOpen(false)}>
                Close
              </Button>
              <Button type="button" onClick={() => void submitReview()} disabled={saving}>
                {saving ? "Sending…" : "Send review"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
