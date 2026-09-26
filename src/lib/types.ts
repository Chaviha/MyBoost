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

/** Business-owned catalogue category, e.g. "CHS Steel Pipe" or "Cement". */
export type ProductCategory = {
  category_id: string;
  business_id: string;
  name: string;
  description: string;
  /** Default sell unit for products in this category (m, kg, pcs, …). */
  unit_default: string;
};

export type SpecDataType = "number" | "text";

/**
 * A structured attribute defined once per category.
 * Example for CHS steel: nominal_bore (mm), outside_dia (mm), mass_kg_m (kg/m), pressure_mpa (MPa).
 */
export type SpecDefinition = {
  spec_id: string;
  category_id: string;
  business_id: string;
  /** Stable machine key, e.g. "nominal_bore". */
  key: string;
  /** Human label, e.g. "Nominal bore". */
  label: string;
  /** Unit shown next to values, e.g. "mm", "kg/m", "MPa". */
  unit: string;
  data_type: SpecDataType;
  sort_order: number;
};

/** Keyed spec values on a product or variant, e.g. { nominal_bore: 50, outside_dia: 60.3 }. */
export type SpecValues = Record<string, string | number>;

/** Physical/catalogue goods vs billable services (labour, cutting, consulting…). */
export type CatalogueItemKind = "product" | "service";

export type Product = {
  product_id: string;
  business_id: string;
  name: string;
  /** product = stocked goods; service = offered work/rates (no inventory emphasis). */
  item_kind?: CatalogueItemKind;
  /** Free-text category label kept for compatibility and display. */
  category: string;
  /** Links to ProductCategory when using structured catalogue. */
  category_id?: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  stock: number;
  status: string;
  sku?: string;
  description?: string;
  /** Structured measurements / attributes for this SKU. */
  specs?: SpecValues;
  /** Cover / primary design or service image. */
  image_url?: string;
  /** Design drawings, photos, and short videos. */
  gallery?: MediaItem[];
  /** when true, this product is offered up across LifeBoost for anyone building a
   * quotation — any sector, not just this product's own business — via the public
   * marketplace endpoint. */
  listed?: boolean;
};

/**
 * Size / grade / colour row under a parent product.
 * Example: CHS 50 NB under parent "Mild steel CHS pipe".
 */
export type ProductVariant = {
  variant_id: string;
  product_id: string;
  business_id: string;
  name: string;
  sku: string;
  selling_price: number;
  cost_price: number;
  stock: number;
  specs: SpecValues;
  status: string;
};

/** A listed product as returned by the cross-account /api/public/marketplace feed.
 * This is the catalog quotations search against — spans every business on LifeBoost,
 * regardless of sector (steel, agriculture, construction, etc). */
export type MarketplaceProduct = {
  product_id: string;
  business_id: string;
  business_name: string;
  name: string;
  category: string;
  unit: string;
  selling_price: number;
  specs?: Record<string, string | number>;
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

export type QuoteType = "general" | "steel" | "dxf_cut" | "concrete" | "custom_product";

export type QuoteLineItem = {
  line_id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  /** product_id of the matched/selected catalog item this rate came from, if any */
  source_product_id?: string;
  /** which business's catalog this item was priced from (may differ per line item
   * now that quotes can pull from any listed business, any sector) */
  source_business_id?: string;
  source_business_name?: string;
  /** true when the person overrode the suggested price/description instead of
   * taking the catalog match as-is */
  customized?: boolean;
  /** free-form spec details (grade, dims, material, thickness, cut length, etc.) for display */
  meta?: Record<string, string | number | boolean | null | Record<string, number>>;
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
  quote_type: QuoteType;
  /** business whose product catalog supplied the pricing (may differ from business_id) */
  pricing_business_id?: string;
  pricing_business_name?: string;
  line_items?: QuoteLineItem[];
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
  /** Structured catalogue categories per business. */
  product_categories: ProductCategory[];
  /** Spec field definitions belonging to categories. */
  product_specs: SpecDefinition[];
  /** Optional size/grade rows under products. */
  product_variants: ProductVariant[];
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