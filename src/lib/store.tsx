import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uid } from "./format";
import {
  activeEmployment,
  can,
  canPostCharge,
  canRecordPayment,
  workspaceKind,
  type Permission,
} from "./roles";
import { getCatalogueTemplate } from "./catalogue-templates";
import { buildSeed } from "./seed";

const LifeContext = createContext<any>(null);
import type {
  AccountLevel,
  Asset,
  Business,
  ChargeMode,
  Customer,
  CustomerStatus,
  Employee,
  EnrichedBusiness,
  Expense,
  Income,
  Invoice,
  InvoicePicture,
  InvoiceStatus,
  Job,
  JobStatus,
  LedgerEntry,
  LifeState,
  MarketplaceProduct,
  MediaItem,
  MoneyRequest,
  Offer,
  Product,
  ProductCategory,
  ProductVariant,
  Quotation,
  Relationship,
  RequestStatus,
  Sacco,
  Sale,
  SpecDefinition,
  SpecValues,
  User,
} from "./types";

const guestUser: User = {
  user_id: "",
  business_id: "",
  name: "Guest",
  email: "",
  phone: "",
  avatar_url: "",
  role: "Guest",
  account_level: "user",
  status: "guest",
};

// Derives a customer's tab status from their due date and outstanding balance.
function dueStatus(dueDate: string, amount: number): CustomerStatus {
  if (Number(amount || 0) <= 0) return "Paid";
  if (!dueDate) return "Pending";
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return "Pending";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (daysUntilDue < 0) return "Overdue";
  if (daysUntilDue <= 3) return "Due soon";
  return "Pending";
}

function enrich(state: LifeState, business: Business): EnrichedBusiness {
  const revenue = state.sales
    .filter((s) => s.business_id === business.business_id)
    .reduce((sum, s) => sum + Number(s.total || 0), 0);
  const expenses = state.expenses
    .filter((e) => e.business_id === business.business_id)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  return { ...business, revenue, expenses, profit: revenue - expenses };
}

