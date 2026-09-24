import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nodemailer from "nodemailer";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, "..", "uploads", "businesses");
const assetUploadRoot = path.join(__dirname, "..", "uploads", "assets");
const avatarUploadRoot = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(uploadRoot, { recursive: true });
fs.mkdirSync(assetUploadRoot, { recursive: true });
fs.mkdirSync(avatarUploadRoot, { recursive: true });
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const SESSION_DAYS = 30;
const RESET_MINUTES = 30;
const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    })
  : null;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
const app = express();
app.use(express.json({ limit: "60mb" }));
app.use(cookieParser());

const cookieName = process.env.SESSION_COOKIE_NAME || "lifeboost_session";
const isProduction = process.env.NODE_ENV === "production";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const userDto = (u) => ({
  user_id: u.id,
  business_id: "",
  name: u.name,
  email: u.email,
  phone: u.phone,
  avatar_url: u.avatar_url || "",
  role: u.role,
  account_level: u.account_level,
  status: u.status,
});

function setSessionCookie(res, token, maxAgeSeconds) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/" });
}

async function createSession(userId) {
  const raw = randomToken();
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))",
    [userId, sha256(raw), SESSION_DAYS],
  );
  return raw;
}

async function auth(req, res, next) {
  try {
    const raw = req.cookies[cookieName];
    if (!raw) return res.status(401).json({ error: "Authentication required" });
    const result = await pool.query(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 'active'`,
      [sha256(raw)],
    );
    if (!result.rows[0]) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }
    req.user = result.rows[0];
    req.sessionToken = raw;
    next();
  } catch (error) {
    next(error);
  }
}

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "postgresql" });
  } catch (error) { next(error); }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    if (name.length < 2) return res.status(400).json({ error: "Name is required" });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const hash = await bcrypt.hash(password, 12);
    const adminEmails = String(process.env.ADMIN_EMAILS || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
    const accountLevel = adminEmails.includes(email) ? "admin" : "owner";
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, phone, account_level) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [email, hash, name, phone, accountLevel],
    );
    const user = result.rows[0];
    const token = await createSession(user.id);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
    res.status(201).json({ user: userDto(user), state: null });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "An account with that email already exists" });
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "No account found with that email." });
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Incorrect password. Try again." });
    }
    if (user.status !== "active") return res.status(403).json({ error: "This account is not active" });
    const token = await createSession(user.id);
    setSessionCookie(res, token, SESSION_DAYS * 86400);
    const state = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [user.id]);
    res.json({ user: userDto(user), state: state.rows[0]?.state ?? null });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const raw = req.cookies[cookieName];
    if (raw) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(raw)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/auth/me", auth, (req, res) => res.json({ user: userDto(req.user) }));

app.post("/api/auth/forgot-password", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    // Always return the same message to prevent account enumeration.
    if (!result.rows[0]) return res.json({ message: "If that email exists, a reset link has been prepared." });
    const raw = randomToken();
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL", [result.rows[0].id]);
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + ($3 * INTERVAL '1 minute'))",
      [result.rows[0].id, sha256(raw), RESET_MINUTES],
    );
    const base = process.env.APP_URL || `http://localhost:8080`;
    const resetUrl = `${base}/?reset=${encodeURIComponent(raw)}`;
    let emailSent = false;
    if (mailer) {
      // A broken SMTP provider (bad creds, blocked port, etc.) must not fail the
      // whole request — the token is already issued, and the response to the
      // client is the same either way to avoid leaking whether the email exists.
      try {
        await mailer.sendMail({
          from: process.env.SMTP_FROM || "LifeBoost <no-reply@lifeboost.ke>",
          to: email,
          subject: "Reset your LifeBoost password",
          text: `Reset your LifeBoost password using this link. It expires in ${RESET_MINUTES} minutes: ${resetUrl}`,
          html: `<p>Reset your LifeBoost password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in ${RESET_MINUTES} minutes and can only be used once.</p>`,
        });
        emailSent = true;
      } catch (sendError) {
        console.error(`Failed to send password reset email to ${email}:`, sendError.message || sendError);
      }
    } else {
      // Most common cause of "reset emails never arrive": SMTP_HOST/PORT/USER/PASSWORD
      // were never set on this deployment. Always log this — not just outside
      // production — so it shows up in Railway logs instead of failing silently.
      console.warn(
        "Password reset requested but SMTP is not configured (SMTP_HOST is unset) — no email was sent. " +
          "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM to enable email delivery.",
      );
    }
    if (!emailSent && (!isProduction || process.env.LOG_RESET_LINKS === "true")) {
      console.log(`Password reset link for ${email}: ${resetUrl}`);
    }
    res.json({ message: "If that email exists, a reset link has been prepared.", ...(process.env.RETURN_RESET_LINK === "true" ? { resetUrl } : {}) });
  } catch (error) { next(error); }
});

