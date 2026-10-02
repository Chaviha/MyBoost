# LifeBoost Fabrication Quotation Update

This package integrates the fabrication quotation workflow into the existing LifeBoost quotation screen.

## Included
- Catalogue mass-per-metre (`kg/m`) is used for standard linear steel sections when available.
- Added quotation categories for MS angles/angle iron, I-beams/IPE/Universal Beams, C/U-channels, flat bars and welded mesh/BRC.
- Exact cut-piece weight is calculated from catalogue `kg/m × cut length` for catalogue-weighted linear sections.
- Existing RHS, SHS and CHS catalogue-weight support remains in place.
- Added a Fabrication Costs panel to Steel quotations:
  - Labour: professional × hours × price/hour.
  - Transport: load tonnes × distance × rate/tonne-km.
  - Wastage/offcut: standard stock minus exact required size, with catalogue kg/m support for linear steel and an area mode for plate offcuts.
  - Cutting: DXF calculation or manual cutting cost.
- DXF cutting can use a matching cutting service from the catalogue or a manual rate per metre/pierce.
- Manual cutting can be entered directly as a job cost.
- Added a `steel_section` catalogue template for structural sections using `mass_kg_m`.

## Important pricing rule
Technical catalogue specifications and business selling prices remain separate. The catalogue supplies technical weight references; the business product/service catalogue supplies the current price.

## Existing data/media
No database reset, demo-data cleanup, image deletion, upload directory changes, or migration destructive operations were added by this update.

## Validation note
The project dependencies could not be fully installed in the packaging sandbox before timeout, so a full `npm run typecheck` / `npm run build` could not be completed here. The source was inspected after modification, but test locally with the project's normal dependency install before deployment.

## Customer tab integration

- When a quotation is saved for a selected customer, the quotation total is automatically posted as a `charge` on that customer's tab.
- The ledger entry is linked to the quotation ID, so editing a quotation updates the same charge instead of creating duplicate debt.
- If the quotation amount changes, only the difference changes the customer's outstanding balance, preserving payments already made against the quotation.
- If a quotation is moved to another customer, the old customer's quotation charge is removed and the new customer's tab receives the quotation charge.
- Recording a customer payment reduces the customer's outstanding balance immediately. Payments are capped at the current outstanding amount so the balance cannot become negative.
- The customer ledger keeps both the original quotation charge and payment entries for an auditable history.
