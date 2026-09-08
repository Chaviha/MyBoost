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
const PORT = Number(process.env.API_PORT || 3001);
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
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
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
    if (mailer) {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || "LifeBoost <no-reply@lifeboost.ke>",
        to: email,
        subject: "Reset your LifeBoost password",
        text: `Reset your LifeBoost password using this link. It expires in ${RESET_MINUTES} minutes: ${resetUrl}`,
        html: `<p>Reset your LifeBoost password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in ${RESET_MINUTES} minutes and can only be used once.</p>`,
      });
    } else if (!isProduction || process.env.LOG_RESET_LINKS === "true") {
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

    for (const row of result.rows) {
      const state = row.state || {};
      const listedBusinesses = Array.isArray(state.businesses) ? state.businesses.filter((b) => b?.listed && !["BUS001", "BUS002"].includes(b.business_id) && !["Felix Hardware", "Garden Kitchen"].includes(b.business_name)) : [];
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
        if (asset?.listed && businessMap.has(asset.business_id)) {
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
    }

    res.json({ businesses, professionals, assets });
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