app.post("/api/auth/reset-password", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE",
      [sha256(token)],
    );
    if (!found.rows[0]) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Reset link is invalid or expired" }); }
    const hash = await bcrypt.hash(password, 12);
    await client.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, found.rows[0].user_id]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [found.rows[0].id]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [found.rows[0].user_id]);
    await client.query("COMMIT");
    res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); next(error); }
  finally { client.release(); }
});

function safeFilename(name) {
  return String(name || "media").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "media";
}

const IMAGE_MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const VIDEO_MIME_EXT = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv" };
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

// Accepts a data: URL for an image or a video and returns its decoded bytes,
// media type, and a safe file extension — or null if it isn't a supported/valid upload.
function parseMediaDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) return null;
  if (IMAGE_MIME_EXT[mime]) {
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    return { mime, buffer, ext: IMAGE_MIME_EXT[mime], media_type: "image" };
  }
  if (VIDEO_MIME_EXT[mime]) {
    if (buffer.length > MAX_VIDEO_BYTES) return null;
    return { mime, buffer, ext: VIDEO_MIME_EXT[mime], media_type: "video" };
  }
  return null;
}

async function businessFromState(userId, businessId) {
  const result = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [userId]);
  const state = result.rows[0]?.state;
  const business = state?.businesses?.find((b) => b.business_id === businessId);
  if (!business) return null;
  if (reqUserIsAdminOrOwner(userId, business, state)) return { state, business };
  return null;
}

function reqUserIsAdminOrOwner(userId, business, state) {
  const user = state?.users?.find((u) => u.user_id === userId);
  return user?.account_level === "admin" || business.owner_user_id === userId;
}

async function assetFromState(userId, assetId) {
  const result = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [userId]);
  const state = result.rows[0]?.state;
  const asset = state?.assets?.find((a) => a.asset_id === assetId);
  if (!asset) return null;
  const user = state?.users?.find((u) => u.user_id === userId);
  const isAdmin = user?.account_level === "admin";
  const isOwner = asset.user_id === userId;
  const ownsBusiness = asset.business_id
    ? state?.businesses?.some((b) => b.business_id === asset.business_id && b.owner_user_id === userId)
    : false;
  if (isAdmin || isOwner || ownsBusiness) return { state, asset };
  return null;
}

app.post("/api/businesses/:businessId/media", auth, async (req, res, next) => {
  try {
    const businessId = String(req.params.businessId || "");
    const access = await businessFromState(req.user.id, businessId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this business" });
    const parsed = parseMediaDataUrl(req.body.dataUrl);
    if (!parsed) return res.status(400).json({ error: "Invalid file. Use JPG, PNG, WEBP or GIF images up to 6MB, or MP4/WEBM/MOV videos up to 40MB." });
    const mediaId = crypto.randomUUID();
    const filename = `${mediaId}.${parsed.ext}`;
    const dir = path.join(uploadRoot, businessId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), parsed.buffer);
    const media = {
      media_id: mediaId,
      url: `/uploads/businesses/${encodeURIComponent(businessId)}/${filename}`,
      name: safeFilename(req.body.name || filename),
      media_type: parsed.media_type,
      created_at: new Date().toISOString(),
    };
    const nextState = {
      ...access.state,
      businesses: access.state.businesses.map((b) =>
        b.business_id === businessId
          ? {
              ...b,
              gallery: [...(Array.isArray(b.gallery) ? b.gallery : []), media],
              image_url: b.image_url || (media.media_type === "image" ? media.url : b.image_url),
            }
          : b,
      ),
    };
    await pool.query(`INSERT INTO user_state (user_id, state) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()`, [req.user.id, JSON.stringify(nextState)]);
    res.status(201).json({ media });
  } catch (error) { next(error); }
});

