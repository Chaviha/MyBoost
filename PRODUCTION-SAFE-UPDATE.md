# MyLifeBoost production-safe update

This package is based on **MyLifeBoost4** and is prepared to update the existing MyLifeBoost deployment without replacing the existing PostgreSQL database.

## What is preserved

- Existing users
- Existing businesses
- Existing customers
- Existing products
- Existing sales, invoices, expenses and quotations
- Existing employees, jobs, requests and offers
- Existing assets and marketplace state
- Existing Vercel/Railway architecture

The application code is updated to the MyLifeBoost4 version, including Meetings & Discussions, cross-business listed products for quotations, improved quotation builders, and password-reset handling.

## Database safety

**Do not create a new production database. Do not delete or reset the existing database.**

The only new database objects required by the new features are:

- `meetings`
- `meeting_messages`
- two indexes for those tables

An explicit migration is included at:

`server/migrations/001_meetings.sql`

The main `server/schema.sql` also uses `CREATE TABLE IF NOT EXISTS` for these new tables, so the server can initialize them safely if they are missing.

## Before production deployment

1. Back up the current Railway PostgreSQL database.
2. Deploy this code to a staging environment/database first if possible.
3. Test an existing user account.
4. Confirm existing businesses and products are still present.
5. Test the new Meetings, Discussions, quotation and product-listing features.
6. Only then merge/deploy to production.

## Secrets

No `.env`, Vercel output, `node_modules`, or uploaded user files are included in this package.

Set production secrets in Railway/Vercel as appropriate. Never commit `.env` or database passwords to GitHub.

## Important

Do **not** run:

`npm run db:clean-demo`

against the production database.
