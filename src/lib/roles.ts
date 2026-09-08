import type { AccountLevel, ChargeMode, Customer, Relationship, User } from "./types";

export type Permission =
  | "view_platform"
  | "manage_users"
  | "manage_all_businesses"
  | "manage_own_businesses"
  | "manage_sales"
  | "manage_customers"
  | "manage_employees"
  | "approve_requests"
  | "submit_requests"
  | "view_collections"
  | "manage_assets"
  | "view_marketplace"
  | "view_products"
  | "manage_jobs"
  | "view_jobs"
  | "manage_expenses"
  | "manage_quotes"
  | "view_finance";

const PERMS: Record<AccountLevel, Permission[]> = {
  admin: [
    "view_platform",
    "manage_users",
    "manage_all_businesses",
    "manage_own_businesses",
    "manage_sales",
    "manage_customers",
    "manage_employees",
    "approve_requests",
    "submit_requests",
    "view_collections",
    "manage_assets",
    "view_marketplace",
    "view_products",
    "manage_jobs",
    "view_jobs",
    "manage_expenses",
    "manage_quotes",
    "view_finance",
  ],
  owner: [
    "manage_own_businesses",
    "manage_sales",
    "manage_customers",
    "manage_employees",
    "approve_requests",
    "submit_requests",
    "view_collections",
    "manage_assets",
    "view_marketplace",
    "view_products",
    "manage_jobs",
    "view_jobs",
    "manage_expenses",
    "manage_quotes",
    "view_finance",
  ],
  user: [
    "submit_requests",
    "manage_assets",
    "view_marketplace",
    "view_jobs",
    "view_finance",
  ],
};

export function can(level: AccountLevel | undefined, perm: Permission) {
  if (!level) return false;
  return PERMS[level].includes(perm);
}

export function workspaceKind(
  user: User | undefined,
  relationships: Relationship[],
): "admin" | "owner" | "employee" | "customer" {
  if (!user) return "customer";
  if (user.account_level === "admin") return "admin";
  if (user.account_level === "owner") return "owner";
  const rels = relationships.filter(
    (r) => r.user_id === user.user_id && r.status.toLowerCase() === "active",
  );
  if (rels.some((r) => r.relationship_type === "employee")) return "employee";
  if (rels.some((r) => r.relationship_type === "customer")) return "customer";
  return "employee";
}

export function roleLabel(level: AccountLevel) {
  if (level === "admin") return "Admin";
  if (level === "owner") return "Owner";
  return "Member";
}

export function workspaceLabel(
  user: User | undefined,
  relationships: Relationship[],
) {
  const kind = workspaceKind(user, relationships);
  if (kind === "admin") return "Admin";
  if (kind === "owner") return "Owner";
  if (kind === "employee") return "Employee";
  return "Customer";
}

export function roleBlurb(level: AccountLevel) {
  if (level === "admin") return "Full platform access";
  if (level === "owner") return "Businesses, sales, team";
  return "Personal workspace";
}

export function activeEmployment(relationships: Relationship[], userId: string) {
  return relationships.find(
    (r) =>
      r.user_id === userId &&
      r.relationship_type === "employee" &&
      r.status.toLowerCase() === "active",
  );
}

export function customerRelationships(relationships: Relationship[], userId: string) {
  return relationships.filter(
    (r) =>
      r.user_id === userId &&
      r.relationship_type === "customer" &&
      r.status.toLowerCase() === "active",
  );
}

export function chargeModeLabel(mode: ChargeMode) {
  if (mode === "customer") return "Customer adds";
  if (mode === "both") return "Owner or customer";
  return "Owner adds";
}

export function canPostCharge(opts: {
  customer: Customer;
  user: User;
  isBusinessOwner: boolean;
}) {
  const { customer, user, isBusinessOwner } = opts;
  const isLinkedCustomer = customer.user_id && customer.user_id === user.user_id;
  if (user.account_level === "admin" || isBusinessOwner) {
    return customer.charge_mode !== "customer";
  }
  if (isLinkedCustomer) {
    return customer.charge_mode === "customer" || customer.charge_mode === "both";
  }
  return false;
}

export function canRecordPayment(opts: {
  customer: Customer;
  user: User;
  isBusinessOwner: boolean;
}) {
  const { customer, user, isBusinessOwner } = opts;
  if (user.account_level === "admin" || isBusinessOwner) return true;
  return Boolean(customer.user_id && customer.user_id === user.user_id);
}
