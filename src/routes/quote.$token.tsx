import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { money, formatDate } from "@/lib/format";

type PublicQuote = {
  quote_id: string;
  customer_name: string;
  total: number;
  status: string;
  date: string;
  notes: string;
  quote_type: string;
  line_items: {
    line_id: string;
    description: string;
    qty: number;
    unit: string;
    rate: number;
    amount: number;
  }[];
};

type PublicBusiness = {
  business_name: string;
  phone: string;
  email: string;
  region: string;
};

export const Route = createFileRoute("/quote/$token")({
  component: PublicQuoteReviewPage,
});

function PublicQuoteReviewPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/public/quote/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load quotation");
        if (!cancelled) {
          setQuote(data.quote);
          setBusiness(data.business);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function respond(decision: "accept" | "reject") {
    if (!quote || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/public/quote/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setQuote((q) => (q ? { ...q, status: data.status || decision } : q));
      toast.success(
        decision === "accept"
          ? "Quotation accepted. The business has been notified on your tab."
          : "Quotation rejected.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-canvas flex items-center justify-center p-6">
        <p className="text-sm text-ink-muted">Loading quotation…</p>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-dvh bg-canvas flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-6 text-center">
          <h1 className="font-display text-xl font-medium">Link not available</h1>
          <p className="mt-2 text-sm text-ink-muted">{error || "Quotation not found."}</p>
        </Card>
      </div>
    );
  }

  const canRespond = quote.status === "Sent" || quote.status === "Draft";

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Quotation</p>
          <h1 className="font-display text-2xl font-medium text-forest">
            {business?.business_name || "Business"}
          </h1>
          {(business?.phone || business?.email) && (
            <p className="mt-1 text-xs text-ink-muted">
              {[business.phone, business.email, business.region].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <Card className="p-5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{quote.customer_name}</p>
              <p className="text-xs text-ink-muted">
                {formatDate(quote.date)} · {quote.quote_id}
              </p>
              {quote.notes ? <p className="mt-1 text-sm">{quote.notes}</p> : null}
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                quote.status === "Accepted"
                  ? "bg-leaf text-forest"
                  : quote.status === "Rejected"
                    ? "bg-danger-bg text-clay"
                    : "bg-amber-bg text-amber"
              }`}
            >
              {quote.status}
            </span>
          </div>

          {(quote.line_items || []).length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th className="p-2">Description</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.line_items.map((li) => (
                    <tr key={li.line_id} className="border-b border-line/50">
                      <td className="p-2">{li.description}</td>
                      <td className="p-2 text-right tabular-nums whitespace-nowrap">
                        {li.qty} {li.unit}
                      </td>
                      <td className="p-2 text-right tabular-nums">{money(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm text-ink-muted">Total</span>
            <span className="text-lg font-semibold tabular-nums">{money(quote.total)}</span>
          </div>

          {canRespond ? (
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-xs text-ink-muted">
                Accepting adds this amount to your account with {business?.business_name}. You can
                pay later through the business.
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="outline" disabled={busy} onClick={() => respond("reject")}>
                  Reject
                </Button>
                <Button type="button" disabled={busy} onClick={() => respond("accept")}>
                  Accept quotation
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted text-center pt-1">
              This quotation is already <strong>{quote.status}</strong>.
            </p>
          )}
        </Card>

        <p className="text-center text-[11px] text-ink-faint">Powered by LifeBoost</p>
      </div>
    </div>
  );
}
