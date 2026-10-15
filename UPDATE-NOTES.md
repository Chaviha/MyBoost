# LifeBoost update notes

This update is based on the uploaded MyLifeBoost4 project. Existing application source, catalogue data model, quotation code and UI assets are retained.

## Included changes

- Added a reusable search button + expandable search field and wired it into Products/Services, Specifications, Options, Stock, Jobs, Invoices, Expenses, Requests, Smart Collection, Assets, customer Orders and Meetings. Existing search controls remain in Payments, Customers, Employees and Quotations.
- Added `...` actions to meetings for editing title/agenda and deleting a meeting. The backend only permits the organizer to delete their meeting; discussion messages are removed by the database cascade.
- Added an owner-controlled `Allow customer payment updates` / `Disable customer payment updates` action on each customer. It defaults to off for existing records. Linked customers can submit payment records only when allowed; owners can still record payments. Submitted payments should still be verified against actual payment evidence.
- Added persistent Smart Collection settings in PostgreSQL for channel, timing and days.
- Added in-app notifications stored in PostgreSQL, visible through the existing LifeBoost notifications menu.
- Added scheduled LifeBoost reminders every 15 minutes for linked customers with outstanding balances, using the saved before/on/overdue timing rule and a duplicate-prevention log.
- Smart Collection's Send action creates a LifeBoost notification, opens a prepared WhatsApp message, or does both according to the selected channel.

## Important delivery details

- Scheduled reminders are delivered as LifeBoost in-app notifications to linked customer accounts. WhatsApp opens a pre-filled chat that the sender must review and send. Automatic WhatsApp delivery needs a configured WhatsApp Business API integration and approved template/provider settings; this ZIP does not claim that automatic WhatsApp sending is already configured.
- New database tables (`app_notifications` and `collection_reminder_log`) are created by the existing startup schema initialization.
- The uploaded archive contained no `.env` secrets in this output. Configure the local `.env` separately; never commit it.
- Validation: changed TS/TSX files passed TypeScript transpile syntax checks and `server/index.js` passed `node --check`. The full project typecheck reports numerous existing errors across untouched files; the build could not run because the uploaded `node_modules` archive is missing Vite/Rolldown's platform-native optional binding. Run `npm install` in your own project folder before build/deployment.

## Round 2: customer payments, "..." menus, employee jobs and requests

### Customer payments (customer side failed to update)
Three separate causes, all fixed:
- `routes/_app/tab.tsx`: the "I paid" and "I took stock" dialogs were missing the `open` prop (so they never opened) and called the store with the wrong argument shapes. They now use the same form-object calls as the owner's Customers page.
- `server/index.js` `/api/customers/sync`: the owner's `Allow customer payment updates` switch was never copied to the customer's own record, so the customer never got the "I paid" button. `allow_customer_payments` is now synced.
- `/api/customers/payment-sync` now also refuses payments unless the owner enabled the switch (server-side, not only in the UI).
- Owner side: a customer's payment is written to the owner's row by the API, but the owner's open browser used to overwrite it on its next save. The store now pulls and merges it (every 15s and on focus), and `PUT /api/state` re-applies any server-written payment that a stale copy is missing.
- After deploying, the owner must open the app once so the customer records get the permission flag.

### "..." menus
`ProductMoreMenu` (Products/Services) used a plain `<details>` element that never closed on outside click. It now uses the shared `MoreActions` (Radix dropdown), like every other "..." menu: it closes on outside click, Escape and after choosing an action. No other `<details>` menus remain.

### Employee jobs (My work → My jobs)
- Jobs live in the owner's records, so employees now load theirs from a new `GET /api/work/jobs`, verified against the owner's employee records. Internal job cost is hidden from employees.
- Employees can set In progress / On hold / Ready (`POST /api/work/jobs/:id/status`). The owner sees the change and is notified; Completed stays with the owner.
- Customers see their jobs the same way under My orders → Jobs.

### Requests (customer or employee → business owner only)
- New shared tables `work_requests` and `work_request_messages` (created by the existing startup schema run).
- Employees and customers pick one of their businesses, optionally a job, a type (Progress update, Question, Money, Other), a message and up to 6 photos. Owners get an inbox with Approve/Reject (money) or Acknowledge, and both sides can keep replying with text and photos in the same thread.
- Owners cannot create requests; the API rejects requests to a business you own and checks the link against the owner's own employee/customer records.
- Each action creates an in-app notification for the other party.
- The old money-request list stored in each user's private state (which never reached the owner) is no longer shown.

### Validation
- `server/index.js` passes `node --check`; the reconcile logic was unit-tested (payment re-applied once, employee status kept unless the owner changed it later).
- Changed TS/TSX files have no new type errors and pass ESLint. The remaining `tsc` errors are in files not touched here. Not run end to end against PostgreSQL in this environment, so please test with an owner, an employee and a customer account.
