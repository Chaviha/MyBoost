export type AccountLevel = "admin" | "owner" | "user";

export type RelationshipType = "owner" | "employee" | "customer" | "supplier";

export type RequestStatus = "Pending" | "Approved" | "Rejected";

export type CustomerStatus = "Pending" | "Due soon" | "Overdue" | "Paid";

export type ChargeMode = "owner" | "customer" | "both";

export type LedgerType = "charge" | "payment";

export type JobStatus = "Not started" | "In progress" | "On hold" | "Ready" | "Completed";

export type InvoiceStatus = "Unpaid" | "Partial" | "Paid";

export type User = {
  user_id: string;
  business_id: string;
  name: string;
  email: string;
  phone: string;
  avatar_url?: string;
  role: string;
  account_level: AccountLevel;
  status: string;
};

export type MediaType = "image" | "video";

export type MediaItem = {
  media_id: string;
  url: string;
  name: string;
  media_type: MediaType;
  created_at: string;
};

/** @deprecated use MediaItem — kept for any lingering references. */
export type BusinessImage = MediaItem & { image_id: string; business_id: string };

export type Business = {
  business_id: string;
  owner_user_id: string;
  business_name: string;
  business_type: string;
  phone: string;
  email: string;
  region: string;
  status: string;
  listed: boolean;
  tagline: string;
  views: number;
  whatsapp_clicks: number;
  image_url: string;
  gallery: MediaItem[];
};

export type Relationship = {
  relationship_id: string;
  user_id: string;
  business_id: string;
  relationship_type: RelationshipType;
  role: string;
  job_status: string;
  status: string;
};

export type Customer = {
  customer_id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string;
  amount: number;
  due_date: string;
  type: string;
  status: CustomerStatus;
  user_id: string;
  charge_mode: ChargeMode;
};

export type LedgerEntry = {
  entry_id: string;
  business_id: string;
  customer_id: string;
  type: LedgerType;
  amount: number;
  description: string;
  product_id: string;
  qty: number;
  posted_by: string;
  date: string;
};

export type Employee = {
  employee_id: string;
  business_id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  job_status: string;
  salary: number;
  status: string;
  user_id: string;
  listed: boolean;
  location: string;
  views: number;
  whatsapp_clicks: number;
};

export type Asset = {
  asset_id: string;
  user_id: string;
  business_id: string;
  name: string;
  type: string;
  value: number;
  listed: boolean;
  listing_type: "For sale" | "For hire";
  location: string;
  phone: string;
  views: number;
  whatsapp_clicks: number;
  created_date: string;
  status: string;
  notes: string;
  image_url: string;
  gallery: MediaItem[];
};

export type Sale = {
  sale_id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
};

export type Expense = {
  expense_id: string;
  business_id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
};

export type InvoicePicture = {
  name: string;
  data_url: string;
};

export type MoneyRequest = {
  request_id: string;
  user_id: string;
  business_id: string;
  type: string;
  amount: number;
  reason: string;
  request_date: string;
  status: RequestStatus;
  pictures: InvoicePicture[];
};

export type Product = {
  product_id: string;
  business_id: string;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  stock: number;
  status: string;
};

export type Job = {
  job_id: string;
  business_id: string;
  employee_id: string;
  customer_id: string;
  title: string;
  description: string;
  start_date: string;
  due_date: string;
  estimated_cost: number;
  status: JobStatus;
};

export type Quotation = {
  quote_id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  total: number;
  status: string;
  date: string;
  notes: string;
};

export type Invoice = {
  invoice_id: string;
  business_id: string;
  customer_id: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  total: number;
  paid: number;
  status: InvoiceStatus;
};

export type Income = {
  income_id: string;
  user_id: string;
  source: string;
  amount: number;
  date: string;
};

export type Sacco = {
  sacco_id: string;
  user_id: string;
  name: string;
  balance: number;
  contribution: number;
};

export type OfferKind = "employment" | "customer" | "general";

export type Offer = {
  offer_id: string;
  user_id: string;
  title: string;
  from: string;
  amount: number;
  status: string;
  kind?: OfferKind;
  business_id?: string;
  relationship_id?: string;
  role?: string;
};

export type LifeState = {
  currentUserId: string;
  selectedBusinessId: string;
  users: User[];
  businesses: Business[];
  relationships: Relationship[];
  customers: Customer[];
  ledger: LedgerEntry[];
  employees: Employee[];
  assets: Asset[];
  sales: Sale[];
  expenses: Expense[];
  requests: MoneyRequest[];
  products: Product[];
  jobs: Job[];
  quotations: Quotation[];
  invoices: Invoice[];
  income: Income[];
  saccos: Sacco[];
  offers: Offer[];
  liabilities: Record<string, number>;
};

export type EnrichedBusiness = Business & {
  revenue: number;
  expenses: number;
  profit: number;
};