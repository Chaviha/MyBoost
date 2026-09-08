import { Bot, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { useLife } from "@/lib/store";

export function AskPanel() {
  const life = useLife();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");

  function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text) return;
    setQ(text);
    setAnswer(answerFor(text.toLowerCase(), life));
  }

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-leaf text-forest">
        <Bot className="size-5" />
      </div>
      <p className="text-xs font-medium tracking-[0.14em] text-forest uppercase">Ask LifeBoost</p>
      <h2 className="mt-1 font-display text-xl font-medium tracking-tight">Your financial assistant</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Ask about money, businesses, assets, or what this role can do.
      </p>
      <div className="mt-4 flex h-11 items-center gap-2 rounded-md bg-canvas px-2 shadow-border">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          placeholder="Ask anything..."
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-ink-faint"
        />
        <button
          type="button"
          onClick={() => ask()}
          className="flex size-9 items-center justify-center rounded-sm bg-forest text-forest-fg"
          aria-label="Ask"
        >
          <Send className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Which business is best?", "What do customers owe?", "What can my role do?"].map(
          (s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full bg-canvas px-3 py-1.5 text-xs text-ink-soft shadow-border hover:bg-paper-2"
            >
              {s}
            </button>
          ),
        )}
      </div>
      {answer ? (
        <p className="mt-4 flex gap-2 rounded-md bg-leaf/70 px-3 py-3 text-sm text-ink-soft">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-forest" />
          <span>{answer}</span>
        </p>
      ) : null}
    </Card>
  );
}

function answerFor(q: string, life: ReturnType<typeof useLife>) {
  const {
    currentUser,
    visibleBusinesses,
    totalOutstanding,
    totalOverdue,
    netWorth,
    totalAssetValue,
    liabilities,
    businessEmployees,
    businessRequests,
    selectedBusiness,
    myTabs,
    workspace,
  } = life;

  if (q.includes("role") || q.includes("can i") || q.includes("permission")) {
    if (currentUser.account_level === "admin") {
      return "As admin you can see every business, manage users and roles, and approve requests across the platform.";
    }
    if (currentUser.account_level === "owner") {
      return "As owner you manage your businesses — sales, customers, employees, collections — and approve money requests from staff. You also choose who can add charges on each customer tab.";
    }
    if (workspace === "customer") {
      return "As a customer you see your running tab. If the owner set the tab to both or customer-only, you can add what you took. Payments reduce the balance.";
    }
    return "As an employee you can log personal assets, browse the marketplace, update job status, and submit money requests. Sales and payroll stay with the owner.";
  }

  if (q.includes("business") && (q.includes("best") || q.includes("top"))) {
    if (!visibleBusinesses.length) return "No businesses are visible on this account.";
    const best = [...visibleBusinesses].sort((a, b) => b.profit - a.profit)[0];
    return `${best.business_name} is strongest right now, with ${money(best.revenue)} revenue and ${money(best.profit)} profit.`;
  }

  if (q.includes("owe") || q.includes("customer") || q.includes("overdue") || q.includes("tab")) {
    if (workspace === "customer") {
      const owed = myTabs.reduce((s, c) => s + c.amount, 0);
      return `You currently owe ${money(owed)} across ${myTabs.length} shop${myTabs.length === 1 ? "" : "s"}. Open My tab to add stock or record a payment.`;
    }
    if (!life.can("view_collections")) {
      return "Customer balances are only visible to owners and admins.";
    }
    return `Customers currently owe ${money(totalOutstanding)}. ${money(totalOverdue)} of that is overdue.`;
  }

  if (q.includes("net worth") || q.includes("worth")) {
    return `Estimated net worth is ${money(netWorth)} — ${money(totalAssetValue)} in assets against ${money(liabilities)} in liabilities.`;
  }

  if (q.includes("employee") || q.includes("staff") || q.includes("team")) {
    if (!life.can("manage_employees")) {
      return `${currentUser.name} is signed in as ${roleLabel(currentUser.account_level)}. Team lists are for owners.`;
    }
    return `${selectedBusiness?.business_name ?? "This business"} has ${businessEmployees.length} people on the team.`;
  }

  if (q.includes("request") || q.includes("pending")) {
    const pending = businessRequests.filter((r) => r.status === "Pending");
    if (!pending.length) return "No pending money requests right now.";
    const total = pending.reduce((s, r) => s + r.amount, 0);
    return `${pending.length} pending request${pending.length === 1 ? "" : "s"} totalling ${money(total)}.`;
  }

  return `You're viewing LifeBoost as ${currentUser.name} (${roleLabel(currentUser.account_level)}). Switch roles in the sidebar to see how the workspace changes.`;
}