app.delete("/api/businesses/:businessId/media/:mediaId", auth, async (req, res, next) => {
  try {
    const businessId = String(req.params.businessId || "");
    const mediaId = String(req.params.mediaId || "");
    const access = await businessFromState(req.user.id, businessId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this business" });
    const business = access.business;
    const gallery = Array.isArray(business.gallery) ? business.gallery : [];
    const media = gallery.find((item) => item.media_id === mediaId);
    if (!media) return res.status(404).json({ error: "File not found" });
    const filePath = path.join(uploadRoot, businessId, path.basename(new URL(`http://localhost${media.url}`).pathname));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const remaining = gallery.filter((item) => item.media_id !== mediaId);
    const image_url = remaining.find((item) => item.media_type === "image")?.url || "";
    const nextState = { ...access.state, businesses: access.state.businesses.map((b) => b.business_id === businessId ? { ...b, gallery: remaining, image_url } : b) };
    await pool.query(`UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2`, [JSON.stringify(nextState), req.user.id]);
    res.json({ ok: true, image_url });
  } catch (error) { next(error); }
});

app.patch("/api/businesses/:businessId/media-order", auth, async (req, res, next) => {
  try {
    const businessId = String(req.params.businessId || "");
    const access = await businessFromState(req.user.id, businessId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this business" });
    const order = Array.isArray(req.body.order) ? req.body.order.map(String) : null;
    if (!order) return res.status(400).json({ error: "An ordered list of media ids is required" });
    const gallery = Array.isArray(access.business.gallery) ? access.business.gallery : [];
    const byId = new Map(gallery.map((item) => [item.media_id, item]));
    const reordered = order.map((id) => byId.get(id)).filter(Boolean);
    // Preserve any items missing from the submitted order at the end, so nothing is dropped.
    for (const item of gallery) if (!order.includes(item.media_id)) reordered.push(item);
    const image_url = reordered.find((item) => item.media_type === "image")?.url || "";
    const nextState = {
      ...access.state,
      businesses: access.state.businesses.map((b) =>
        b.business_id === businessId ? { ...b, gallery: reordered, image_url } : b,
      ),
    };
    await pool.query(`UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2`, [JSON.stringify(nextState), req.user.id]);
    res.json({ gallery: reordered, image_url });
  } catch (error) { next(error); }
});

app.post("/api/assets/:assetId/media", auth, async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId || "");
    const access = await assetFromState(req.user.id, assetId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this asset" });
    const parsed = parseMediaDataUrl(req.body.dataUrl);
    if (!parsed) return res.status(400).json({ error: "Invalid file. Use JPG, PNG, WEBP or GIF images up to 6MB, or MP4/WEBM/MOV videos up to 40MB." });
    const mediaId = crypto.randomUUID();
    const filename = `${mediaId}.${parsed.ext}`;
    const dir = path.join(assetUploadRoot, assetId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), parsed.buffer);
    const media = {
      media_id: mediaId,
      url: `/uploads/assets/${encodeURIComponent(assetId)}/${filename}`,
      name: safeFilename(req.body.name || filename),
      media_type: parsed.media_type,
      created_at: new Date().toISOString(),
    };
    const nextState = {
      ...access.state,
      assets: access.state.assets.map((a) =>
        a.asset_id === assetId
          ? {
              ...a,
              gallery: [...(Array.isArray(a.gallery) ? a.gallery : []), media],
              image_url: a.image_url || (media.media_type === "image" ? media.url : a.image_url),
            }
          : a,
      ),
    };
    await pool.query(`INSERT INTO user_state (user_id, state) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()`, [req.user.id, JSON.stringify(nextState)]);
    res.status(201).json({ media });
  } catch (error) { next(error); }
});

