import type { LifeState } from "./types";

/**
 * A brand-new LifeBoost workspace starts empty.
 * There are deliberately no demo businesses, customers, products, sales,
 * employees, or financial figures in the application seed.
 */
export function buildSeed(): LifeState {
  return {
    currentUserId: "",
    selectedBusinessId: "",
    users: [],
    businesses: [],
    relationships: [],
    customers: [],
    ledger: [],
    employees: [],
    assets: [],
    sales: [],
    expenses: [],
    requests: [],
    products: [],
    jobs: [],
    quotations: [],
    invoices: [],
    income: [],
    saccos: [],
    offers: [],
    liabilities: {},
  };
}
