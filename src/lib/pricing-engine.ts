import type {
  JobResourceUsage,
  LabourRate,
  Product,
  PricingMethod,
  PricingSettings,
  QuoteLineItem,
  TransportRate,
} from "./types";

export function smartProductPrice(
  product: Product,
  products: Product[],
  fallbackMarkupPercent = 0,
): number {
  const method: PricingMethod = product.pricing_method || "manual";
  if (typeof product.price_override === "number" && Number.isFinite(product.price_override)) {
    return Math.max(0, product.price_override);
  }
  switch (method) {
    case "reference_factor": {
      const reference = products.find((p) => p.product_id === product.reference_product_id);
      const factor = Number(product.price_factor ?? 1);
      return reference ? Math.max(0, reference.selling_price * factor) : product.selling_price;
    }
    case "cost_markup": {
      const markup = Number(product.price_factor ?? fallbackMarkupPercent);
      return Math.max(0, product.cost_price * (1 + markup / 100));
    }
    default:
      return Math.max(0, Number(product.selling_price || 0));
  }
}

export function applyWaste(qty: number, wastePercent: number): number {
  return Math.max(0, Number(qty || 0)) * (1 + Math.max(0, Number(wastePercent || 0)) / 100);
}

export function calculateTransport(rate: TransportRate | undefined, distanceKm: number): number {
  if (!rate) return 0;
  return Math.max(0, Number(rate.rate_per_km || 0)) * Math.max(0, Number(distanceKm || 0));
}

export function calculateLabour(
  rate: LabourRate | undefined,
  time: number,
  workers = 1,
): number {
  if (!rate) return 0;
  return Math.max(0, Number(rate.rate || 0)) *
    Math.max(0, Number(time || 0)) *
    Math.max(1, Number(workers || rate.workers_default || 1));
}

export function calculateQuotation(
  lines: QuoteLineItem[],
  settings: PricingSettings,
  extras?: {
    labourCost?: number;
    transportCost?: number;
    finishingCost?: number;
    otherCost?: number;
  },
) {
  const materialBase = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const wastePercent = Math.max(0, Number(settings.default_waste_percent || 0));
  const materialCost = materialBase * (1 + wastePercent / 100);
  const labourCost = Math.max(0, Number(extras?.labourCost || 0));
  const transportCost = Math.max(0, Number(extras?.transportCost || 0));
  const finishingCost = Math.max(0, Number(extras?.finishingCost || 0));
  const otherCost = Math.max(0, Number(extras?.otherCost || 0));
  const directCost = materialCost + labourCost + transportCost + finishingCost + otherCost;
  const overheadCost = directCost * Math.max(0, Number(settings.overhead_percent || 0)) / 100;
  const cost = directCost + overheadCost;
  const margin = Math.max(0, Math.min(99.99, Number(settings.default_profit_margin_percent || 0)));
  const profit = cost * margin / Math.max(0.01, 100 - margin);
  const total = cost + profit;
  return {
    material_cost: materialCost,
    labour_cost: labourCost,
    transport_cost: transportCost,
    finishing_cost: finishingCost,
    other_cost: otherCost,
    overhead_cost: overheadCost,
    profit,
    margin_percent: margin,
    waste_percent: wastePercent,
    cost,
    total,
  };
}

export function resourceVariance(
  planned: JobResourceUsage[] = [],
  actual: JobResourceUsage[] = [],
) {
  const map = new Map<string, { planned: JobResourceUsage; actual?: JobResourceUsage }>();
  for (const p of planned) map.set(p.product_id || p.description, { planned: p });
  for (const a of actual) {
    const key = a.product_id || a.description;
    const row = map.get(key);
    if (row) row.actual = a;
    else map.set(key, { planned: { ...a, qty: 0, amount: 0 }, actual: a });
  }
  return Array.from(map.values()).map(({ planned: p, actual: a }) => ({
    description: a?.description || p.description,
    unit: a?.unit || p.unit,
    plannedQty: Number(p.qty || 0),
    actualQty: Number(a?.qty || 0),
    qtyVariance: Number(a?.qty || 0) - Number(p.qty || 0),
    plannedAmount: Number(p.amount || 0),
    actualAmount: Number(a?.amount || 0),
    costVariance: Number(a?.amount || 0) - Number(p.amount || 0),
  }));
}