app.delete("/api/assets/:assetId/media/:mediaId", auth, async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId || "");
    const mediaId = String(req.params.mediaId || "");
    const access = await assetFromState(req.user.id, assetId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this asset" });
    const asset = access.asset;
    const gallery = Array.isArray(asset.gallery) ? asset.gallery : [];
    const media = gallery.find((item) => item.media_id === mediaId);
    if (!media) return res.status(404).json({ error: "File not found" });
    const filePath = path.join(assetUploadRoot, assetId, path.basename(new URL(`http://localhost${media.url}`).pathname));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const remaining = gallery.filter((item) => item.media_id !== mediaId);
    const image_url = remaining.find((item) => item.media_type === "image")?.url || "";
    const nextState = { ...access.state, assets: access.state.assets.map((a) => a.asset_id === assetId ? { ...a, gallery: remaining, image_url } : a) };
    await pool.query(`UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2`, [JSON.stringify(nextState), req.user.id]);
    res.json({ ok: true, image_url });
  } catch (error) { next(error); }
});

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Public marketplace: only records explicitly marked `listed: true` are exposed.
// No login is required, and private accounting/customer data is never returned.
app.get("/api/public/marketplace", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT state FROM user_state");
    const businesses = [];
    const professionals = [];
    const assets = [];
    const products = [];
    const demoBusinessIds = new Set(["BUS001", "BUS002"]);
    const demoBusinessNames = new Set(["Felix Hardware", "Garden Kitchen"]);
    const demoProductIds = new Set(["PRD001", "PRD002"]);

    for (const row of result.rows) {
      const state = row.state || {};
      const allBusinesses = Array.isArray(state.businesses) ? state.businesses : [];
      const listedBusinesses = allBusinesses.filter((b) => b?.listed && !demoBusinessIds.has(b.business_id) && !demoBusinessNames.has(b.business_name));
      for (const business of listedBusinesses) {
        businesses.push({
          business_id: business.business_id,
          business_name: business.business_name,
          business_type: business.business_type,
          phone: business.phone || "",
          email: business.email || "",
          region: business.region || "",
          tagline: business.tagline || "",
          image_url: business.image_url || "",
          gallery: Array.isArray(business.gallery) ? business.gallery : [],
          views: Number(business.views || 0),
          whatsapp_clicks: Number(business.whatsapp_clicks || 0),
        });
      }

      const businessMap = new Map(listedBusinesses.map((b) => [b.business_id, b.business_name]));
      for (const employee of Array.isArray(state.employees) ? state.employees : []) {
        if (employee?.listed && businessMap.has(employee.business_id)) {
          professionals.push({
            employee_id: employee.employee_id,
            name: employee.name,
            role: employee.role,
            phone: employee.phone || "",
            location: employee.location || "",
            business_name: businessMap.get(employee.business_id),
            views: Number(employee.views || 0),
            whatsapp_clicks: Number(employee.whatsapp_clicks || 0),
          });
        }
      }
      for (const asset of Array.isArray(state.assets) ? state.assets : []) {
        if (asset?.listed) {
          assets.push({
            asset_id: asset.asset_id,
            name: asset.name,
            type: asset.type,
            value: Number(asset.value || 0),
            location: asset.location || "",
            notes: asset.notes || "",
            phone: asset.phone || "",
            image_url: asset.image_url || "",
            gallery: Array.isArray(asset.gallery) ? asset.gallery : [],
            views: Number(asset.views || 0),
            whatsapp_clicks: Number(asset.whatsapp_clicks || 0),
          });
        }
      }

      // Products power cross-business quotation pricing (steel, DXF cut, materials —
      // any sector). A product can be listed for quotation use even if its business
      // has not opted into the public directory, so we resolve names off every
      // business the account owns, not just `listedBusinesses`.
      const businessNameById = new Map(allBusinesses.map((b) => [b.business_id, b.business_name]));
      for (const product of Array.isArray(state.products) ? state.products : []) {
        if (
          product?.listed &&
          product.status !== "inactive" &&
          !demoBusinessIds.has(product.business_id) &&
          !demoProductIds.has(product.product_id)
        ) {
          products.push({
            product_id: product.product_id,
            business_id: product.business_id,
            business_name: businessNameById.get(product.business_id) || "",
            name: product.name,
            category: product.category || "",
            unit: product.unit || "unit",
            selling_price: Number(product.selling_price || 0),
          });
        }
      }
    }

    res.json({ businesses, professionals, assets, products });
  } catch (error) {
    next(error);
  }
});

async function updatePublicBusinessMetric(businessId, field) {
  const rows = await pool.query("SELECT user_id, state FROM user_state");
  for (const row of rows.rows) {
    const state = row.state || {};
    const business = Array.isArray(state.businesses) ? state.businesses.find((b) => b.business_id === businessId && b.listed) : null;
    if (!business) continue;
    business[field] = Number(business[field] || 0) + 1;
    await pool.query("UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2", [JSON.stringify(state), row.user_id]);
    return true;
  }
  return false;
}

app.post("/api/public/marketplace/businesses/:businessId/view", async (req, res, next) => {
  try {
    const ok = await updatePublicBusinessMetric(String(req.params.businessId || ""), "views");
    res.status(ok ? 200 : 404).json({ ok });
  } catch (error) { next(error); }
});

app.post("/api/public/marketplace/businesses/:businessId/contact", async (req, res, next) => {
  try {
    const ok = await updatePublicBusinessMetric(String(req.params.businessId || ""), "whatsapp_clicks");
    res.status(ok ? 200 : 404).json({ ok });
  } catch (error) { next(error); }
});

