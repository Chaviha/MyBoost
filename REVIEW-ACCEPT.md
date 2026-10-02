# Review & Accept + Customer share (WhatsApp / Email)

## Business app
1. Create quotation → status **Sent** (no charge yet).
2. **⋯ menu**:
   - **Review & Accept** (in-app, staff)
   - **Send WhatsApp** — opens WhatsApp with review link (uses customer phone if set)
   - **Send Email** — SMTP if configured, else opens mail app
   - **Copy review link**
3. Customer opens `/quote/<token>` (no login).
4. Customer **Accept** → charge posted to their tab + ledger.
5. **Customers → Record payment** → balance reduces.

## Technical
- `share_token` on each quotation
- `GET /api/public/quote/:token`
- `POST /api/public/quote/:token/respond` `{ decision: "accept"|"reject" }`
- `POST /api/public/quote/:token/email` (needs SMTP_*)
- Page: `src/routes/quote.$token.tsx`

## Tips
- Add **phone** (WhatsApp) and **email** on the customer record.
- For email delivery set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
