import type { SpecDataType } from "./types";

export type CatalogueTemplateId =
  | "blank"
  | "steel_chs"
  | "steel_plate"
  | "steel_bar"
  | "cement_building"
  | "hardware_general"
  | "restaurant"
  | "retail"
  | "agriculture"
  | "professional"
  | "cutting_services";

export type CatalogueTemplateField = {
  key: string;
  label: string;
  unit: string;
  data_type: SpecDataType;
};

export type CatalogueTemplate = {
  id: CatalogueTemplateId;
  name: string;
  description: string;
  /** Suggested default sell unit for the category. */
  unit_default: string;
  /** Business types this template suits best. */
  business_types: string[];
  fields: CatalogueTemplateField[];
};

/** Industry table styles — each business picks the column set that matches their trade. */
export const CATALOGUE_TEMPLATES: CatalogueTemplate[] = [
  {
    id: "blank",
    name: "Blank table",
    description: "No preset columns — add your own specifications.",
    unit_default: "unit",
    business_types: [],
    fields: [],
  },
  {
    id: "steel_chs",
    name: "CHS / pipe steel",
    description: "Nominal bore, outside diameter, mass, pressure rating.",
    unit_default: "m",
    business_types: ["Construction", "Manufacturing", "Retail", "Other"],
    fields: [
      { key: "nominal_bore", label: "Nominal bore", unit: "mm", data_type: "number" },
      { key: "outside_dia", label: "Outside diameter", unit: "mm", data_type: "number" },
      { key: "wall_thickness", label: "Wall thickness", unit: "mm", data_type: "number" },
      { key: "mass_kg_m", label: "Mass", unit: "kg/m", data_type: "number" },
      { key: "pressure_mpa", label: "Pressure rating", unit: "MPa", data_type: "number" },
    ],
  },
  {
    id: "steel_plate",
    name: "Steel plate / sheet",
    description: "Thickness, width, length, grade, mass per sheet.",
    unit_default: "pcs",
    business_types: ["Construction", "Manufacturing", "Retail"],
    fields: [
      { key: "thickness", label: "Thickness", unit: "mm", data_type: "number" },
      { key: "width", label: "Width", unit: "mm", data_type: "number" },
      { key: "length", label: "Length", unit: "mm", data_type: "number" },
      { key: "grade", label: "Grade", unit: "", data_type: "text" },
      { key: "mass_kg", label: "Mass", unit: "kg", data_type: "number" },
    ],
  },
  {
    id: "steel_bar",
    name: "Rebar / steel bar",
    description: "Diameter, length, grade, mass per metre.",
    unit_default: "m",
    business_types: ["Construction", "Manufacturing", "Retail"],
    fields: [
      { key: "diameter", label: "Diameter", unit: "mm", data_type: "number" },
      { key: "length_m", label: "Length", unit: "m", data_type: "number" },
      { key: "grade", label: "Grade", unit: "", data_type: "text" },
      { key: "mass_kg_m", label: "Mass", unit: "kg/m", data_type: "number" },
    ],
  },
  {
    id: "cement_building",
    name: "Cement & building materials",
    description: "Pack size, strength class, coverage.",
    unit_default: "bag",
    business_types: ["Construction", "Retail", "Other"],
    fields: [
      { key: "pack_size", label: "Pack size", unit: "kg", data_type: "number" },
      { key: "strength_class", label: "Strength class", unit: "", data_type: "text" },
      { key: "coverage", label: "Coverage", unit: "m²", data_type: "number" },
    ],
  },
  {
    id: "hardware_general",
    name: "Hardware / tools",
    description: "Size, material, finish, pack quantity.",
    unit_default: "pcs",
    business_types: ["Retail", "Construction", "Other"],
    fields: [
      { key: "size", label: "Size", unit: "", data_type: "text" },
      { key: "material", label: "Material", unit: "", data_type: "text" },
      { key: "finish", label: "Finish", unit: "", data_type: "text" },
      { key: "pack_qty", label: "Pack qty", unit: "pcs", data_type: "number" },
    ],
  },
  {
    id: "restaurant",
    name: "Restaurant / kitchen",
    description: "Portion, prep time, allergens, spice level.",
    unit_default: "serving",
    business_types: ["Restaurant"],
    fields: [
      { key: "portion", label: "Portion", unit: "", data_type: "text" },
      { key: "prep_minutes", label: "Prep time", unit: "min", data_type: "number" },
      { key: "allergens", label: "Allergens", unit: "", data_type: "text" },
      { key: "spice_level", label: "Spice level", unit: "", data_type: "text" },
    ],
  },
  {
    id: "retail",
    name: "Retail / FMCG",
    description: "Barcode, brand, pack size, shelf life.",
    unit_default: "pcs",
    business_types: ["Retail"],
    fields: [
      { key: "barcode", label: "Barcode", unit: "", data_type: "text" },
      { key: "brand", label: "Brand", unit: "", data_type: "text" },
      { key: "pack_size", label: "Pack size", unit: "", data_type: "text" },
      { key: "shelf_life_days", label: "Shelf life", unit: "days", data_type: "number" },
    ],
  },
  {
    id: "agriculture",
    name: "Agriculture / farm",
    description: "Variety, unit weight, season, origin.",
    unit_default: "kg",
    business_types: ["Agriculture"],
    fields: [
      { key: "variety", label: "Variety", unit: "", data_type: "text" },
      { key: "unit_weight", label: "Unit weight", unit: "kg", data_type: "number" },
      { key: "season", label: "Season", unit: "", data_type: "text" },
      { key: "origin", label: "Origin", unit: "", data_type: "text" },
    ],
  },
  {
    id: "professional",
    name: "Professional services",
    description: "Duration, deliverable, rate basis.",
    unit_default: "hour",
    business_types: ["Professional Services", "Transport", "Other"],
    fields: [
      { key: "duration", label: "Duration", unit: "hrs", data_type: "number" },
      { key: "deliverable", label: "Deliverable", unit: "", data_type: "text" },
      { key: "rate_basis", label: "Rate basis", unit: "", data_type: "text" },
    ],
  },
  {
    id: "cutting_services",
    name: "Laser / CNC cutting rates",
    description: "Process (Laser/Engraving/Punching) + material + thickness. Name products like Laser Cut Mild Steel 3mm.",
    unit_default: "m",
    business_types: ["Manufacturing", "Construction", "Other", "Retail"],
    fields: [
      { key: "material", label: "Material", unit: "", data_type: "text" },
      { key: "thickness", label: "Thickness", unit: "mm", data_type: "number" },
      { key: "process", label: "Process", unit: "", data_type: "text" },
    ],
  },
];

export function templatesForBusinessType(businessType: string | undefined): CatalogueTemplate[] {
  if (!businessType) return CATALOGUE_TEMPLATES;
  const matched = CATALOGUE_TEMPLATES.filter(
    (t) => t.id === "blank" || t.business_types.includes(businessType),
  );
  return matched.length > 1 ? matched : CATALOGUE_TEMPLATES;
}

export function getCatalogueTemplate(id: string): CatalogueTemplate | undefined {
  return CATALOGUE_TEMPLATES.find((t) => t.id === id);
}