app.post("/api/relationships/invite", auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const targetEmail = String(req.body?.targetEmail || "").trim().toLowerCase();
    const inputRelationship = req.body?.relationship;
    const inputOffer = req.body?.offer;

    if (!/^\S+@\S+\.\S+$/.test(targetEmail)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (!inputRelationship || typeof inputRelationship !== "object") {
      return res.status(400).json({ error: "Relationship details are required" });
    }
    if (!inputOffer || typeof inputOffer !== "object") {
      return res.status(400).json({ error: "Offer details are required" });
    }

    const businessId = String(inputRelationship.business_id || inputOffer.business_id || "").trim();
    const relationshipType = String(inputRelationship.relationship_type || "").trim();
    if (!businessId || !["employee", "customer", "supplier"].includes(relationshipType)) {
      return res.status(400).json({ error: "Invalid relationship details" });
    }

    // The inviter must actually own the business in their private state.
    const ownerStateResult = await client.query(
      "SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE",
      [req.user.id],
    );
    const ownerState = ownerStateResult.rows[0]?.state;
    const business = Array.isArray(ownerState?.businesses)
      ? ownerState.businesses.find(
          (item) => item?.business_id === businessId && item?.owner_user_id === req.user.id,
        )
      : null;
    if (!business) {
      return res.status(403).json({ error: "You do not own this business" });
    }

    if (targetEmail === String(req.user.email || "").toLowerCase()) {
      return res.status(400).json({ error: "You cannot invite your own account" });
    }

    // IMPORTANT: look up the invitee in the shared users table, not in the
    // inviter's private users array. Each account has its own user_state row.
    const targetResult = await client.query(
      "SELECT * FROM users WHERE LOWER(email) = $1 AND status = 'active' LIMIT 1",
      [targetEmail],
    );
    const targetUser = targetResult.rows[0];

    // The person may not have created a LifeBoost account yet. Do not create
    // a fake user in the owner's JSON blob; the invite can simply be retried
    // after the person registers.
    if (!targetUser) {
      return res.json({
        linked: false,
        userId: "",
        message: "No active LifeBoost account exists for that email yet.",
      });
    }

    const relationshipId = String(inputRelationship.relationship_id || randomUUID());
    const offerId = String(inputOffer.offer_id || randomUUID());
    const relationship = {
      ...inputRelationship,
      relationship_id: relationshipId,
      user_id: targetUser.id,
      business_id: businessId,
      relationship_type: relationshipType,
      status: "pending",
    };
    const offer = {
      ...inputOffer,
      offer_id: offerId,
      user_id: targetUser.id,
      business_id: businessId,
      relationship_id: relationshipId,
      status: "Open",
    };

    const targetStateResult = await client.query(
      "SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE",
      [targetUser.id],
    );
    const targetState = targetStateResult.rows[0]?.state || {
      currentUserId: targetUser.id,
      selectedBusinessId: "",
      users: [],
      businesses: [],
      relationships: [],
      customers: [],
      ledger: [],
      employees: [],
      assets: [],
      sales: [],
      expenses: [],
      requests: [],
      products: [],
      jobs: [],
      quotations: [],
      invoices: [],
      income: [],
      saccos: [],
      offers: [],
      liabilities: {},
    };

    targetState.currentUserId = targetUser.id;
    targetState.users = Array.isArray(targetState.users) ? targetState.users : [];
    targetState.businesses = Array.isArray(targetState.businesses) ? targetState.businesses : [];
    targetState.relationships = Array.isArray(targetState.relationships) ? targetState.relationships : [];
    targetState.offers = Array.isArray(targetState.offers) ? targetState.offers : [];

    // Give the invitee a read-only copy of the business so the accepted
    // customer/professional tab has a real business to open. Private owner
    // accounting data is not copied.
    const businessIndex = targetState.businesses.findIndex((item) => item?.business_id === businessId);
    if (businessIndex >= 0) targetState.businesses[businessIndex] = business;
    else targetState.businesses.push(business);

    // Keep the authenticated account in its own state so the rest of the app
    // can resolve the relationship by user_id.
    const targetDto = userDto(targetUser);
    const existingUserIndex = targetState.users.findIndex((u) => u?.user_id === targetUser.id);
    if (existingUserIndex >= 0) targetState.users[existingUserIndex] = targetDto;
    else targetState.users.unshift(targetDto);

    // Upsert by ID so retries do not create duplicate offers/relationships.
    const relationshipIndex = targetState.relationships.findIndex(
      (r) => r?.relationship_id === relationshipId,
    );
    if (relationshipIndex >= 0) targetState.relationships[relationshipIndex] = relationship;
    else targetState.relationships.push(relationship);

    const offerIndex = targetState.offers.findIndex((o) => o?.offer_id === offerId);
    if (offerIndex >= 0) targetState.offers[offerIndex] = offer;
    else targetState.offers.push(offer);

    await client.query(
      `INSERT INTO user_state (user_id, state) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [targetUser.id, JSON.stringify(targetState)],
    );

    await client.query("COMMIT");
    res.json({
      linked: true,
      userId: targetUser.id,
      relationshipId,
      offerId,
      message: "Invitation and offer delivered to the user's LifeBoost account.",
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});


app.post("/api/relationships/respond", auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const offerId = String(req.body?.offerId || "").trim();
    const decision = String(req.body?.decision || "").trim().toLowerCase();
    if (!offerId || !["accepted", "declined"].includes(decision)) {
      return res.status(400).json({ error: "Offer and decision are required" });
    }

    await client.query("BEGIN");
    const result = await client.query("SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE", [req.user.id]);
    const state = result.rows[0]?.state || {};
    state.offers = Array.isArray(state.offers) ? state.offers : [];
    state.relationships = Array.isArray(state.relationships) ? state.relationships : [];
    state.customers = Array.isArray(state.customers) ? state.customers : [];
    state.employees = Array.isArray(state.employees) ? state.employees : [];

    const offer = state.offers.find((item) => item?.offer_id === offerId);
    if (!offer || String(offer.user_id) !== String(req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Offer not found" });
    }
    const relationship = offer.relationship_id
      ? state.relationships.find((item) => item?.relationship_id === offer.relationship_id)
      : null;

    if (decision === "declined") {
      state.offers = state.offers.map((item) => item.offer_id === offerId ? { ...item, status: "Declined" } : item);
      if (relationship) {
        state.relationships = state.relationships.map((item) => item.relationship_id === relationship.relationship_id ? { ...item, status: "declined" } : item);
      }
    } else {
      state.offers = state.offers.map((item) => item.offer_id === offerId ? { ...item, status: "Accepted" } : item);
      if (relationship) {
        state.relationships = state.relationships.map((item) => item.relationship_id === relationship.relationship_id ? { ...item, status: "active" } : item);

        const me = await client.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
        const user = me.rows[0];
        const businessId = relationship.business_id || offer.business_id || "";
        if (relationship.relationship_type === "customer") {
          const existing = state.customers.find((item) => item?.user_id === req.user.id && item?.business_id === businessId);
          if (!existing) {
            state.customers.push({
              customer_id: `CUS-${randomUUID()}`,
              business_id: businessId,
              name: user?.name || req.user.email,
              phone: user?.phone || "",
              email: user?.email || req.user.email,
              amount: Number(offer.amount || 0),
              due_date: "",
              type: "Customer",
              status: Number(offer.amount || 0) > 0 ? "Pending" : "Paid",
              user_id: req.user.id,
              charge_mode: "both",
            });
          }
        } else if (relationship.relationship_type === "employee") {
          const existing = state.employees.find((item) => item?.user_id === req.user.id && item?.business_id === businessId);
          if (!existing) {
            state.employees.push({
              employee_id: `EMP-${randomUUID()}`,
              business_id: businessId,
              name: user?.name || req.user.email,
              phone: user?.phone || "",
              email: user?.email || req.user.email,
              role: relationship.role || offer.role || "Professional",
              job_status: "Active",
              salary: 0,
              status: "active",
              user_id: req.user.id,
              listed: false,
              location: "",
              views: 0,
              whatsapp_clicks: 0,
            });
          }
        }
      }
    }

    await client.query("UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2", [JSON.stringify(state), req.user.id]);
    await client.query("COMMIT");
    res.json({ ok: true, state });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
});


// Shared Meetings & Discussions. Meetings live in their own tables so invited
// participants can see the same meeting even though LifeBoost business data
// remains in each user's private state JSON.
async function canAccessMeeting(meetingId, userId) {
  const result = await pool.query(
    `SELECT * FROM meetings
     WHERE id = $1 AND (organizer_user_id = $2 OR participant_user_ids ? $2::text)`,
    [meetingId, userId],
  );
  return result.rows[0] || null;
}

async function meetingPayload(meeting) {
  const ids = Array.isArray(meeting.participant_user_ids) ? meeting.participant_user_ids : [];
  const participants = ids.length
    ? (await pool.query(
        "SELECT id AS user_id, name, email, avatar_url FROM users WHERE id = ANY($1::uuid[]) ORDER BY name",
        [ids],
      )).rows
    : [];
  return {
    meeting_id: meeting.id,
    organizer_user_id: meeting.organizer_user_id,
    organizer_name: meeting.organizer_name || "",
    organizer_email: meeting.organizer_email || "",
    title: meeting.title,
    agenda: meeting.agenda || "",
    start_at: meeting.start_at,
    duration_minutes: Number(meeting.duration_minutes || 60),
    status: meeting.status,
    meeting_url: meeting.meeting_url || "",
    notes: meeting.notes || "",
    decisions: meeting.decisions || "",
    action_items: Array.isArray(meeting.action_items) ? meeting.action_items : [],
    participants,
    created_at: meeting.created_at,
    updated_at: meeting.updated_at,
  };
}

app.get("/api/meetings", auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.name AS organizer_name, u.email AS organizer_email
       FROM meetings m
       JOIN users u ON u.id = m.organizer_user_id
       WHERE m.organizer_user_id = $1 OR m.participant_user_ids ? $1::text
       ORDER BY m.start_at DESC`,
      [req.user.id],
    );
    const meetings = [];
    for (const meeting of result.rows) meetings.push(await meetingPayload(meeting));
    res.json({ meetings });
  } catch (error) { next(error); }
});

