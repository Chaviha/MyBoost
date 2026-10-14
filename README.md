# LifeBoost — standalone VS Code app

LifeBoost runs locally as a normal Vite + React frontend with an Express API and PostgreSQL database.

## Run

1. Install PostgreSQL and create a database named `MyLifeBoost`.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Install dependencies:

```bash
npm install
```

4. Start both frontend and backend:

```bash
npm run dev
```

Frontend: `http://localhost:8080`
API: `http://localhost:3001`

## Remove old demo data

If this project was previously run with the demo workspace, clean the old demo records from PostgreSQL once:

```bash
npm run db:clean-demo
```

New accounts and workspaces start empty. The application no longer seeds demo businesses, customers, products, employees, sales, expenses, or fake growth figures.

## Marketplace

The Marketplace is public and can be viewed before login. Only businesses that a real account has explicitly listed are exposed. Business profile photos and gallery photos remain associated with their `business_id`.

## Home

The authenticated home page contains only:

- Real month-over-month sales growth rate
- Offers
- Ask LifeBoost
- Marketplace

The growth graph does not invent a constant percentage. It appears when enough real sales history exists.


## Public Marketplace

The public Marketplace reads listings from PostgreSQL through the LifeBoost API. The Vite client proxies `/api/*` to `http://localhost:3001`.

For local development, create `.env` from `.env.example`, configure `DATABASE_URL`, then run:

```powershell
npm install
npm run dev
```

Keep both the Vite client and the LifeBoost API running. If the API is stopped or cannot connect to PostgreSQL, the public Marketplace will show a connection error instead of incorrectly reporting zero listings.


## Cloudflare R2 object storage (optional)

LifeBoost can store new business, asset, product-gallery and avatar uploads in Cloudflare R2 instead of the server's local `uploads` directory. Set all five `R2_*` variables from `.env.example` on the backend deployment. `R2_PUBLIC_URL` must be the public custom domain (or public bucket URL) for the bucket, without a trailing slash. Create an R2 S3 API token with read/write object permissions for the bucket. Keep the access key and secret only in the backend environment; never put them in `VITE_*` variables or frontend code.

If any required R2 setting is missing, the app keeps using local storage for development. Existing `/uploads/...` files are not migrated automatically; copy them to the matching object keys in R2 before switching an existing production deployment, then update stored media URLs as needed. Configure CORS only if browser clients upload directly (this implementation uploads through the authenticated backend).

Object key layout: `businesses/{businessId}/{filename}`, `assets/{assetId}/{filename}`, `products/{productId}/{filename}`, and `avatars/{userId}/{filename}`.
