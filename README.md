# Service images

Services use the same catalogue items page as products (`itemKind=service`).

## Changes
- Add/Edit service form includes **Service photos & videos** (MediaPicker)
- Images upload after create via `uploadProductMedia`
- Menu labels: Edit/Delete **service**, Manage images
- `addProduct` returns `product_id` so media can attach

## Install
```bash
cp src/lib/store.tsx              /path/to/MyBoost/src/lib/
cp src/routes/_app/products.tsx   /path/to/MyBoost/src/routes/_app/
```
Restart the app. Open **Catalogue → Services → Add service**.