app.post("/api/meetings", auth, async (req, res, next) => {
  try {
    const title = String(req.body?.title || "").trim();
    const agenda = String(req.body?.agenda || "").trim();
    const startAt = String(req.body?.startAt || "").trim();
    const duration = Math.max(15, Math.min(480, Number(req.body?.durationMinutes || 60)));
    const rawEmails = Array.isArray(req.body?.participantEmails) ? req.body.participantEmails : [];
    const emails = [...new Set(rawEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))];

    if (title.length < 2) return res.status(400).json({ error: "Meeting title is required" });
    if (!startAt || Number.isNaN(new Date(startAt).getTime())) return res.status(400).json({ error: "A valid meeting date and time is required" });

    const usersResult = emails.length
      ? await pool.query("SELECT id, name, email, avatar_url FROM users WHERE email = ANY($1::text[])", [emails])
      : { rows: [] };
    const found = usersResult.rows;
    const foundEmails = new Set(found.map((u) => String(u.email).toLowerCase()));
    const missing = emails.filter((email) => !foundEmails.has(email));
    if (missing.length) {
      return res.status(400).json({ error: `These emails are not registered LifeBoost accounts: ${missing.join(", ")}` });
    }

    const participantIds = found
      .map((u) => String(u.id))
      .filter((id) => id !== String(req.user.id));

    const meetingId = randomUUID();
    const meetingUrl = `https://meet.jit.si/LifeBoost-${meetingId.replaceAll("-", "")}`;
    const result = await pool.query(
      `INSERT INTO meetings
       (id, organizer_user_id, title, agenda, start_at, duration_minutes, meeting_url, participant_user_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING *`,
      [meetingId, req.user.id, title, agenda, startAt, duration, meetingUrl, JSON.stringify(participantIds)],
    );
    const meeting = result.rows[0];
    meeting.organizer_name = req.user.name;
    meeting.organizer_email = req.user.email;
    res.status(201).json({ meeting: await meetingPayload(meeting) });
  } catch (error) { next(error); }
});

