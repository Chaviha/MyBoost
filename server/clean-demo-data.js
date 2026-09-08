import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });

const DEMO_BUSINESS_IDS = new Set(["BUS001", "BUS002"]);
const DEMO_BUSINESS_NAMES = new Set(["Felix Hardware", "Garden Kitchen"]);
const DEMO_EMPLOYEE_IDS = new Set(["EMP001", "EMP002", "EMP003"]);
const DEMO_CUSTOMER_IDS = new Set(["CUS001", "CUS002", "CUS003", "CUS004", "CUS005"]);
const DEMO_PRODUCT_IDS = new Set(["PRD001", "PRD002"]);
const DEMO_SALE_IDS = new Set(["SAL001", "SAL002", "SAL003"]);
const DEMO_EXPENSE_IDS = new Set(["EXP001", "EXP002", "EXP003"]);
const DEMO_JOB_IDS = new Set(["JOB001", "JOB002", "JOB003"]);
const DEMO_QUOTE_IDS = new Set(["QTE001", "QTE002"]);
const DEMO_INVOICE_IDS = new Set(["INV001", "INV002"]);
const DEMO_INCOME_IDS = new Set(["INC001", "INC002", "INC003", "INC004"]);
const DEMO_SACCO_IDS = new Set(["SAC001", "SAC002", "SAC003"]);
const DEMO_OFFER_IDS = new Set(["OFR001", "OFR002"]);
const DEMO_LEDGER_IDS = new Set(["LED001", "LED002", "LED003", "LED004", "LED005", "LED006", "LED007"]);
const DEMO_REQUEST_IDS = new Set(["REQ001", "REQ002", "REQ003"]);

function filterById(items, ids) {
  return Array.isArray(items) ? items.filter((item) => !ids.has(item?.id || item?.[`${Object.keys(item || {}).find((k) => k.endsWith("_id")) || "id"}`])) : [];
}

function cleanState(state) {
  const next = structuredClone(state || {});
  const businesses = Array.isArray(next.businesses) ? next.businesses : [];
  next.businesses = businesses.filter((b) => !DEMO_BUSINESS_IDS.has(b?.business_id) && !DEMO_BUSINESS_NAMES.has(b?.business_name));
  next.relationships = (next.relationships || []).filter((r) => !DEMO_BUSINESS_IDS.has(r?.business_id));
  next.customers = (next.customers || []).filter((c) => !DEMO_BUSINESS_IDS.has(c?.business_id) && !DEMO_CUSTOMER_IDS.has(c?.customer_id));
  next.ledger = (next.ledger || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_LEDGER_IDS.has(x?.entry_id));
  next.employees = (next.employees || []).filter((e) => !DEMO_BUSINESS_IDS.has(e?.business_id) && !DEMO_EMPLOYEE_IDS.has(e?.employee_id));
  next.assets = (next.assets || []).filter((a) => !DEMO_BUSINESS_IDS.has(a?.business_id));
  next.sales = (next.sales || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_SALE_IDS.has(x?.sale_id));
  next.expenses = (next.expenses || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_EXPENSE_IDS.has(x?.expense_id));
  next.requests = (next.requests || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_REQUEST_IDS.has(x?.request_id));
  next.products = (next.products || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_PRODUCT_IDS.has(x?.product_id));
  next.jobs = (next.jobs || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_JOB_IDS.has(x?.job_id));
  next.quotations = (next.quotations || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_QUOTE_IDS.has(x?.quote_id));
  next.invoices = (next.invoices || []).filter((x) => !DEMO_BUSINESS_IDS.has(x?.business_id) && !DEMO_INVOICE_IDS.has(x?.invoice_id));
  next.income = (next.income || []).filter((x) => !DEMO_INCOME_IDS.has(x?.income_id));
  next.saccos = (next.saccos || []).filter((x) => !DEMO_SACCO_IDS.has(x?.sacco_id));
  next.offers = (next.offers || []).filter((x) => !DEMO_OFFER_IDS.has(x?.offer_id));
  next.liabilities = Object.fromEntries(Object.entries(next.liabilities || {}).filter(([key]) => !["USR000", "USR001", "USR002", "USR003", "USR004"].includes(key)));
  next.users = (next.users || []).filter((u) => !["amina@lifeboost.ke", "felix@lifeboost.ke", "john@lifeboost.ke", "grace@lifeboost.ke", "njeri@supplies.ke"].includes(String(u?.email || "").toLowerCase()));
  next.currentUserId = next.currentUserId && next.users.some((u) => u.user_id === next.currentUserId) ? next.currentUserId : "";
  next.selectedBusinessId = next.selectedBusinessId && next.businesses.some((b) => b.business_id === next.selectedBusinessId) ? next.selectedBusinessId : "";
  return next;
}

try {
  const result = await pool.query("SELECT user_id, state FROM user_state");
  let changed = 0;
  for (const row of result.rows) {
    const next = cleanState(row.state);
    await pool.query("UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2", [JSON.stringify(next), row.user_id]);
    changed += 1;
  }
  console.log(`Cleaned demo data from ${changed} workspace(s).`);
} finally {
  await pool.end();
}
