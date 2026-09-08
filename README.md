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