app.patch("/api/meetings/:meetingId", auth, async (req, res, next) => {
  try {
    const meeting = await canAccessMeeting(req.params.meetingId, req.user.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });

    const updates = {};
    if (req.body?.title !== undefined) updates.title = String(req.body.title).trim();
    if (req.body?.agenda !== undefined) updates.agenda = String(req.body.agenda);
    if (req.body?.startAt !== undefined) updates.start_at = String(req.body.startAt);
    if (req.body?.durationMinutes !== undefined) updates.duration_minutes = Math.max(15, Math.min(480, Number(req.body.durationMinutes)));
    if (req.body?.status !== undefined && ["Scheduled","In progress","Completed","Cancelled"].includes(String(req.body.status))) updates.status = String(req.body.status);
    if (req.body?.notes !== undefined) updates.notes = String(req.body.notes);
    if (req.body?.decisions !== undefined) updates.decisions = String(req.body.decisions);
    if (req.body?.actionItems !== undefined) {
      updates.action_items = JSON.stringify(Array.isArray(req.body.actionItems) ? req.body.actionItems : []);
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });
    if (updates.title !== undefined && updates.title.length < 2) return res.status(400).json({ error: "Meeting title is required" });

    const sets = [];
    const values = [];
    let index = 1;
    for (const [key, value] of Object.entries(updates)) {
      sets.push(`${key} = $${index++}${key === "action_items" ? "::jsonb" : ""}`);
      values.push(value);
    }
    values.push(req.params.meetingId);
    const result = await pool.query(
      `UPDATE meetings SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${index} RETURNING *`,
      values,
    );
    const updated = result.rows[0];
    const organizer = await pool.query("SELECT name,email FROM users WHERE id=$1", [updated.organizer_user_id]);
    updated.organizer_name = organizer.rows[0]?.name || "";
    updated.organizer_email = organizer.rows[0]?.email || "";
    res.json({ meeting: await meetingPayload(updated) });
  } catch (error) { next(error); }
});