export function LifeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LifeState>(buildSeed);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [publicMarketplace, setPublicMarketplace] = useState<{
    businesses: Business[];
    professionals: Array<Record<string, unknown>>;
    assets: Array<Record<string, unknown>>;
    products: MarketplaceProduct[];
  }>({ businesses: [], professionals: [], assets: [], products: [] });

  const refreshPublicMarketplace = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/public/marketplace", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const payload = await response.json();
      setPublicMarketplace({
        businesses: Array.isArray(payload.businesses) ? payload.businesses : [],
        professionals: Array.isArray(payload.professionals) ? payload.professionals : [],
        assets: Array.isArray(payload.assets) ? payload.assets : [],
        products: Array.isArray(payload.products) ? payload.products : [],
      });
      return true;
    } catch {
      // Marketplace is public and should not prevent the private workspace from loading.
      return false;
    }
  };

  const removeLegacyDemoData = (input: LifeState): LifeState => {
    const next = structuredClone(input);
    const demoBusinesses = new Set(["BUS001", "BUS002"]);
    const demoCustomers = new Set(["CUS001", "CUS002", "CUS003", "CUS004", "CUS005"]);
    const demoEmployees = new Set(["EMP001", "EMP002", "EMP003"]);
    const demoProducts = new Set(["PRD001", "PRD002"]);
    const demoSales = new Set(["SAL001", "SAL002", "SAL003"]);
    const demoExpenses = new Set(["EXP001", "EXP002", "EXP003"]);
    const demoJobs = new Set(["JOB001", "JOB002", "JOB003"]);
    const demoQuotes = new Set(["QTE001", "QTE002"]);
    const demoInvoices = new Set(["INV001", "INV002"]);
    const demoIncome = new Set(["INC001", "INC002", "INC003", "INC004"]);
    const demoSaccos = new Set(["SAC001", "SAC002", "SAC003"]);
    const demoOffers = new Set(["OFR001", "OFR002"]);
    const demoLedger = new Set(["LED001", "LED002", "LED003", "LED004", "LED005", "LED006", "LED007"]);
    const demoRequests = new Set(["REQ001", "REQ002", "REQ003"]);
    const demoUsers = new Set(["amina@lifeboost.ke", "felix@lifeboost.ke", "john@lifeboost.ke", "grace@lifeboost.ke", "njeri@supplies.ke"]);
    next.businesses = (next.businesses || []).filter((b) => !demoBusinesses.has(b.business_id) && !["Felix Hardware", "Garden Kitchen"].includes(b.business_name));
    next.relationships = (next.relationships || []).filter((r) => !demoBusinesses.has(r.business_id));
    next.customers = (next.customers || []).filter((c) => !demoBusinesses.has(c.business_id) && !demoCustomers.has(c.customer_id));
    next.ledger = (next.ledger || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoLedger.has(x.entry_id));
    next.employees = (next.employees || []).filter((e) => !demoBusinesses.has(e.business_id) && !demoEmployees.has(e.employee_id));
    next.assets = (next.assets || []).filter((a) => !demoBusinesses.has(a.business_id));
    next.sales = (next.sales || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoSales.has(x.sale_id));
    next.expenses = (next.expenses || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoExpenses.has(x.expense_id));
    next.requests = (next.requests || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoRequests.has(x.request_id));
    next.products = (next.products || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoProducts.has(x.product_id));
    next.jobs = (next.jobs || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoJobs.has(x.job_id));
    next.quotations = (next.quotations || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoQuotes.has(x.quote_id));
    next.invoices = (next.invoices || []).filter((x) => !demoBusinesses.has(x.business_id) && !demoInvoices.has(x.invoice_id));
    next.income = (next.income || []).filter((x) => !demoIncome.has(x.income_id));
    next.saccos = (next.saccos || []).filter((x) => !demoSaccos.has(x.sacco_id));
    next.offers = (next.offers || []).filter((x) => !demoOffers.has(x.offer_id));
    next.users = (next.users || []).filter((u) => !demoUsers.has(String(u.email || "").toLowerCase()));
    next.liabilities = Object.fromEntries(Object.entries(next.liabilities || {}).filter(([id]) => !["USR000", "USR001", "USR002", "USR003", "USR004"].includes(id)));
    next.currentUserId = next.users.some((u) => u.user_id === next.currentUserId) ? next.currentUserId : "";
    next.selectedBusinessId = next.businesses.some((b) => b.business_id === next.selectedBusinessId) ? next.selectedBusinessId : "";
    return normalizeCatalogue(next);
  };

  /** Ensure catalogue tables exist and products have specs maps (safe for older saved state). */
  const normalizeCatalogue = (input: LifeState): LifeState => {
    const next = input;
    next.product_categories = Array.isArray(next.product_categories) ? next.product_categories : [];
    next.product_specs = Array.isArray(next.product_specs) ? next.product_specs : [];
    next.product_variants = Array.isArray(next.product_variants) ? next.product_variants : [];
    next.products = (next.products || []).map((p) => ({
      ...p,
      item_kind: p.item_kind === "service" ? "service" : "product",
      specs: p.specs && typeof p.specs === "object" ? p.specs : {},
      sku: p.sku || "",
      description: p.description || "",
      category_id: p.category_id || "",
      image_url: p.image_url || "",
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      listed: true, // always available for quotations
    }));
    next.product_variants = next.product_variants.map((v) => ({
      ...v,
      specs: v.specs && typeof v.specs === "object" ? v.specs : {},
      sku: v.sku || "",
    }));
    return next;
  };

  const prepareStateForUser = (seed: LifeState, user: User): LifeState => {
    const next = structuredClone(seed);
    next.currentUserId = user.user_id;
    next.selectedBusinessId = "";
    next.users = [user];
    next.liabilities = {};
    return next;
  };

  const hydrate = async () => {
    try {
      const me = await fetch("/api/auth/me", { credentials: "include" });
      if (!me.ok) {
        setAuthenticated(false);
        return;
      }
      const { user } = (await me.json()) as { user: User };
      const response = await fetch("/api/state", { credentials: "include" });
      const payload = response.ok ? ((await response.json()) as { state: LifeState | null }) : { state: null };
      const next = normalizeCatalogue(
        payload.state ? removeLegacyDemoData(payload.state) : prepareStateForUser(buildSeed(), user),
      );
      next.currentUserId = user.user_id;
      next.businesses = (next.businesses || []).map((b) => ({ ...b, gallery: Array.isArray(b.gallery) ? b.gallery : [] }));
      next.assets = (next.assets || []).map((a) => ({ ...a, gallery: Array.isArray(a.gallery) ? a.gallery : [] }));
      const existing = next.users.find((u) => u.user_id === user.user_id);
      if (existing) Object.assign(existing, user);
      else next.users.unshift(user);
      setState(next);
      setAuthenticated(true);
      setReady(true);
      if (!payload.state) await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ state: next }) });
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    void hydrate();
  }, []);

  useEffect(() => {
    void refreshPublicMarketplace();
  }, []);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ state }),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state, ready, authenticated]);

  const api = useMemo(() => {
    const currentUser =
      state.users.find((u) => u.user_id === state.currentUserId) ?? state.users[0] ?? guestUser;

    const level = currentUser.account_level;
    const allow = (perm: Permission) => can(level, perm);
    const workspace = workspaceKind(currentUser, state.relationships);

    const isBusinessOwner = (businessId?: string) => {
      const id = businessId || state.selectedBusinessId;
      if (currentUser.account_level === "admin") return true;
      return state.businesses.some(
        (b) => b.business_id === id && b.owner_user_id === currentUser.user_id,
      );
    };

    const visibleBusinesses = state.businesses
      .filter((b) => {
        if (allow("manage_all_businesses")) return true;
        if (allow("manage_own_businesses")) return b.owner_user_id === currentUser.user_id;
        return state.relationships.some(
          (r) =>
            r.user_id === currentUser.user_id &&
            r.business_id === b.business_id &&
            r.status.toLowerCase() === "active",
        );
      })
      .map((b) => enrich(state, b));

    const selectedBusiness =
      visibleBusinesses.find((b) => b.business_id === state.selectedBusinessId) ??
      visibleBusinesses[0];

    const bid = selectedBusiness?.business_id ?? "";

    const myAssets = state.assets.filter((a) => {
      if (allow("manage_all_businesses")) return true;
      if (a.user_id === currentUser.user_id) return true;
      if (allow("manage_own_businesses")) {
        return state.businesses.some(
          (b) => b.business_id === a.business_id && b.owner_user_id === currentUser.user_id,
        );
      }
      return false;
    });

    const marketplace = state.assets.filter((a) => a.listed);

    const businessCustomers = state.customers.filter((c) => c.business_id === bid);
    const businessEmployees = state.employees.filter((e) => e.business_id === bid);
    const businessSales = state.sales.filter((s) => s.business_id === bid);
    const businessProducts = state.products.filter((p) => p.business_id === bid);
    const businessGoods = businessProducts.filter((p) => (p.item_kind || "product") !== "service");
    const businessServices = businessProducts.filter((p) => p.item_kind === "service");
    const businessCategories = (state.product_categories || []).filter((c) => c.business_id === bid);
    const businessSpecDefs = (state.product_specs || []).filter((s) => s.business_id === bid);
    const businessVariants = (state.product_variants || []).filter((v) => v.business_id === bid);
    const businessExpenses = state.expenses.filter((e) => e.business_id === bid);
    const businessJobs = state.jobs.filter((j) =>
      allow("manage_jobs") ? (allow("manage_all_businesses") ? true : j.business_id === bid) : false,
    );
    const myJobs = state.jobs.filter((j) => {
      const emp = state.employees.find((e) => e.employee_id === j.employee_id);
      return emp?.user_id === currentUser.user_id;
    });
    const businessQuotes = state.quotations.filter((q) => q.business_id === bid);
    const businessInvoices = state.invoices.filter((i) => i.business_id === bid);
    const myIncome = state.income.filter((i) => i.user_id === currentUser.user_id);
    const mySaccos = state.saccos.filter((s) => s.user_id === currentUser.user_id);
    const myOffers = state.offers.filter((o) => o.user_id === currentUser.user_id);
    const myConnections = state.relationships
      .filter(
        (r) =>
          r.user_id === currentUser.user_id &&
          (r.relationship_type === "employee" || r.relationship_type === "customer") &&
          r.status.toLowerCase() === "active",
      )
      .map((r) => ({
        relationship: r,
        business: state.businesses.find((b) => b.business_id === r.business_id),
      }));
    const marketProfessionals = state.employees
      .filter((e) => e.listed)
      .map((e) => ({
        ...e,
        business_name:
          state.businesses.find((b) => b.business_id === e.business_id)?.business_name ?? "",
      }));
    const marketBusinesses = state.businesses.filter((b) => b.listed);
    const businessRequests = allow("approve_requests")
      ? state.requests.filter((r) =>
          allow("manage_all_businesses") ? true : r.business_id === bid,
        )
      : state.requests.filter((r) => r.user_id === currentUser.user_id);

    const myRequests = state.requests.filter((r) => r.user_id === currentUser.user_id);
    const myTabs = state.customers.filter(
      (c) =>
        c.user_id === currentUser.user_id &&
        state.relationships.some(
          (r) =>
            r.user_id === currentUser.user_id &&
            r.business_id === c.business_id &&
            r.relationship_type === "customer" &&
            r.status.toLowerCase() === "active",
        ),
    );
    const myCustomerJobs = state.jobs.filter((j) =>
      myTabs.some((t) => t.customer_id === j.customer_id),
    );
    const myCustomerSales = state.sales.filter((s) =>
      myTabs.some((t) => t.customer_id === s.customer_id),
    );

    const scopedBusinessIds = visibleBusinesses.map((b) => b.business_id);
    const allCustomers = allow("view_collections")
      ? state.customers.filter((c) =>
          allow("manage_all_businesses") ? true : scopedBusinessIds.includes(c.business_id),
        )
      : myTabs;

    const totalAssetValue = myAssets.reduce((sum, a) => sum + Number(a.value || 0), 0);
    const liabilities = Number(state.liabilities[currentUser.user_id] || 0);

    const totalOutstanding = allCustomers.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalOverdue = allCustomers
      .filter((c) => c.status === "Overdue")
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);

    const chargeOpts = (customer: Customer) => ({
      customer,
      user: currentUser,
      isBusinessOwner: isBusinessOwner(customer.business_id),
    });

    return {
      state,
      publicMarketplace,
      refreshPublicMarketplace,
      currentUser,
      workspace,
      selectedBusiness,
      visibleBusinesses,
      myAssets,
      marketplace,
      businessCustomers,
      businessEmployees,
      businessSales,
      businessRequests,
      businessProducts,
      businessGoods,
      businessServices,
      businessCategories,
      businessSpecDefs,
      businessVariants,
      businessExpenses,
      businessJobs,
      myJobs,
      businessQuotes,
      businessInvoices,
      myIncome,
      mySaccos,
      myOffers,
      myConnections,
      myCustomerJobs,
      myCustomerSales,
      marketProfessionals,
      marketBusinesses,
      myRequests,
      myTabs,
      allCustomers,
      employment: activeEmployment(state.relationships, currentUser.user_id),
      totalAssetValue,
      liabilities,
      netWorth: totalAssetValue - liabilities,
      totalOutstanding,
      totalOverdue,
      can: allow,
      isBusinessOwner,
      ledgerFor: (customerId) =>
        state.ledger
          .filter((e) => e.customer_id === customerId)
          .slice()
          .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
      canCharge: (customer) => canPostCharge(chargeOpts(customer)),
      canPay: (customer) => canRecordPayment(chargeOpts(customer)),
      setSelectedBusinessId: (id) => {
        setState((prev) => ({ ...prev, selectedBusinessId: id }));
      },
      acceptOffer: async (offerId) => {
        const response = await fetch("/api/relationships/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ offerId, decision: "accepted" }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to accept offer");
        if (payload.state) setState(removeLegacyDemoData(payload.state as LifeState));
      },
      declineOffer: async (offerId) => {
        const response = await fetch("/api/relationships/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ offerId, decision: "declined" }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to decline offer");
        if (payload.state) setState(removeLegacyDemoData(payload.state as LifeState));
      },
      updateBusiness: (businessId, patch) => {
        setState((prev) => ({ ...prev, businesses: prev.businesses.map((b) => b.business_id === businessId ? { ...b, ...patch } : b) }));
      },
      deleteBusiness: (businessId) => {
        setState((prev) => {
          if (!prev.businesses.some((b) => b.business_id === businessId && b.owner_user_id === prev.currentUserId)) return prev;
          const businessIds = new Set([businessId]);
          return {
            ...prev,
            businesses: prev.businesses.filter((b) => !businessIds.has(b.business_id)),
            relationships: prev.relationships.filter((r) => r.business_id !== businessId),
            customers: prev.customers.filter((c) => c.business_id !== businessId),
            employees: prev.employees.filter((e) => e.business_id !== businessId),
            assets: prev.assets.filter((a) => a.business_id !== businessId),
            sales: prev.sales.filter((x) => x.business_id !== businessId),
            expenses: prev.expenses.filter((x) => x.business_id !== businessId),
            requests: prev.requests.filter((x) => x.business_id !== businessId),
            products: prev.products.filter((x) => x.business_id !== businessId),
            product_categories: (prev.product_categories || []).filter((x) => x.business_id !== businessId),
            product_specs: (prev.product_specs || []).filter((x) => x.business_id !== businessId),
            product_variants: (prev.product_variants || []).filter((x) => x.business_id !== businessId),
            jobs: prev.jobs.filter((x) => x.business_id !== businessId),
            quotations: prev.quotations.filter((x) => x.business_id !== businessId),
            invoices: prev.invoices.filter((x) => x.business_id !== businessId),
            selectedBusinessId: prev.selectedBusinessId === businessId ? "" : prev.selectedBusinessId,
          };
        });
      },
      updateCustomer: (customerId, patch) => {
        setState((prev) => ({ ...prev, customers: prev.customers.map((c) => c.customer_id === customerId ? { ...c, ...patch } : c) }));
      },
      deleteCustomer: (customerId) => {
        setState((prev) => ({ ...prev, customers: prev.customers.filter((c) => c.customer_id !== customerId), ledger: prev.ledger.filter((x) => x.customer_id !== customerId) }));
      },
      updateEmployee: (employeeId, patch) => {
        setState((prev) => ({ ...prev, employees: prev.employees.map((e) => e.employee_id === employeeId ? { ...e, ...patch } : e) }));
      },
      deleteEmployee: (employeeId) => {
        setState((prev) => ({ ...prev, employees: prev.employees.filter((e) => e.employee_id !== employeeId), jobs: prev.jobs.filter((j) => j.employee_id !== employeeId) }));
      },
      updateSale: (saleId, patch) => {
        setState((prev) => ({ ...prev, sales: prev.sales.map((x) => x.sale_id === saleId ? { ...x, ...patch } : x) }));
      },
      deleteSale: (saleId) => {
        setState((prev) => ({ ...prev, sales: prev.sales.filter((x) => x.sale_id !== saleId) }));
      },
      updateProduct: (productId, patch) => {
        setState((prev) => ({ ...prev, products: prev.products.map((p) => p.product_id === productId ? { ...p, ...patch } : p) }));
      },
      deleteProduct: (productId) => {
        setState((prev) => ({
          ...prev,
          products: prev.products.filter((p) => p.product_id !== productId),
          product_variants: (prev.product_variants || []).filter((v) => v.product_id !== productId),
        }));
      },
      addBusiness: async (form) => {
        const business_id = uid("BUS");
        const nextState: LifeState = {
          ...state,
          selectedBusinessId: business_id,
          businesses: [
            ...state.businesses,
            {
              business_id,
              owner_user_id: state.currentUserId,
              business_name: form.name,
              business_type: form.type,
              phone: form.phone || "",
              email: form.email || "",
              region: form.region,
              status: form.status || "open",
              listed: Boolean(form.listed),
              tagline: form.tagline || "",
              views: 0,
              whatsapp_clicks: 0,
              image_url: "",
              gallery: [],
            },
          ],
          relationships: [
            ...state.relationships,
            {
              relationship_id: uid("REL"),
              user_id: state.currentUserId,
              business_id,
              relationship_type: "owner",
              role: "Owner",
              job_status: "Active",
              status: "active",
            },
          ],
        };
        setState(nextState);
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ state: nextState }),
        });
        if (!response.ok) throw new Error("Unable to save business");
        return business_id;
      },
      uploadBusinessMedia: async (businessId, files) => {
        for (const file of files) {
          const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: file.name, dataUrl: file.dataUrl }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Unable to upload business media");
          const media = payload.media as MediaItem;
          setState((prev) => ({
            ...prev,
            businesses: prev.businesses.map((b) => {
              if (b.business_id !== businessId) return b;
              const gallery = Array.isArray(b.gallery) ? b.gallery : [];
              return {
                ...b,
                image_url: b.image_url || (media.media_type === "image" ? media.url : b.image_url),
                gallery: [...gallery, media],
              };
            }),
          }));
        }
      },
      reorderBusinessMedia: async (businessId, order) => {
        const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/media-order`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ order }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to reorder photos");
        setState((prev) => ({
          ...prev,
          businesses: prev.businesses.map((b) =>
            b.business_id === businessId ? { ...b, gallery: payload.gallery, image_url: payload.image_url } : b,
          ),
        }));
      },
      removeBusinessMedia: async (businessId, mediaId) => {
        const response = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/media/${encodeURIComponent(mediaId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to remove business media");
        setState((prev) => ({
          ...prev,
          businesses: prev.businesses.map((b) =>
            b.business_id === businessId
              ? { ...b, image_url: payload.image_url ?? b.image_url, gallery: (b.gallery || []).filter((media) => media.media_id !== mediaId) }
              : b,
          ),
        }));
      },
      uploadAssetMedia: async (assetId, files) => {
        for (const file of files) {
          const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: file.name, dataUrl: file.dataUrl }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Unable to upload asset media");
          const media = payload.media as MediaItem;
          setState((prev) => ({
            ...prev,
            assets: prev.assets.map((a) => {
              if (a.asset_id !== assetId) return a;
              const gallery = Array.isArray(a.gallery) ? a.gallery : [];
              return {
                ...a,
                image_url: a.image_url || (media.media_type === "image" ? media.url : a.image_url),
                gallery: [...gallery, media],
              };
            }),
          }));
        }
      },
      removeAssetMedia: async (assetId, mediaId) => {
        const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}/media/${encodeURIComponent(mediaId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to remove asset media");
        setState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            a.asset_id === assetId
              ? { ...a, image_url: payload.image_url ?? a.image_url, gallery: (a.gallery || []).filter((media) => media.media_id !== mediaId) }
              : a,
          ),
        }));
      },
      addCustomer: async (form) => {
        const opening = Number(form.amount || 0);
        const customer_id = uid("CUS");
        const email = form.email.trim();
        let users = state.users;
        let relationships = state.relationships;
        let offers = state.offers;
        let userId = "";

        if (email) {
          const businessName =
            state.businesses.find((b) => b.business_id === state.selectedBusinessId)
              ?.business_name ?? "A business";
          const relationship_id = uid("REL");
          const relationship: Relationship = {
            relationship_id,
            user_id: "",
            business_id: state.selectedBusinessId,
            relationship_type: "customer",
            role: "Customer",
            job_status: "Active",
            status: "pending",
          };
          const offer: Offer = {
            offer_id: uid("OFR"),
            user_id: "",
            title: `Customer tab with ${businessName}`,
            from: businessName,
            amount: opening,
            status: "Open",
            kind: "customer",
            business_id: state.selectedBusinessId,
            relationship_id,
          };

          let linkedUserId = "";
          try {
            const inviteResponse = await fetch("/api/relationships/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ targetEmail: email, relationship, offer }),
            });
            if (inviteResponse.ok) {
              const payload = await inviteResponse.json();
              if (payload.linked) linkedUserId = payload.userId;
            }
          } catch {
            // Offline or the invite endpoint failed — fall back to a local-only placeholder below.
          }

          const existing = state.users.find(
            (u) => u.email.toLowerCase() === email.toLowerCase(),
          );
          // Only create a cross-account relationship when the email belongs to
          // a real LifeBoost account. The server writes the invitation directly
          // into that account's private user_state row.
          userId = linkedUserId || existing?.user_id || "";
          if (linkedUserId) {
            const hasRel = relationships.some(
              (r) =>
                r.user_id === linkedUserId &&
                r.business_id === state.selectedBusinessId &&
                r.relationship_type === "customer",
            );
            if (!hasRel) {
              relationships = [...relationships, { ...relationship, user_id: linkedUserId }];
              offers = [...offers, { ...offer, user_id: linkedUserId }];
            }
          } else if (existing?.user_id) {
            userId = existing.user_id;
          }
        }
        const ledger = [...state.ledger];
        if (opening > 0) {
          ledger.unshift({
            entry_id: uid("LED"),
            business_id: state.selectedBusinessId,
            customer_id,
            type: "charge",
            amount: opening,
            description: "Opening balance",
            product_id: "",
            qty: 0,
            posted_by: state.currentUserId,
            date: new Date().toISOString(),
          });
        }
        setState((prev) => ({
            ...prev,
            users,
            relationships,
            offers,
            ledger,
            customers: [
              ...prev.customers,
              {
                customer_id,
                business_id: prev.selectedBusinessId,
                name: form.name,
                phone: form.phone,
                email: form.email,
                amount: opening,
                due_date: form.due,
                type: form.type || "individual",
                status: dueStatus(form.due, opening),
                user_id: userId,
                charge_mode: form.charge_mode || "owner",
              },
            ],
        }));
      },
      addEmployee: async (form) => {
        const employee_id = uid("EMP");
        let userId = "";
        let users = state.users;
        let relationships = state.relationships;
        let offers = state.offers;

        if (form.email) {
          const email = form.email.trim().toLowerCase();
          const businessName =
            state.businesses.find((b) => b.business_id === state.selectedBusinessId)
              ?.business_name ?? "A business";
          const relationship_id = uid("REL");
          const relationship: Relationship = {
            relationship_id,
            user_id: "",
            business_id: state.selectedBusinessId,
            relationship_type: "employee",
            role: form.role,
            job_status: form.jobStatus,
            status: "pending",
          };
          const offer: Offer = {
            offer_id: uid("OFR"),
            user_id: "",
            title: `Employment offer: ${form.role} at ${businessName}`,
            from: businessName,
            amount: 0,
            status: "Open",
            kind: "employment",
            business_id: state.selectedBusinessId,
            relationship_id,
            role: form.role,
          };

          let linkedUserId = "";
          try {
            const inviteResponse = await fetch("/api/relationships/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ targetEmail: email, relationship, offer }),
            });
            if (inviteResponse.ok) {
              const payload = await inviteResponse.json();
              if (payload.linked) linkedUserId = payload.userId;
            }
          } catch {
            // Offline or the invite endpoint failed — fall back to a local-only placeholder below.
          }

          const existing = state.users.find(
            (u) => u.email.toLowerCase() === email,
          );
          // Do not invent a user id when the email is not a registered
          // LifeBoost account. A real account is linked by the server endpoint.
          userId = linkedUserId || existing?.user_id || "";
          if (linkedUserId) {
            const hasRel = relationships.some(
              (r) =>
                r.user_id === linkedUserId &&
                r.business_id === state.selectedBusinessId &&
                r.relationship_type === "employee",
            );
            if (!hasRel) {
              relationships = [...relationships, { ...relationship, user_id: linkedUserId }];
              offers = [...offers, { ...offer, user_id: linkedUserId }];
            }
          } else if (existing?.user_id) {
            userId = existing.user_id;
          }
        }

        const nextState: LifeState = {
          ...state,
          users,
          relationships,
          offers,
          employees: [
            ...state.employees,
            {
              employee_id,
              business_id: state.selectedBusinessId,
              name: form.name,
              phone: form.phone,
              email: form.email,
              role: form.role,
              job_status: form.jobStatus,
              salary: 0,
              status: "active",
              user_id: userId,
              listed: form.listed,
              location: form.location || "",
              views: 0,
              whatsapp_clicks: 0,
            },
          ],
        };

        setState(nextState);
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ state: nextState }),
        });
        if (!response.ok) throw new Error("Unable to save employee");
      },
      addSale: (form) => {
        setState((prev) => ({
          ...prev,
          sales: [
            {
              sale_id: uid("SAL"),
              business_id: prev.selectedBusinessId,
              customer_id: "",
              customer_name: form.customer || "Walk-in",
              date: new Date().toISOString(),
              subtotal: Number(form.total || 0),
              discount: 0,
              tax: 0,
              total: Number(form.total || 0),
              status: form.status || "Completed",
            },
            ...prev.sales,
          ],
        }));
      },
      addRequest: (form) => {
        setState((prev) => ({
          ...prev,
          requests: [
            {
              request_id: uid("REQ"),
              business_id: prev.selectedBusinessId,
              user_id: prev.currentUserId,
              type: form.type,
              amount: Number(form.amount || 0),
              reason: form.reason,
              request_date: new Date().toISOString(),
              status: "Pending",
              pictures: [],
            },
            ...prev.requests,
          ],
        }));
      },
      decideRequest: (requestId, status) => {
        setState((prev) => ({
          ...prev,
          requests: prev.requests.map((r) =>
            r.request_id === requestId ? { ...r, status } : r,
          ),
        }));
      },
      addAsset: async (form) => {
        const asset_id = uid("AST");
        const nextState: LifeState = {
          ...state,
          assets: [
            {
              asset_id,
              user_id: state.currentUserId,
              business_id: form.ownership === "business" ? state.selectedBusinessId : "",
              name: form.name,
              type: form.type,
              value: Number(form.value || 0),
              listed: form.listed,
              listing_type: form.listingType || "For sale",
              location: form.location,
              phone: form.phone,
              views: 0,
              whatsapp_clicks: 0,
              created_date: new Date().toISOString(),
              status: "active",
              notes: form.notes || "",
              image_url: "",
              gallery: [],
            },
            ...state.assets,
          ],
        };
        setState(nextState);
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ state: nextState }),
        });
        if (!response.ok) throw new Error("Unable to save asset");
        return asset_id;
      },
      updateAsset: (assetId: string, patch: Partial<{
        name: string;
        type: string;
        value: number;
        business_id: string;
        listed: boolean;
        listing_type: "For sale" | "For hire";
        location: string;
        phone: string;
        notes: string;
        status: string;
      }>) => {
        setState((prev) => {
          const canEdit = (a: { user_id: string; business_id: string }) =>
            a.user_id === prev.currentUserId ||
            prev.businesses.some(
              (b) => b.business_id === a.business_id && b.owner_user_id === prev.currentUserId,
            );
          return {
            ...prev,
            assets: prev.assets.map((a) =>
              a.asset_id === assetId && canEdit(a) ? { ...a, ...patch } : a,
            ),
          };
        });
      },
      deleteAsset: (assetId: string) => {
        setState((prev) => {
          const canEdit = (a: { user_id: string; business_id: string }) =>
            a.user_id === prev.currentUserId ||
            prev.businesses.some(
              (b) => b.business_id === a.business_id && b.owner_user_id === prev.currentUserId,
            );
          return {
            ...prev,
            assets: prev.assets.filter((a) => !(a.asset_id === assetId && canEdit(a))),
          };
        });
      },
      bulkUpdateAssets: (
        assetIds: string[],
        patch: Partial<{
          listed: boolean;
          listing_type: "For sale" | "For hire";
          status: string;
        }>,
      ) => {
        const idSet = new Set(assetIds);
        setState((prev) => {
          const canEdit = (a: { user_id: string; business_id: string }) =>
            a.user_id === prev.currentUserId ||
            prev.businesses.some(
              (b) => b.business_id === a.business_id && b.owner_user_id === prev.currentUserId,
            );
          return {
            ...prev,
            assets: prev.assets.map((a) =>
              idSet.has(a.asset_id) && canEdit(a) ? { ...a, ...patch } : a,
            ),
          };
        });
      },
      bulkDeleteAssets: (assetIds: string[]) => {
        const idSet = new Set(assetIds);
        setState((prev) => {
          const canEdit = (a: { user_id: string; business_id: string }) =>
            a.user_id === prev.currentUserId ||
            prev.businesses.some(
              (b) => b.business_id === a.business_id && b.owner_user_id === prev.currentUserId,
            );
          return {
            ...prev,
            assets: prev.assets.filter((a) => !(idSet.has(a.asset_id) && canEdit(a))),
          };
        });
      },
      addProduct: (form: {
        name: string;
        category: string;
        categoryId?: string;
        unit: string;
        sellingPrice: string;
        costPrice: string;
        stock: string;
        sku?: string;
        description?: string;
        specs?: SpecValues;
        itemKind?: "product" | "service";
      }) => {
        setState((prev) => ({
          ...prev,
          products: [
            ...prev.products,
            {
              product_id: uid("PRD"),
              business_id: prev.selectedBusinessId,
              name: form.name,
              item_kind: form.itemKind === "service" ? "service" : "product",
              category: form.category,
              category_id: form.categoryId || "",
              unit: form.unit || (form.itemKind === "service" ? "job" : "unit"),
              selling_price: Number(form.sellingPrice || 0),
              cost_price: Number(form.costPrice || 0),
              stock: form.itemKind === "service" ? 0 : Number(form.stock || 0),
              status: "active",
              listed: true, // always available for quotations
              sku: form.sku || "",
              description: form.description || "",
              specs: form.specs || {},
              image_url: "",
              gallery: [],
            },
          ],
        }));
      },
      /** Bulk-add products from CSV/Excel import (same business). */
      importProducts: (
        rows: {
          name: string;
          category?: string;
          categoryId?: string;
          unit?: string;
          sellingPrice?: string | number;
          costPrice?: string | number;
          stock?: string | number;
          sku?: string;
          description?: string;
          specs?: Record<string, string | number>;
          itemKind?: "product" | "service";
        }[],
        defaultKind: "product" | "service" = "product",
      ) => {
        if (!rows.length) return 0;
        let added = 0;
        setState((prev) => {
          const bid = prev.selectedBusinessId;
          if (!bid) return prev;
          const next = rows
            .map((form) => {
              const kind =
                form.itemKind === "service" || form.itemKind === "product"
                  ? form.itemKind
                  : defaultKind;
              const name = String(form.name || "").trim();
              if (!name) return null;
              added += 1;
              return {
                product_id: uid("PRD"),
                business_id: bid,
                name,
                item_kind: kind,
                category: form.category || "",
                category_id: form.categoryId || "",
                unit: form.unit || (kind === "service" ? "job" : "unit"),
                selling_price: Number(form.sellingPrice || 0),
                cost_price: Number(form.costPrice || 0),
                stock: kind === "service" ? 0 : Number(form.stock || 0),
                status: "active" as const,
                listed: true,
                sku: form.sku || "",
                description: form.description || "",
                specs: form.specs || {},
                image_url: "",
                gallery: [],
              };
            })
            .filter(Boolean) as typeof prev.products;
          return {
            ...prev,
            products: [...prev.products, ...next],
          };
        });
        return added || rows.length;
      },
      uploadProductMedia: async (productId: string, files: { name: string; media_type: string; dataUrl: string }[]) => {
        for (const file of files) {
          const response = await fetch(`/api/products/${encodeURIComponent(productId)}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: file.name, dataUrl: file.dataUrl }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Unable to upload product media");
          setState((prev) => ({
            ...prev,
            products: prev.products.map((p) => {
              if (p.product_id !== productId) return p;
              const media = payload.media;
              const gallery = Array.isArray(p.gallery) ? p.gallery : [];
              return {
                ...p,
                image_url: p.image_url || (media.media_type === "image" ? media.url : p.image_url),
                gallery: [...gallery, media],
              };
            }),
          }));
        }
      },
      removeProductMedia: async (productId: string, mediaId: string) => {
        const response = await fetch(
          `/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`,
          { method: "DELETE", credentials: "include" },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to remove product media");
        setState((prev) => ({
          ...prev,
          products: prev.products.map((p) =>
            p.product_id === productId
              ? {
                  ...p,
                  image_url: payload.image_url ?? p.image_url,
                  gallery: (p.gallery || []).filter((m) => m.media_id !== mediaId),
                }
              : p,
          ),
        }));
      },
      reorderProductMedia: async (productId: string, order: string[]) => {
        setState((prev) => ({
          ...prev,
          products: prev.products.map((p) => {
            if (p.product_id !== productId) return p;
            const gallery = Array.isArray(p.gallery) ? p.gallery : [];
            const byId = new Map(gallery.map((m) => [m.media_id, m]));
            const nextGallery = order.map((id) => byId.get(id)).filter(Boolean) as typeof gallery;
            for (const m of gallery) {
              if (!order.includes(m.media_id)) nextGallery.push(m);
            }
            const cover = nextGallery.find((m) => m.media_type === "image");
            return { ...p, gallery: nextGallery, image_url: cover?.url || "" };
          }),
        }));
      },
      addProductCategory: (form: { name: string; description?: string; unitDefault?: string }) => {
        const category_id = uid("CAT");
        setState((prev) => ({
          ...prev,
          product_categories: [
            ...(prev.product_categories || []),
            {
              category_id,
              business_id: prev.selectedBusinessId,
              name: form.name.trim(),
              description: form.description || "",
              unit_default: form.unitDefault || "unit",
            },
          ],
        }));
        return category_id;
      },
      updateProductCategory: (categoryId: string, patch: Partial<ProductCategory>) => {
        setState((prev) => ({
          ...prev,
          product_categories: (prev.product_categories || []).map((c) =>
            c.category_id === categoryId && c.business_id === prev.selectedBusinessId
              ? { ...c, ...patch }
              : c,
          ),
        }));
      },
      deleteProductCategory: (categoryId: string) => {
        setState((prev) => ({
          ...prev,
          product_categories: (prev.product_categories || []).filter(
            (c) => !(c.category_id === categoryId && c.business_id === prev.selectedBusinessId),
          ),
          product_specs: (prev.product_specs || []).filter((s) => s.category_id !== categoryId),
          products: prev.products.map((p) =>
            p.category_id === categoryId ? { ...p, category_id: "" } : p,
          ),
        }));
      },
      addSpecDefinition: (form: {
        categoryId: string;
        key: string;
        label: string;
        unit: string;
        dataType?: "number" | "text";
      }) => {
        const key =
          form.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") ||
          form.label
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
        setState((prev) => {
          const existing = (prev.product_specs || []).filter((s) => s.category_id === form.categoryId);
          return {
            ...prev,
            product_specs: [
              ...(prev.product_specs || []),
              {
                spec_id: uid("SPC"),
                category_id: form.categoryId,
                business_id: prev.selectedBusinessId,
                key,
                label: form.label.trim(),
                unit: form.unit.trim(),
                data_type: form.dataType || "number",
                sort_order: existing.length,
              },
            ],
          };
        });
      },
      updateSpecDefinition: (specId: string, patch: Partial<SpecDefinition>) => {
        setState((prev) => ({
          ...prev,
          product_specs: (prev.product_specs || []).map((s) =>
            s.spec_id === specId && s.business_id === prev.selectedBusinessId ? { ...s, ...patch } : s,
          ),
        }));
      },
      deleteSpecDefinition: (specId: string) => {
        setState((prev) => ({
          ...prev,
          product_specs: (prev.product_specs || []).filter((s) => s.spec_id !== specId),
        }));
      },
      /** Move a specification column left/right in the catalogue table (changes sort_order). */
      reorderSpecDefinition: (specId: string, direction: -1 | 1) => {
        setState((prev) => {
          const all = [...(prev.product_specs || [])];
          const target = all.find((s) => s.spec_id === specId);
          if (!target || target.business_id !== prev.selectedBusinessId) return prev;
          const group = all
            .filter((s) => s.category_id === target.category_id)
            .sort((a, b) => a.sort_order - b.sort_order);
          const index = group.findIndex((s) => s.spec_id === specId);
          const swapWith = index + direction;
          if (index < 0 || swapWith < 0 || swapWith >= group.length) return prev;
          const a = group[index];
          const b = group[swapWith];
          const orderA = a.sort_order;
          const orderB = b.sort_order;
          return {
            ...prev,
            product_specs: all.map((s) => {
              if (s.spec_id === a.spec_id) return { ...s, sort_order: orderB };
              if (s.spec_id === b.spec_id) return { ...s, sort_order: orderA };
              return s;
            }),
          };
        });
      },
      /** Set absolute column positions for a category (array of spec_ids in display order). */
      setSpecColumnOrder: (categoryId: string, orderedSpecIds: string[]) => {
        setState((prev) => {
          const idSet = new Set(orderedSpecIds);
          return {
            ...prev,
            product_specs: (prev.product_specs || []).map((s) => {
              if (s.category_id !== categoryId || s.business_id !== prev.selectedBusinessId) return s;
              const idx = orderedSpecIds.indexOf(s.spec_id);
              if (idx < 0) return s;
              return { ...s, sort_order: idx };
            }).map((s, _i, arr) => {
              // keep non-listed specs after ordered ones
              if (s.category_id !== categoryId || idSet.has(s.spec_id)) return s;
              return s;
            }),
          };
        });
      },
      /**
       * Apply an industry table style to a category (columns differ by trade).
       * e.g. steel_chs → NB, OD, wall, kg/m, MPa; restaurant → portion, allergens, …
       */
      applyCatalogueTemplate: (categoryId: string, templateId: string) => {
        setState((prev) => {
          const template = getCatalogueTemplate(templateId);
          if (!template || template.fields.length === 0) return prev;
          const existingKeys = new Set(
            (prev.product_specs || [])
              .filter((s) => s.category_id === categoryId)
              .map((s) => s.key),
          );
          const startOrder = (prev.product_specs || []).filter((s) => s.category_id === categoryId).length;
          const defs: SpecDefinition[] = template.fields
            .filter((f) => !existingKeys.has(f.key))
            .map((d, i) => ({
              spec_id: uid("SPC"),
              category_id: categoryId,
              business_id: prev.selectedBusinessId,
              key: d.key,
              label: d.label,
              unit: d.unit,
              data_type: d.data_type,
              sort_order: startOrder + i,
            }));
          if (defs.length === 0) return prev;
          return {
            ...prev,
            product_specs: [...(prev.product_specs || []), ...defs],
            product_categories: (prev.product_categories || []).map((c) =>
              c.category_id === categoryId
                ? { ...c, unit_default: c.unit_default || template.unit_default }
                : c,
            ),
          };
        });
      },
      /** @deprecated prefer applyCatalogueTemplate(id, 'steel_chs') */
      applySteelChsTemplate: (categoryId: string) => {
        setState((prev) => {
          const template = getCatalogueTemplate("steel_chs");
          if (!template) return prev;
          const already = (prev.product_specs || []).some((s) => s.category_id === categoryId);
          if (already) return prev;
          const defs: SpecDefinition[] = template.fields.map((d, i) => ({
            spec_id: uid("SPC"),
            category_id: categoryId,
            business_id: prev.selectedBusinessId,
            key: d.key,
            label: d.label,
            unit: d.unit,
            data_type: d.data_type,
            sort_order: i,
          }));
          return {
            ...prev,
            product_specs: [...(prev.product_specs || []), ...defs],
          };
        });
      },
      addProductVariant: (form: {
        productId: string;
        name: string;
        sku?: string;
        sellingPrice: string;
        costPrice?: string;
        stock?: string;
        specs?: SpecValues;
      }) => {
        setState((prev) => ({
          ...prev,
          product_variants: [
            ...(prev.product_variants || []),
            {
              variant_id: uid("VAR"),
              product_id: form.productId,
              business_id: prev.selectedBusinessId,
              name: form.name.trim(),
              sku: form.sku || "",
              selling_price: Number(form.sellingPrice || 0),
              cost_price: Number(form.costPrice || 0),
              stock: Number(form.stock || 0),
              specs: form.specs || {},
              status: "active",
            },
          ],
        }));
      },
      updateProductVariant: (variantId: string, patch: Partial<ProductVariant>) => {
        setState((prev) => ({
          ...prev,
          product_variants: (prev.product_variants || []).map((v) =>
            v.variant_id === variantId && v.business_id === prev.selectedBusinessId
              ? { ...v, ...patch }
              : v,
          ),
        }));
      },
      deleteProductVariant: (variantId: string) => {
        setState((prev) => ({
          ...prev,
          product_variants: (prev.product_variants || []).filter((v) => v.variant_id !== variantId),
        }));
      },
      addExpense: (form) => {
        setState((prev) => ({
          ...prev,
          expenses: [
            {
              expense_id: uid("EXP"),
              business_id: prev.selectedBusinessId,
              category: form.category,
              description: form.description,
              amount: Number(form.amount || 0),
              date: new Date().toISOString(),
            },
            ...prev.expenses,
          ],
        }));
      },
      addJob: (form) => {
        setState((prev) => ({
          ...prev,
          jobs: [
            {
              job_id: uid("JOB"),
              business_id: prev.selectedBusinessId,
              employee_id: form.employeeId,
              customer_id: "",
              title: form.title,
              description: form.description,
              start_date: form.startDate,
              due_date: form.dueDate,
              estimated_cost: Number(form.estimatedCost || 0),
              status: form.status || "Not started",
            },
            ...prev.jobs,
          ],
        }));
      },
      updateJobStatus: (jobId, status) => {
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) => (j.job_id === jobId ? { ...j, status } : j)),
        }));
      },
      addQuotation: (form) => {
        setState((prev) => {
          const customer = prev.customers.find((c) => c.customer_id === form.customerId);
          const pricingBusiness = form.pricingBusinessId
            ? prev.businesses.find((b) => b.business_id === form.pricingBusinessId)
            : undefined;
          const lineItemsTotal = (form.lineItems || []).reduce((s, li) => s + Number(li.amount || 0), 0);
          return {
            ...prev,
            quotations: [
              {
                quote_id: uid("QTE"),
                business_id: prev.selectedBusinessId,
                customer_id: form.customerId,
                customer_name: customer?.name ?? "Customer",
                total: form.lineItems?.length ? lineItemsTotal : Number(form.total || 0),
                status: "Sent",
                date: new Date().toISOString(),
                notes: form.notes,
                quote_type: form.quoteType || "general",
                pricing_business_id: form.pricingBusinessId,
                pricing_business_name: pricingBusiness?.business_name,
                line_items: form.lineItems,
              },
              ...prev.quotations,
            ],
          };
        });
      },
      addInvoice: (form) => {
        setState((prev) => {
          const customer = prev.customers.find((c) => c.customer_id === form.customerId);
          return {
            ...prev,
            invoices: [
              {
                invoice_id: uid("INV"),
                business_id: prev.selectedBusinessId,
                customer_id: form.customerId,
                customer_name: customer?.name ?? "Customer",
                invoice_date: new Date().toISOString(),
                due_date: form.due,
                total: Number(form.total || 0),
                paid: 0,
                status: "Unpaid",
              },
              ...prev.invoices,
            ],
          };
        });
      },
      recordInvoicePayment: (invoiceId, amount) => {
        const pay = Number(amount || 0);
        if (pay <= 0) return;
        setState((prev) => ({
          ...prev,
          invoices: prev.invoices.map((inv) => {
            if (inv.invoice_id !== invoiceId) return inv;
            const paid = Math.min(inv.total, inv.paid + pay);
            const status: InvoiceStatus = paid >= inv.total ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
            return { ...inv, paid, status };
          }),
        }));
      },
      uploadRequestPictures: (requestId, pictures) => {
        setState((prev) => ({
          ...prev,
          requests: prev.requests.map((r) =>
            r.request_id === requestId
              ? { ...r, pictures: [...(r.pictures || []), ...pictures].slice(0, 8) }
              : r,
          ),
        }));
      },
      addCustomerCharge: (form) => {
        const amountIn = Number(form.amount || 0);
        const qty = Number(form.qty || 0);
        setState((prev) => {
          const customer = prev.customers.find((c) => c.customer_id === form.customerId);
          const user = prev.users.find((u) => u.user_id === prev.currentUserId);
          if (!customer || !user) return prev;
          const owner = prev.businesses.some(
            (b) =>
              b.business_id === customer.business_id &&
              (b.owner_user_id === user.user_id || user.account_level === "admin"),
          );
          if (!canPostCharge({ customer, user, isBusinessOwner: owner })) return prev;
          const product = form.productId
            ? prev.products.find((p) => p.product_id === form.productId)
            : undefined;
          const qtyUsed = product ? Math.max(1, qty || 1) : 0;
          const amount = product ? product.selling_price * qtyUsed : amountIn;
          if (amount <= 0) return prev;
          const description =
            form.description ||
            (product ? `${qtyUsed} × ${product.name}` : "Product taken on credit");
          const nextAmount = customer.amount + amount;
          return {
            ...prev,
            products: product
              ? prev.products.map((p) =>
                  p.product_id === product.product_id
                    ? { ...p, stock: Math.max(0, p.stock - qtyUsed) }
                    : p,
                )
              : prev.products,
            customers: prev.customers.map((c) =>
              c.customer_id === customer.customer_id
                ? { ...c, amount: nextAmount, status: dueStatus(c.due_date, nextAmount) }
                : c,
            ),
            ledger: [
              {
                entry_id: uid("LED"),
                business_id: customer.business_id,
                customer_id: customer.customer_id,
                type: "charge",
                amount,
                description,
                product_id: product?.product_id ?? "",
                qty: qtyUsed,
                posted_by: prev.currentUserId,
                date: new Date().toISOString(),
              },
              ...prev.ledger,
            ],
            sales: [
              {
                sale_id: uid("SAL"),
                business_id: customer.business_id,
                customer_id: customer.customer_id,
                customer_name: customer.name,
                date: new Date().toISOString(),
                subtotal: amount,
                discount: 0,
                tax: 0,
                total: amount,
                status: "On tab",
              },
              ...prev.sales,
            ],
          };
        });
      },
      recordCustomerPayment: (form) => {
        const amount = Number(form.amount || 0);
        if (amount <= 0) return;
        setState((prev) => {
          const customer = prev.customers.find((c) => c.customer_id === form.customerId);
          const user = prev.users.find((u) => u.user_id === prev.currentUserId);
          if (!customer || !user) return prev;
          const owner = prev.businesses.some(
            (b) =>
              b.business_id === customer.business_id &&
              (b.owner_user_id === user.user_id || user.account_level === "admin"),
          );
          if (!canRecordPayment({ customer, user, isBusinessOwner: owner })) return prev;
          const nextAmount = Math.max(0, customer.amount - amount);
          return {
            ...prev,
            customers: prev.customers.map((c) =>
              c.customer_id === customer.customer_id
                ? { ...c, amount: nextAmount, status: dueStatus(c.due_date, nextAmount) }
                : c,
            ),
            ledger: [
              {
                entry_id: uid("LED"),
                business_id: customer.business_id,
                customer_id: customer.customer_id,
                type: "payment",
                amount,
                description: form.description || "Payment received",
                product_id: "",
                qty: 0,
                posted_by: prev.currentUserId,
                date: new Date().toISOString(),
              },
              ...prev.ledger,
            ],
          };
        });
      },
      setChargeMode: (customerId, mode) => {
        setState((prev) => ({
          ...prev,
          customers: prev.customers.map((c) =>
            c.customer_id === customerId ? { ...c, charge_mode: mode } : c,
          ),
        }));
      },
      viewAsset: (assetId) => {
        setState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            a.asset_id === assetId ? { ...a, views: Number(a.views || 0) + 1 } : a,
          ),
        }));
      },
      contactAsset: (assetId) => {
        setState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            a.asset_id === assetId
              ? { ...a, whatsapp_clicks: Number(a.whatsapp_clicks || 0) + 1 }
              : a,
          ),
        }));
      },
      viewProfessional: (employeeId) => {
        setState((prev) => ({
          ...prev,
          employees: prev.employees.map((e) =>
            e.employee_id === employeeId ? { ...e, views: Number(e.views || 0) + 1 } : e,
          ),
        }));
      },
      contactProfessional: (employeeId) => {
        setState((prev) => ({
          ...prev,
          employees: prev.employees.map((e) =>
            e.employee_id === employeeId
              ? { ...e, whatsapp_clicks: Number(e.whatsapp_clicks || 0) + 1 }
              : e,
          ),
        }));
      },
      viewBusiness: (businessId) => {
        setState((prev) => ({
          ...prev,
          businesses: prev.businesses.map((b) =>
            b.business_id === businessId ? { ...b, views: Number(b.views || 0) + 1 } : b,
          ),
        }));
      },
      contactBusiness: (businessId) => {
        setState((prev) => ({
          ...prev,
          businesses: prev.businesses.map((b) =>
            b.business_id === businessId
              ? { ...b, whatsapp_clicks: Number(b.whatsapp_clicks || 0) + 1 }
              : b,
          ),
        }));
      },
      saveProfile: (form) => {
        setState((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.user_id === prev.currentUserId
              ? { ...u, name: form.name, email: form.email, phone: form.phone }
              : u,
          ),
        }));
        void fetch("/api/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
      },
      uploadAvatar: async (file) => {
        const response = await fetch("/api/account/avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ dataUrl: file.dataUrl }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to upload photo");
        const user = payload.user as User;
        setState((prev) => ({
          ...prev,
          users: prev.users.map((u) => (u.user_id === prev.currentUserId ? { ...u, avatar_url: user.avatar_url } : u)),
        }));
      },
      removeAvatar: async () => {
        const response = await fetch("/api/account/avatar", { method: "DELETE", credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to remove photo");
        setState((prev) => ({
          ...prev,
          users: prev.users.map((u) => (u.user_id === prev.currentUserId ? { ...u, avatar_url: "" } : u)),
        }));
      },
      setUserLevel: (userId, level) => {
        setState((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            u.user_id === userId ? { ...u, account_level: level } : u,
          ),
        }));
      },
      authenticated,
      authLoading,
      login: async (email, password) => {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to sign in");
        const user = payload.user as User;
        const next = payload.state ? removeLegacyDemoData(payload.state as LifeState) : prepareStateForUser(buildSeed(), user);
        next.currentUserId = user.user_id;
        next.businesses = (next.businesses || []).map((b) => ({ ...b, gallery: Array.isArray(b.gallery) ? b.gallery : [] }));
        next.assets = (next.assets || []).map((a) => ({ ...a, gallery: Array.isArray(a.gallery) ? a.gallery : [] }));
        const existing = next.users.find((u) => u.user_id === user.user_id);
        if (existing) Object.assign(existing, user);
        else next.users.unshift(user);
        setState(next);
        setAuthenticated(true);
        setReady(true);
        if (!payload.state) await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ state: next }) });
      },
      register: async (form) => {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to create account");
        const user = payload.user as User;
        const next = prepareStateForUser(buildSeed(), user);
        setState(next);
        setAuthenticated(true);
        setReady(true);
        await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ state: next }) });
      },
      requestPasswordReset: async (email) => {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to request password reset");
        return payload as { resetUrl?: string };
      },
      resetPassword: async (token, password) => {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ token, password }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to reset password");
      },
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        setAuthenticated(false);
        setReady(false);
        setState(buildSeed());
      },
    };
  }, [state, authenticated, authLoading, publicMarketplace]);

  return <LifeContext.Provider value={api}>{children}</LifeContext.Provider>;
}

export function useLife() {
  const ctx = useContext(LifeContext);
  if (!ctx) throw new Error("useLife must be used within LifeProvider");
  return ctx;
}