app.get("/api/meetings/:meetingId/messages", auth, async (req, res, next) => {
  try {
    const meeting = await canAccessMeeting(req.params.meetingId, req.user.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    const result = await pool.query(
      `SELECT mm.id AS message_id, mm.body, mm.created_at, u.id AS user_id, u.name, u.email, u.avatar_url
       FROM meeting_messages mm JOIN users u ON u.id = mm.user_id
       WHERE mm.meeting_id = $1 ORDER BY mm.created_at ASC`,
      [req.params.meetingId],
    );
    res.json({ messages: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/meetings/:meetingId/messages", auth, async (req, res, next) => {
  try {
    const meeting = await canAccessMeeting(req.params.meetingId, req.user.id);
    if (!meeting) return res.status(404).json({ error: "Meeting not found" });
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: "Discussion message cannot be empty" });
    const result = await pool.query(
      `INSERT INTO meeting_messages (meeting_id, user_id, body) VALUES ($1,$2,$3)
       RETURNING id AS message_id, body, created_at`,
      [req.params.meetingId, req.user.id, body],
    );
    res.status(201).json({
      message: {
        ...result.rows[0],
        user_id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatar_url: req.user.avatar_url || "",
      },
    });
  } catch (error) { next(error); }
});

app.get("/api/state", auth, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [req.user.id]);
    res.json({ state: result.rows[0]?.state ?? null });
  } catch (error) { next(error); }
});

app.put("/api/state", auth, async (req, res, next) => {
  try {
    if (!req.body.state || typeof req.body.state !== "object") return res.status(400).json({ error: "Invalid state payload" });
    await pool.query(
      `INSERT INTO user_state (user_id, state) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [req.user.id, JSON.stringify(req.body.state)],
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.patch("/api/account", auth, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (name.length < 2) return res.status(400).json({ error: "Name is required" });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
    const result = await pool.query("UPDATE users SET name=$1, phone=$2, email=$3, updated_at=NOW() WHERE id=$4 RETURNING *", [name, phone, email, req.user.id]);
    res.json({ user: userDto(result.rows[0]) });
  } catch (error) { next(error); }
});

app.post("/api/account/avatar", auth, async (req, res, next) => {
  try {
    const parsed = parseMediaDataUrl(req.body.dataUrl);
    if (!parsed || parsed.media_type !== "image") {
      return res.status(400).json({ error: "Use a JPG, PNG, WEBP or GIF image up to 6MB." });
    }
    const dir = path.join(avatarUploadRoot, req.user.id);
    fs.mkdirSync(dir, { recursive: true });
    // Remove any previous avatar files for this user before writing the new one.
    for (const existing of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, existing));
    const filename = `${crypto.randomUUID()}.${parsed.ext}`;
    fs.writeFileSync(path.join(dir, filename), parsed.buffer);
    const avatarUrl = `/uploads/avatars/${encodeURIComponent(req.user.id)}/${filename}`;
    const result = await pool.query("UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *", [avatarUrl, req.user.id]);
    res.json({ user: userDto(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete("/api/account/avatar", auth, async (req, res, next) => {
  try {
    const dir = path.join(avatarUploadRoot, req.user.id);
    if (fs.existsSync(dir)) {
      for (const existing of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, existing));
    }
    const result = await pool.query("UPDATE users SET avatar_url='', updated_at=NOW() WHERE id=$1 RETURNING *", [req.user.id]);
    res.json({ user: userDto(result.rows[0]) });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Server error" });
});

const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
pool.query(schema)
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`LifeBoost API running on http://localhost:${PORT}`)))
  .catch((error) => { console.error("Database initialization failed", error); process.exit(1); });
