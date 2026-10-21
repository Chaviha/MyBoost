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

// Cloudflare R2 is S3-compatible. When configured, uploads go to durable object
// storage; otherwise local development keeps using the existing /uploads folder.
const r2Enabled = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL);
const r2Endpoint = r2Enabled ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";
const r2PublicBase = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
function awsEncode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`); }
function r2ObjectUrl(key) { return `${r2PublicBase}/${key.split("/").map(awsEncode).join("/")}`; }
async function r2Request(method, key, body, contentType = "application/octet-stream") {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const encodedKey = key.split("/").map(awsEncode).join("/");
  const url = `${r2Endpoint}/${awsEncode(process.env.R2_BUCKET_NAME)}/${encodedKey}`;
  const payloadHash = crypto.createHash("sha256").update(body || Buffer.alloc(0)).digest("hex");
  const host = new URL(url).host;
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `${method}\n/${awsEncode(process.env.R2_BUCKET_NAME)}/${encodedKey}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const kDate = hmac(`AWS4${process.env.R2_SECRET_ACCESS_KEY}`, date);
  const kRegion = crypto.createHmac("sha256", kDate).update("auto").digest();
  const kService = crypto.createHmac("sha256", kRegion).update("s3").digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${process.env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(url, { method, headers: { "content-type": contentType, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, authorization }, ...(method === "PUT" ? { body } : {}) });
  if (!response.ok) throw new Error(`Cloudflare R2 ${method} failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
}
async function saveUpload(key, localPath, buffer, contentType) {
  if (r2Enabled) { await r2Request("PUT", key, buffer, contentType); return r2ObjectUrl(key); }
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buffer);
  return null;
}
async function removeUpload(key, localPath) {
  if (r2Enabled) { await r2Request("DELETE", key, Buffer.alloc(0)); return; }
  if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, "..", "uploads", "businesses");
const assetUploadRoot = path.join(__dirname, "..", "uploads", "assets");
const productUploadRoot = path.join(__dirname, "..", "uploads", "products");
const employeeUploadRoot = path.join(__dirname, "..", "uploads", "employees");
const avatarUploadRoot = path.join(__dirname, "..", "uploads", "avatars");
fs.mkdirSync(uploadRoot, { recursive: true });
fs.mkdirSync(assetUploadRoot, { recursive: true });
fs.mkdirSync(productUploadRoot, { recursive: true });
fs.mkdirSync(employeeUploadRoot, { recursive: true });
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

const cookieName = process.env.SESSION_COOKIE_NAME || "lifeBoostSME_session";
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
          from: process.env.SMTP_FROM || "lifeBoostSME <no-reply@lifeBoostSME.ke>",
          to: email,
          subject: "Reset your lifeBoostSME password",
          text: `Reset your lifeBoostSME password using this link. It expires in ${RESET_MINUTES} minutes: ${resetUrl}`,
          html: `<p>Reset your lifeBoostSME password.</p><p><a href="${resetUrl}">Reset password</a></p><p>This link expires in ${RESET_MINUTES} minutes and can only be used once.</p>`,
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


async function productFromState(userId, productId) {
  const result = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [userId]);
  const state = result.rows[0]?.state;
  const product = state?.products?.find((p) => p.product_id === productId);
  if (!product) return null;
  const user = state?.users?.find((u) => u.user_id === userId);
  const isAdmin = user?.account_level === "admin";
  const ownsBusiness = product.business_id
    ? state?.businesses?.some((b) => b.business_id === product.business_id && b.owner_user_id === userId)
    : false;
  if (isAdmin || ownsBusiness) return { state, product };
  return null;
}


async function employeeFromState(userId, employeeId) {
  const result = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [userId]);
  const state = result.rows[0]?.state;
  const employee = state?.employees?.find((e) => e.employee_id === employeeId);
  if (!employee) return null;
  const user = state?.users?.find((u) => u.user_id === userId);
  const isAdmin = user?.account_level === "admin";
  const ownsBusiness = employee.business_id
    ? state?.businesses?.some((b) => b.business_id === employee.business_id && b.owner_user_id === userId)
    : false;
  if (isAdmin || ownsBusiness) return { state, employee };
  return null;
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
    const storageKey = `businesses/${businessId}/${filename}`;
    const storedUrl = await saveUpload(storageKey, path.join(dir, filename), parsed.buffer, parsed.mime);
    const media = {
      media_id: mediaId,
      ...(r2Enabled ? { storage_key: storageKey } : {}),
      url: storedUrl || `/uploads/businesses/${encodeURIComponent(businessId)}/${filename}`,
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
    const filePath = path.join(uploadRoot, businessId, path.basename(new URL(media.url, "http://localhost").pathname));
    if (media.storage_key) await removeUpload(media.storage_key, filePath); else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
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
    const storageKey = `assets/${assetId}/${filename}`;
    const storedUrl = await saveUpload(storageKey, path.join(dir, filename), parsed.buffer, parsed.mime);
    const media = {
      media_id: mediaId,
      ...(r2Enabled ? { storage_key: storageKey } : {}),
      url: storedUrl || `/uploads/assets/${encodeURIComponent(assetId)}/${filename}`,
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
    const filePath = path.join(assetUploadRoot, assetId, path.basename(new URL(media.url, "http://localhost").pathname));
    if (media.storage_key) await removeUpload(media.storage_key, filePath); else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const remaining = gallery.filter((item) => item.media_id !== mediaId);
    const image_url = remaining.find((item) => item.media_type === "image")?.url || "";
    const nextState = { ...access.state, assets: access.state.assets.map((a) => a.asset_id === assetId ? { ...a, gallery: remaining, image_url } : a) };
    await pool.query(`UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2`, [JSON.stringify(nextState), req.user.id]);
    res.json({ ok: true, image_url });
  } catch (error) { next(error); }
});



app.post("/api/employees/:employeeId/media", auth, async (req, res, next) => {
  try {
    const employeeId = String(req.params.employeeId || "");
    const access = await employeeFromState(req.user.id, employeeId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this professional" });
    const parsed = parseMediaDataUrl(req.body.dataUrl);
    if (!parsed) return res.status(400).json({ error: "Invalid file. Use JPG, PNG, WEBP or GIF images up to 6MB, or MP4/WEBM/MOV videos up to 40MB." });
    const mediaId = crypto.randomUUID();
    const filename = `${mediaId}.${parsed.ext}`;
    const dir = path.join(employeeUploadRoot, employeeId);
    const storageKey = `employees/${employeeId}/${filename}`;
    const storedUrl = await saveUpload(storageKey, path.join(dir, filename), parsed.buffer, parsed.mime);
    const media = {
      media_id: mediaId,
      ...(r2Enabled ? { storage_key: storageKey } : {}),
      url: storedUrl || `/uploads/employees/${encodeURIComponent(employeeId)}/${filename}`,
      name: safeFilename(req.body.name || filename),
      media_type: parsed.media_type,
      created_at: new Date().toISOString(),
    };
    const nextState = {
      ...access.state,
      employees: access.state.employees.map((e) =>
        e.employee_id === employeeId
          ? {
              ...e,
              gallery: [...(Array.isArray(e.gallery) ? e.gallery : []), media],
              image_url: e.image_url || (media.media_type === "image" ? media.url : e.image_url),
            }
          : e,
      ),
    };
    await pool.query(`INSERT INTO user_state (user_id, state) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()`, [req.user.id, JSON.stringify(nextState)]);
    res.status(201).json({ media });
  } catch (error) { next(error); }
});

app.delete("/api/employees/:employeeId/media/:mediaId", auth, async (req, res, next) => {
  try {
    const employeeId = String(req.params.employeeId || "");
    const mediaId = String(req.params.mediaId || "");
    const access = await employeeFromState(req.user.id, employeeId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this professional" });
    const employee = access.employee;
    const gallery = Array.isArray(employee.gallery) ? employee.gallery : [];
    const media = gallery.find((item) => item.media_id === mediaId);
    if (!media) return res.status(404).json({ error: "File not found" });
    try {
      const filePath = path.join(employeeUploadRoot, employeeId, path.basename(new URL(media.url, "http://local").pathname));
      if (media.storage_key) await removeUpload(media.storage_key, filePath);
      else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) { /* ignore cleanup errors */ }
    const remaining = gallery.filter((item) => item.media_id !== mediaId);
    const image_url = remaining.find((item) => item.media_type === "image")?.url || "";
    const nextState = {
      ...access.state,
      employees: access.state.employees.map((e) =>
        e.employee_id === employeeId ? { ...e, gallery: remaining, image_url } : e,
      ),
    };
    await pool.query(`UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2`, [JSON.stringify(nextState), req.user.id]);
    res.json({ ok: true, image_url });
  } catch (error) { next(error); }
});

app.post("/api/products/:productId/media", auth, async (req, res, next) => {
  try {
    const productId = String(req.params.productId || "");
    const access = await productFromState(req.user.id, productId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this product" });
    const parsed = parseMediaDataUrl(req.body.dataUrl);
    if (!parsed) return res.status(400).json({ error: "Invalid file. Use JPG, PNG, WEBP or GIF images up to 6MB, or MP4/WEBM/MOV videos up to 40MB." });
    const mediaId = crypto.randomUUID();
    const filename = `${mediaId}.${parsed.ext}`;
    const dir = path.join(productUploadRoot, productId);
    const storageKey = `products/${productId}/${filename}`;
    const storedUrl = await saveUpload(storageKey, path.join(dir, filename), parsed.buffer, parsed.mime);
    const media = {
      media_id: mediaId,
      ...(r2Enabled ? { storage_key: storageKey } : {}),
      url: storedUrl || `/uploads/products/${encodeURIComponent(productId)}/${filename}`,
      name: safeFilename(req.body.name || filename),
      media_type: parsed.media_type,
      created_at: new Date().toISOString(),
    };
    const nextState = {
      ...access.state,
      products: access.state.products.map((p) =>
        p.product_id === productId
          ? {
              ...p,
              gallery: [...(Array.isArray(p.gallery) ? p.gallery : []), media],
              image_url: p.image_url || (media.media_type === "image" ? media.url : p.image_url),
            }
          : p,
      ),
    };
    await pool.query(`INSERT INTO user_state (user_id, state) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()`, [req.user.id, JSON.stringify(nextState)]);
    res.status(201).json({ media });
  } catch (error) { next(error); }
});

app.delete("/api/products/:productId/media/:mediaId", auth, async (req, res, next) => {
  try {
    const productId = String(req.params.productId || "");
    const mediaId = String(req.params.mediaId || "");
    const access = await productFromState(req.user.id, productId);
    if (!access) return res.status(403).json({ error: "You do not have permission to manage this product" });
    const product = access.product;
    const gallery = Array.isArray(product.gallery) ? product.gallery : [];
    const media = gallery.find((item) => item.media_id === mediaId);
    if (!media) return res.status(404).json({ error: "File not found" });
    const filePath = path.join(productUploadRoot, productId, path.basename(new URL(media.url, "http://localhost").pathname));
    if (media.storage_key) await removeUpload(media.storage_key, filePath); else if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const remaining = gallery.filter((item) => item.media_id !== mediaId);
    const image_url = remaining.find((item) => item.media_type === "image")?.url || "";
    const nextState = {
      ...access.state,
      products: access.state.products.map((p) =>
        p.product_id === productId ? { ...p, gallery: remaining, image_url } : p,
      ),
    };
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
            notes: employee.notes || "",
            image_url: employee.image_url || "",
            gallery: Array.isArray(employee.gallery) ? employee.gallery : [],
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
      // any sector). Every active product is available for quotations by default —
      // no separate "list for quotations" flag. Business directory listing is separate.
      const businessNameById = new Map(allBusinesses.map((b) => [b.business_id, b.business_name]));
      for (const product of Array.isArray(state.products) ? state.products : []) {
        if (
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
            specs: product.specs && typeof product.specs === "object" ? product.specs : {},
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

/** Find a quotation by public share_token across all user_state blobs.
 * Prefer the business owner's copy (source of truth). After owner→customer sync
 * the same share_token can exist on both accounts — never treat the customer's
 * mirror as the primary record for accept/reject/email. */
async function findQuoteByShareToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  const rows = await pool.query("SELECT user_id, state FROM user_state");
  const matches = [];
  for (const row of rows.rows) {
    const state = row.state || {};
    const quotes = Array.isArray(state.quotations) ? state.quotations : [];
    const quote = quotes.find((q) => q && q.share_token === t);
    if (!quote) continue;
    const business = Array.isArray(state.businesses)
      ? state.businesses.find((b) => b.business_id === quote.business_id)
      : null;
    const customer = Array.isArray(state.customers)
      ? state.customers.find((c) => c.customer_id === quote.customer_id)
      : null;
    const isOwner =
      business && String(business.owner_user_id || "") === String(row.user_id);
    matches.push({ userId: row.user_id, state, quote, business, customer, isOwner: !!isOwner });
  }
  if (!matches.length) return null;
  const preferred = matches.find((m) => m.isOwner) || matches[0];
  return {
    userId: preferred.userId,
    state: preferred.state,
    quote: preferred.quote,
    business: preferred.business,
    customer: preferred.customer,
  };
}

function dueStatusServer(dueDate, amount) {
  const n = Number(amount || 0);
  if (n <= 0) return "Paid";
  if (!dueDate) return "Pending";
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return "Pending";
  return due < Date.now() ? "Overdue" : "Pending";
}

/** Public: customer views quotation without login */
app.get("/api/public/quote/:token", async (req, res, next) => {
  try {
    const found = await findQuoteByShareToken(req.params.token);
    if (!found) return res.status(404).json({ error: "Quotation not found or link expired." });
    const { quote, business } = found;
    res.json({
      quote: {
        quote_id: quote.quote_id,
        customer_name: quote.customer_name,
        total: quote.total,
        status: quote.status,
        date: quote.date,
        notes: quote.notes || "",
        quote_type: quote.quote_type || "general",
        line_items: Array.isArray(quote.line_items) ? quote.line_items : [],
      },
      business: {
        business_name: business?.business_name || "Business",
        phone: business?.phone || "",
        email: business?.email || "",
        region: business?.region || "",
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Public: customer Accept / Reject.
 * Accept posts charge to customer tab + ledger (same rules as in-app accept).
 */
app.post("/api/public/quote/:token/respond", async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || "").toLowerCase();
    if (decision !== "accept" && decision !== "reject") {
      return res.status(400).json({ error: "decision must be accept or reject" });
    }
    const found = await findQuoteByShareToken(req.params.token);
    if (!found) return res.status(404).json({ error: "Quotation not found or link expired." });
    const { userId, state, quote } = found;
    if (quote.status === "Accepted") {
      return res.json({ ok: true, status: "Accepted", message: "Already accepted." });
    }
    if (quote.status === "Rejected" && decision === "accept") {
      return res.status(400).json({ error: "This quotation was rejected and cannot be accepted." });
    }
    if (quote.status === "Rejected") {
      return res.json({ ok: true, status: "Rejected", message: "Already rejected." });
    }

    const quotes = Array.isArray(state.quotations) ? state.quotations : [];
    const qIndex = quotes.findIndex((q) => q.quote_id === quote.quote_id);
    if (qIndex < 0) return res.status(404).json({ error: "Quotation not found." });

    if (decision === "reject") {
      quotes[qIndex] = { ...quotes[qIndex], status: "Rejected" };
      state.quotations = quotes;
      await pool.query(
        "UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2",
        [JSON.stringify(state), userId],
      );
      return res.json({ ok: true, status: "Rejected" });
    }

    // accept
    const total = Number(quote.total || 0);
    const customers = Array.isArray(state.customers) ? state.customers : [];
    const cIndex = customers.findIndex((c) => c.customer_id === quote.customer_id);
    let ledger = Array.isArray(state.ledger) ? state.ledger : [];
    const alreadyCharged = ledger.some(
      (e) =>
        e &&
        e.type === "charge" &&
        e.reference_type === "quotation" &&
        e.reference_id === quote.quote_id,
    );

    if (cIndex >= 0 && total > 0 && !alreadyCharged) {
      const customer = customers[cIndex];
      const nextAmount = Number(customer.amount || 0) + total;
      customers[cIndex] = {
        ...customer,
        amount: nextAmount,
        status: dueStatusServer(customer.due_date, nextAmount),
      };
      ledger = [
        {
          entry_id: `LED${Date.now().toString(36)}`,
          business_id: customer.business_id,
          customer_id: customer.customer_id,
          type: "charge",
          amount: total,
          description: `Quotation ${quote.quote_id}${quote.notes ? ` — ${quote.notes}` : ""}`,
          product_id: "",
          qty: 1,
          posted_by: "customer",
          date: new Date().toISOString(),
          reference_id: quote.quote_id,
          reference_type: "quotation",
        },
        ...ledger,
      ];
      state.customers = customers;
      state.ledger = ledger;
    }

    quotes[qIndex] = { ...quotes[qIndex], status: "Accepted" };
    state.quotations = quotes;
    await pool.query(
      "UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2",
      [JSON.stringify(state), userId],
    );
    res.json({ ok: true, status: "Accepted" });
  } catch (error) {
    next(error);
  }
});

/** Optional: email the review link to the customer (uses SMTP if configured). */
app.post("/api/public/quote/:token/email", async (req, res, next) => {
  try {
    const found = await findQuoteByShareToken(req.params.token);
    if (!found) return res.status(404).json({ error: "Quotation not found." });
    const to =
      String(req.body?.to || found.customer?.email || "").trim() ||
      "";
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
      return res.status(400).json({ error: "Customer has no valid email. Add email on the customer or pass to=." });
    }
    const origin = String(req.body?.origin || process.env.APP_ORIGIN || "").replace(/\/$/, "");
    const link = origin
      ? `${origin}/quote/${encodeURIComponent(req.params.token)}`
      : `/quote/${encodeURIComponent(req.params.token)}`;
    const biz = found.business?.business_name || "Business";
    const total = Number(found.quote.total || 0).toLocaleString("en-KE");
    if (!mailer) {
      return res.status(503).json({
        error: "Email is not configured (set SMTP_HOST). Use WhatsApp or copy link instead.",
        link,
      });
    }
    await mailer.sendMail({
      from: process.env.SMTP_FROM || "lifeBoostSME <no-reply@lifeBoostSME.ke>",
      to,
      subject: `Quotation from ${biz} — please review`,
      text: `Hello ${found.quote.customer_name},\n\n${biz} sent you a quotation totaling KSh ${total}.\n\nReview and accept or reject here:\n${link}\n\nThank you.`,
      html: `<p>Hello ${found.quote.customer_name},</p>
        <p><strong>${biz}</strong> sent you a quotation totaling <strong>KSh ${total}</strong>.</p>
        <p><a href="${link}">Review &amp; Accept quotation</a></p>
        <p style="color:#666;font-size:12px">If the button does not work, copy this link:<br/>${link}</p>`,
    });
    res.json({ ok: true, to, link });
  } catch (error) {
    next(error);
  }
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

    // The person may not have created a lifeBoostSME account yet. Do not create
    // a fake user in the owner's JSON blob; the invite can simply be retried
    // after the person registers.
    if (!targetUser) {
      return res.json({
        linked: false,
        userId: "",
        message: "No active lifeBoostSME account exists for that email yet.",
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
      message: "Invitation and offer delivered to the user's lifeBoostSME account.",
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


// Smart Collection preferences and customer reminders.
app.get("/api/collections/settings", auth, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT state->'collection_settings' AS settings FROM user_state WHERE user_id=$1", [req.user.id]);
    res.json({ settings: result.rows[0]?.settings || { channel: "lifeBoostSME", timing: "before", days: 3 } });
  } catch (error) { next(error); }
});

app.put("/api/collections/settings", auth, async (req, res, next) => {
  try {
    const channel = ["lifeBoostSME", "whatsapp", "both"].includes(String(req.body?.channel)) ? String(req.body.channel) : "lifeBoostSME";
    const timing = ["before", "due", "overdue"].includes(String(req.body?.timing)) ? String(req.body.timing) : "before";
    const days = Math.max(1, Math.min(30, Number(req.body?.days || 3)));
    const settings = { channel, timing, days };
    await pool.query(
      `INSERT INTO user_state (user_id, state) VALUES ($1, jsonb_build_object('collection_settings', $2::jsonb))
       ON CONFLICT (user_id) DO UPDATE SET state=jsonb_set(COALESCE(user_state.state, '{}'::jsonb), '{collection_settings}', $2::jsonb, true), updated_at=NOW()`,
      [req.user.id, JSON.stringify(settings)],
    );
    res.json({ settings });
  } catch (error) { next(error); }
});

app.get("/api/notifications", auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, title, body AS detail, href, created_at, read_at FROM app_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 40",
      [req.user.id],
    );
    res.json({ notifications: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/collections/:customerId/remind", auth, async (req, res, next) => {
  try {
    const stateResult = await pool.query("SELECT state FROM user_state WHERE user_id=$1", [req.user.id]);
    const state = stateResult.rows[0]?.state || {};
    const customer = (Array.isArray(state.customers) ? state.customers : []).find((item) => String(item.customer_id) === String(req.params.customerId));
    const ownsBusiness = customer && (Array.isArray(state.businesses) ? state.businesses : []).some((business) =>
      String(business.business_id) === String(customer.business_id) && String(business.owner_user_id || req.user.id) === String(req.user.id)
    );
    if (!customer || !ownsBusiness) return res.status(404).json({ error: "Customer not found in your business." });
    const channel = ["lifeBoostSME", "whatsapp", "both"].includes(String(req.body?.channel)) ? String(req.body.channel) : "lifeBoostSME";
    if ((channel === "lifeBoostSME" || channel === "both") && !customer.user_id) {
      return res.status(400).json({ error: "Link this customer to a lifeBoostSME account to send an in-app notification. WhatsApp-only reminders do not require an account." });
    }
    const amount = Number(customer.amount || 0);
    const dueDate = customer.due_date ? new Date(customer.due_date).toLocaleDateString() : "the agreed date";
    const message = `Hello ${String(customer.name || "Customer")}, this is a payment reminder for ${amount.toFixed(2)}. Due date: ${dueDate}. Please contact the business if you have already paid.`;
    let notificationCreated = false;
    if (channel === "lifeBoostSME" || channel === "both") {
      await pool.query(
        "INSERT INTO app_notifications (user_id, title, body, href) VALUES ($1,$2,$3,$4)",
        [customer.user_id, "Payment reminder", message, "/tab"],
      );
      notificationCreated = true;
    }
    let phone = String(customer.phone || "").replace(/[^0-9]/g, "");
    if (phone.startsWith("0")) phone = `254${phone.slice(1)}`;
    else if (phone.length === 9 && !phone.startsWith("254")) phone = `254${phone}`;
    const whatsapp = channel === "whatsapp" || channel === "both"
      ? (phone ? { phone, message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` } : null)
      : null;
    if ((channel === "whatsapp" || channel === "both") && !whatsapp) {
      return res.status(400).json({ error: "Add a valid customer phone number before sending a WhatsApp reminder." });
    }
    res.json({ ok: true, notificationCreated, whatsapp });
  } catch (error) { next(error); }
});

// Shared Meetings & Discussions. Meetings live in their own tables so invited
// participants can see the same meeting even though lifeBoostSME business data
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
      return res.status(400).json({ error: `These emails are not registered lifeBoostSME accounts: ${missing.join(", ")}` });
    }

    const participantIds = found
      .map((u) => String(u.id))
      .filter((id) => id !== String(req.user.id));

    const meetingId = randomUUID();
    const meetingUrl = `https://meet.jit.si/lifeBoostSME-${meetingId.replaceAll("-", "")}`;
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

app.delete("/api/meetings/:meetingId", auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "DELETE FROM meetings WHERE id = $1 AND organizer_user_id = $2 RETURNING id",
      [req.params.meetingId, req.user.id],
    );
    if (!result.rowCount) {
      const exists = await canAccessMeeting(req.params.meetingId, req.user.id);
      return res.status(exists ? 403 : 404).json({
        error: exists ? "Only the meeting organizer can delete this meeting." : "Meeting not found",
      });
    }
    res.json({ ok: true, meetingId: req.params.meetingId });
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



// AI-assisted quotation brief. Requires a server-side OPENAI_API_KEY; never expose it in the browser.
app.post("/api/ai/quote-assist", auth, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "AI assistant is not configured yet. Add OPENAI_API_KEY to the backend environment and restart the server." });
    }
    const requestText = String(req.body?.request || "").trim().slice(0, 6000);
    const details = String(req.body?.details || "").trim().slice(0, 4000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5) : [];
    if (!requestText) return res.status(400).json({ error: "Describe the item or job you want quoted." });
    const content = [{
      type: "text",
      text: `Help prepare a fabrication quotation brief, not a fabricated final price. User request: ${requestText}\nAdditional details: ${details || "None provided"}. Review any supplied images for visible features and readable dimensions. Return: 1) your understanding of the item, 2) visible/confirmed dimensions, 3) missing questions to ask before pricing, 4) likely materials and operations as suggestions only, 5) a checklist of inputs needed to calculate material, cutting, welding/labour, finish/paint, transport and delivery. Never invent dimensions, catalogue prices, weights or lead times. Clearly distinguish observations from assumptions. For PDFs, CAD or unsupported attachments, state that the file may need manual review and do not claim to have parsed it.`
    }];
    for (const file of attachments) {
      if (!file || typeof file.data !== "string" || file.data.length > 11_000_000) continue;
      if (/^data:image\/(png|jpeg|webp);base64,/i.test(file.data)) {
        content.push({ type: "image_url", image_url: { url: file.data, detail: "high" } });
        content.push({ type: "text", text: `Image attachment: ${String(file.name || "image").slice(0, 200)}` });
      } else {
        content.push({ type: "text", text: `Attachment ${String(file.name || "file").slice(0, 200)} (${String(file.type || "unknown type")}): this endpoint cannot inspect this file format directly. Ask the user to provide screenshots/images or confirm dimensions manually.` });
      }
    }
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages: [{ role: "system", content: "You are lifeBoostSME's careful fabrication quotation assistant. Be practical, clear and safety-conscious. Never invent prices or imply a quote is saved." }, { role: "user", content }], temperature: 0.2, max_tokens: 1400 })
    });
    const payload = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error("AI quote assistant provider error:", aiResponse.status, payload?.error?.message || "unknown");
      return res.status(502).json({ error: "The AI assistant could not process this request. Check the backend AI configuration and try again." });
    }
    return res.json({ answer: payload.choices?.[0]?.message?.content || "No response was returned." });
  } catch (error) {
    console.error("AI quote assistant error:", error);
    return res.status(500).json({ error: "AI assistant encountered an unexpected error." });
  }
});

/**
 * Owner -> linked customer sync.
 * Each account keeps its own private user_state row, so edits an owner makes to a
 * customer (details, charges, payments, charge mode, deletion) never reach the
 * customer's own row unless we write them there. The owner's client calls this
 * whenever its linked customers or their ledger change.
 */
const CUSTOMER_STATUSES = new Set(["Pending", "Due soon", "Overdue", "Paid"]);
const CHARGE_MODES = new Set(["owner", "customer", "both"]);

/** Customer -> business owner payment sync.
 * A linked customer may submit only their own payment ledger entries. The server
 * validates the accepted relationship and owner-side customer tab, applies each
 * payment once (entry_id idempotency), and updates the owner's balance + ledger.
 */
app.post("/api/customers/payment-sync", auth, async (req, res, next) => {
  const payments = Array.isArray(req.body?.payments) ? req.body.payments.slice(0, 500) : [];
  if (!payments.length) return res.json({ ok: true, applied: 0 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerRow = await client.query("SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE", [req.user.id]);
    const customerState = customerRow.rows[0]?.state;
    if (!customerState) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Customer account state not found" }); }
    const relationships = Array.isArray(customerState.relationships) ? customerState.relationships : [];
    const businesses = Array.isArray(customerState.businesses) ? customerState.businesses : [];
    let applied = 0;
    for (const payment of payments) {
      const businessId = String(payment?.business_id || "");
      const entryId = String(payment?.entry_id || "");
      const amount = Number(payment?.amount);
      if (!businessId || !entryId || payment?.type !== "payment" || String(payment?.posted_by) !== String(req.user.id) || !Number.isFinite(amount) || amount <= 0) continue;
      const relationship = relationships.find((r) => r?.business_id === businessId && r?.relationship_type === "customer" && String(r?.status || "").toLowerCase() === "active");
      const business = businesses.find((b) => b?.business_id === businessId && b?.owner_user_id);
      if (!relationship || !business) continue;
      const ownerId = String(business.owner_user_id);
      const ownerRow = await client.query("SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE", [ownerId]);
      const ownerState = ownerRow.rows[0]?.state;
      if (!ownerState) continue;
      const ownerCustomers = Array.isArray(ownerState.customers) ? ownerState.customers : [];
      const tabIndex = ownerCustomers.findIndex((c) => c?.business_id === businessId && String(c?.user_id) === String(req.user.id));
      if (tabIndex < 0) continue;
      const ownerTab = ownerCustomers[tabIndex];
      if (ownerTab.allow_customer_payments !== true) continue; // owner has not enabled customer payment updates
      ownerState.ledger = Array.isArray(ownerState.ledger) ? ownerState.ledger : [];
      if (ownerState.ledger.some((e) => e?.entry_id === entryId)) continue;
      const paid = Math.min(Number(ownerTab.amount || 0), amount);
      if (paid <= 0) continue;
      const nextAmount = Math.max(0, Number(ownerTab.amount || 0) - paid);
      const dueDate = String(ownerTab.due_date || "");
      const status = nextAmount <= 0 ? "Paid" : dueDate && new Date(dueDate) < new Date() ? "Overdue" : dueDate && (new Date(dueDate).getTime() - Date.now()) <= 7 * 86400000 ? "Due soon" : "Pending";
      ownerCustomers[tabIndex] = { ...ownerTab, amount: nextAmount, status };
      ownerState.customers = ownerCustomers;
      ownerState.ledger.unshift({
        entry_id: entryId, business_id: businessId, customer_id: ownerTab.customer_id,
        type: "payment", amount: paid,
        description: String(payment.description || "Payment recorded by customer"),
        product_id: "", qty: 0, posted_by: req.user.id,
        date: String(payment.date || new Date().toISOString()),
        via: "customer-sync",
      });
      await client.query("UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2", [JSON.stringify(ownerState), ownerId]);
      applied += 1;
    }
    await client.query("COMMIT");
    return res.json({ ok: true, applied });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally { client.release(); }
});

app.post("/api/customers/sync", auth, async (req, res, next) => {
  try {
    const customers = Array.isArray(req.body?.customers) ? req.body.customers.slice(0, 500) : [];
    const ledger = Array.isArray(req.body?.ledger) ? req.body.ledger.slice(0, 20000) : [];
    const removed = Array.isArray(req.body?.removed) ? req.body.removed.slice(0, 500) : [];
    const quotations = Array.isArray(req.body?.quotations) ? req.body.quotations.slice(0, 2000) : [];

    // The caller may only push data for businesses they own in their own state.
    const ownerRow = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [req.user.id]);
    const ownerState = ownerRow.rows[0]?.state;
    const owned = new Set(
      (Array.isArray(ownerState?.businesses) ? ownerState.businesses : [])
        .filter((b) => b?.owner_user_id === req.user.id)
        .map((b) => b.business_id),
    );

    // Map owner customer_id -> quotes for that tab
    const quotesByOwnerCustomerId = new Map();
    for (const q of quotations) {
      if (!q?.quote_id || !q?.customer_id || !owned.has(q.business_id)) continue;
      const list = quotesByOwnerCustomerId.get(q.customer_id) || [];
      list.push(q);
      quotesByOwnerCustomerId.set(q.customer_id, list);
    }

    const targets = new Map(); // userId -> { upserts: [], removals: [] }
    const bucket = (id) => {
      if (!targets.has(id)) targets.set(id, { upserts: [], removals: [] });
      return targets.get(id);
    };
    for (const c of customers) {
      if (!c?.user_id || c.user_id === req.user.id || !owned.has(c.business_id)) continue;
      bucket(String(c.user_id)).upserts.push(c);
    }
    for (const r of removed) {
      if (!r?.user_id || r.user_id === req.user.id || !owned.has(r.business_id)) continue;
      bucket(String(r.user_id)).removals.push(r);
    }

    let synced = 0;
    for (const [targetUserId, { upserts, removals }] of targets) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const row = await client.query("SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE", [targetUserId]);
        const target = row.rows[0]?.state;
        if (!target) { await client.query("ROLLBACK"); continue; }
        target.customers = Array.isArray(target.customers) ? target.customers : [];
        target.ledger = Array.isArray(target.ledger) ? target.ledger : [];
        target.relationships = Array.isArray(target.relationships) ? target.relationships : [];
        target.quotations = Array.isArray(target.quotations) ? target.quotations : [];

        for (const c of upserts) {
          // Only sync once the customer accepted the invitation (that creates their tab).
          const accepted = target.relationships.some(
            (r) =>
              r?.user_id === targetUserId &&
              r.business_id === c.business_id &&
              r.relationship_type === "customer" &&
              String(r.status || "").toLowerCase() === "active",
          );
          if (!accepted) continue;

          const fields = {
            name: String(c.name ?? ""),
            phone: String(c.phone ?? ""),
            email: String(c.email ?? ""),
            amount: Number.isFinite(Number(c.amount)) ? Number(c.amount) : 0,
            due_date: String(c.due_date ?? ""),
            type: String(c.type ?? "individual"),
            status: CUSTOMER_STATUSES.has(c.status) ? c.status : "Pending",
            charge_mode: CHARGE_MODES.has(c.charge_mode) ? c.charge_mode : "both",
            // Owner-controlled switch: without it the customer's copy never learns it may record payments.
            allow_customer_payments: c.allow_customer_payments === true,
          };
          // The customer's copy was created on acceptance with a DIFFERENT customer_id,
          // so match on user + business, and re-key ledger rows to the customer's id.
          let tab = target.customers.find((x) => x?.user_id === targetUserId && x.business_id === c.business_id);
          if (tab) Object.assign(tab, fields);
          else {
            tab = { customer_id: c.customer_id, business_id: c.business_id, user_id: targetUserId, ...fields };
            target.customers.push(tab);
          }
          const byId = new Map(target.ledger.map((e) => [e?.entry_id, e]));
          for (const e of ledger) {
            if (e?.customer_id !== c.customer_id || !e.entry_id) continue;
            byId.set(e.entry_id, { ...e, customer_id: tab.customer_id });
          }
          target.ledger = [...byId.values()].sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));

          // Upsert quotations for this customer tab (re-key customer_id to the customer's local id).
          const ownerQuotes = quotesByOwnerCustomerId.get(c.customer_id) || [];
          if (ownerQuotes.length) {
            const qById = new Map(target.quotations.map((q) => [q?.quote_id, q]));
            for (const q of ownerQuotes) {
              if (!q?.quote_id) continue;
              // Prefer owner's terminal status if both have one; otherwise take owner copy.
              const existing = qById.get(q.quote_id);
              const ownerStatus = String(q.status || "Sent");
              const localStatus = existing ? String(existing.status || "") : "";
              // Owner is source of truth for Sent/Accepted/Rejected from business side.
              qById.set(q.quote_id, {
                ...q,
                customer_id: tab.customer_id,
                status: ownerStatus || localStatus || "Sent",
              });
            }
            target.quotations = [...qById.values()].sort((a, b) =>
              String(b?.date || "").localeCompare(String(a?.date || "")),
            );
          }
          synced += 1;
        }

        for (const r of removals) {
          const gone = target.customers.filter((x) => x?.user_id === targetUserId && x.business_id === r.business_id);
          const goneIds = new Set(gone.map((x) => x.customer_id));
          target.customers = target.customers.filter((x) => !goneIds.has(x?.customer_id));
          target.ledger = target.ledger.filter((e) => !goneIds.has(e?.customer_id));
          target.quotations = target.quotations.filter((q) => !goneIds.has(q?.customer_id));
          synced += 1;
        }

        await client.query("UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2", [JSON.stringify(target), targetUserId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    res.json({ ok: true, synced });
  } catch (error) { next(error); }
});

app.get("/api/state", auth, async (req, res, next) => {
  try {
    const result = await pool.query("SELECT state FROM user_state WHERE user_id = $1", [req.user.id]);
    res.json({ state: result.rows[0]?.state ?? null });
  } catch (error) { next(error); }
});

/**
 * Other accounts change an owner's row directly (a customer's payment, an employee's job status).
 * An owner's browser may still hold an older copy, so before saving we re-apply anything that
 * was written server-side and is missing from the incoming copy. Both merges are idempotent.
 */
function reconcileServerWrites(existing, incoming) {
  if (!existing || typeof existing !== "object") return incoming;
  const next = incoming;
  const inLedger = Array.isArray(next.ledger) ? next.ledger : [];
  const inLedgerIds = new Set(inLedger.map((e) => e?.entry_id));
  const missing = (Array.isArray(existing.ledger) ? existing.ledger : []).filter((e) => e?.via === "customer-sync" && e.entry_id && !inLedgerIds.has(e.entry_id));
  if (missing.length && Array.isArray(next.customers)) {
    next.ledger = [...missing, ...inLedger];
    for (const entry of missing) {
      const idx = next.customers.findIndex((c) => c?.customer_id === entry.customer_id);
      if (idx < 0) continue;
      const tab = next.customers[idx];
      const amount = Math.max(0, Number(tab.amount || 0) - Number(entry.amount || 0));
      const due = String(tab.due_date || "");
      const status = amount <= 0 ? "Paid" : due && new Date(due) < new Date() ? "Overdue" : due && (new Date(due).getTime() - Date.now()) <= 7 * 86400000 ? "Due soon" : "Pending";
      next.customers[idx] = { ...tab, amount, status };
    }
  }
  if (Array.isArray(next.jobs) && Array.isArray(existing.jobs)) {
    const before = new Map(existing.jobs.map((j) => [j?.job_id, j]));
    next.jobs = next.jobs.map((job) => {
      const old = before.get(job?.job_id);
      if (!old?.status_updated_by || !old.status_updated_at) return job;
      if (job.status_updated_at && job.status_updated_at >= old.status_updated_at) return job;
      return { ...job, status: old.status, status_updated_at: old.status_updated_at, status_updated_by: old.status_updated_by };
    });
  }
  return next;
}

app.put("/api/state", auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!req.body.state || typeof req.body.state !== "object") return res.status(400).json({ error: "Invalid state payload" });
    await client.query("BEGIN");
    const current = await client.query("SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE", [req.user.id]);
    const merged = reconcileServerWrites(current.rows[0]?.state, req.body.state);
    await client.query(
      `INSERT INTO user_state (user_id, state) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [req.user.id, JSON.stringify(merged)],
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
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
    const filename = `${crypto.randomUUID()}.${parsed.ext}`;
    const previous = await pool.query("SELECT avatar_url FROM users WHERE id=$1", [req.user.id]);
    const oldUrl = previous.rows[0]?.avatar_url || "";
    if (oldUrl) {
      const oldName = path.basename(new URL(oldUrl, "http://localhost").pathname);
      if (oldUrl.startsWith(r2PublicBase + "/") && r2Enabled) await removeUpload(`avatars/${req.user.id}/${oldName}`, path.join(dir, oldName));
      else if (fs.existsSync(path.join(dir, oldName))) fs.unlinkSync(path.join(dir, oldName));
    }
    const storageKey = `avatars/${req.user.id}/${filename}`;
    const storedUrl = await saveUpload(storageKey, path.join(dir, filename), parsed.buffer, parsed.mime);
    const avatarUrl = storedUrl || `/uploads/avatars/${encodeURIComponent(req.user.id)}/${filename}`;
    const result = await pool.query("UPDATE users SET avatar_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *", [avatarUrl, req.user.id]);
    res.json({ user: userDto(result.rows[0]) });
  } catch (error) { next(error); }
});

app.delete("/api/account/avatar", auth, async (req, res, next) => {
  try {
    const dir = path.join(avatarUploadRoot, req.user.id);
    const current = await pool.query("SELECT avatar_url FROM users WHERE id=$1", [req.user.id]);
    const oldUrl = current.rows[0]?.avatar_url || "";
    if (oldUrl) {
      const oldName = path.basename(new URL(oldUrl, "http://localhost").pathname);
      if (oldUrl.startsWith(r2PublicBase + "/") && r2Enabled) await removeUpload(`avatars/${req.user.id}/${oldName}`, path.join(dir, oldName));
      else if (fs.existsSync(path.join(dir, oldName))) fs.unlinkSync(path.join(dir, oldName));
    }
    const result = await pool.query("UPDATE users SET avatar_url='', updated_at=NOW() WHERE id=$1 RETURNING *", [req.user.id]);
    res.json({ user: userDto(result.rows[0]) });
  } catch (error) { next(error); }
});


// ── Employee / customer ↔ business owner: jobs, progress requests ────────────
// Each account keeps its own state row, so an employee's or customer's jobs live in the
// OWNER's state. These endpoints read them on demand (verified against the owner's own
// employee/customer records) and keep requests in shared tables addressed to the owner.
const WORK_REQUEST_KINDS = new Set(["Progress update", "Money", "Question", "Other"]);
const WORK_REQUEST_STATUSES = new Set(["Pending", "Approved", "Rejected", "Acknowledged"]);
const EMPLOYEE_JOB_STATUSES = new Set(["In progress", "On hold", "Ready"]);

async function loadUserState(userId, client = pool) {
  const result = await client.query("SELECT state FROM user_state WHERE user_id = $1", [userId]);
  return result.rows[0]?.state || null;
}

/** Businesses the user is linked to as employee/customer, verified from each OWNER's records. */
async function linkedWork(userId) {
  const mine = await loadUserState(userId);
  if (!mine) return [];
  const rels = (Array.isArray(mine.relationships) ? mine.relationships : []).filter(
    (r) => String(r?.user_id) === String(userId) && ["employee", "customer"].includes(r?.relationship_type) && String(r?.status || "").toLowerCase() === "active",
  );
  const out = [];
  const ownerCache = new Map();
  for (const rel of rels) {
    const business = (Array.isArray(mine.businesses) ? mine.businesses : []).find((b) => b?.business_id === rel.business_id && b?.owner_user_id);
    if (!business || String(business.owner_user_id) === String(userId)) continue;
    const ownerId = String(business.owner_user_id);
    if (!ownerCache.has(ownerId)) ownerCache.set(ownerId, await loadUserState(ownerId));
    const ownerState = ownerCache.get(ownerId);
    if (!ownerState) continue;
    const ownerBusiness = (ownerState.businesses || []).find((b) => b?.business_id === rel.business_id && String(b.owner_user_id) === ownerId);
    if (!ownerBusiness) continue;
    const employeeIds = (ownerState.employees || []).filter((e) => String(e?.user_id) === String(userId) && e.business_id === rel.business_id).map((e) => e.employee_id);
    const customerIds = (ownerState.customers || []).filter((c) => String(c?.user_id) === String(userId) && c.business_id === rel.business_id).map((c) => c.customer_id);
    const role = rel.relationship_type;
    if (role === "employee" && !employeeIds.length) continue;
    if (role === "customer" && !customerIds.length) continue;
    out.push({ role, ownerId, ownerState, business: ownerBusiness, employeeIds, customerIds });
  }
  return out;
}

function jobDto(job, link) {
  return {
    job_id: job.job_id,
    business_id: job.business_id,
    business_name: link.business.business_name || "Business",
    title: job.title,
    description: job.description || "",
    start_date: job.start_date || "",
    due_date: job.due_date || "",
    status: job.status,
    role: link.role,
    // Internal costing is not shown to employees.
    estimated_cost: link.role === "customer" ? Number(job.estimated_cost || 0) : 0,
    status_updated_at: job.status_updated_at || "",
  };
}

app.get("/api/work/jobs", auth, async (req, res, next) => {
  try {
    const links = await linkedWork(req.user.id);
    const jobs = [];
    for (const link of links) {
      for (const job of Array.isArray(link.ownerState.jobs) ? link.ownerState.jobs : []) {
        if (job?.business_id !== link.business.business_id) continue;
        const mineJob = link.role === "employee" ? link.employeeIds.includes(job.employee_id) : link.customerIds.includes(job.customer_id);
        if (mineJob) jobs.push(jobDto(job, link));
      }
    }
    jobs.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    res.json({ jobs });
  } catch (error) { next(error); }
});

app.post("/api/work/jobs/:jobId/status", auth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const jobId = String(req.params.jobId || "");
    const status = String(req.body?.status || "");
    if (!EMPLOYEE_JOB_STATUSES.has(status)) return res.status(400).json({ error: "Employees can set In progress, On hold or Ready" });
    const links = (await linkedWork(req.user.id)).filter((l) => l.role === "employee");
    const link = links.find((l) => (l.ownerState.jobs || []).some((j) => j?.job_id === jobId && l.employeeIds.includes(j.employee_id)));
    if (!link) return res.status(403).json({ error: "This job is not assigned to you" });
    await client.query("BEGIN");
    const row = await client.query("SELECT state FROM user_state WHERE user_id = $1 FOR UPDATE", [link.ownerId]);
    const ownerState = row.rows[0]?.state;
    const job = (ownerState?.jobs || []).find((j) => j?.job_id === jobId && link.employeeIds.includes(j.employee_id));
    if (!job) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Job not found" }); }
    if (job.status === "Completed") { await client.query("ROLLBACK"); return res.status(409).json({ error: "This job is already completed" }); }
    job.status = status;
    job.status_updated_at = new Date().toISOString();
    job.status_updated_by = req.user.id;
    await client.query("UPDATE user_state SET state=$1, updated_at=NOW() WHERE user_id=$2", [JSON.stringify(ownerState), link.ownerId]);
    await client.query(
      "INSERT INTO app_notifications (user_id, title, body, href) VALUES ($1,$2,$3,$4)",
      [link.ownerId, "Job status updated", `${req.user.name} marked "${job.title}" as ${status}.`, "/jobs"],
    );
    await client.query("COMMIT");
    res.json({ job: jobDto(job, link) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally { client.release(); }
});

async function saveRequestImages(requestId, dataUrls) {
  const images = [];
  for (const dataUrl of (Array.isArray(dataUrls) ? dataUrls : []).slice(0, 6)) {
    const item = typeof dataUrl === "string" ? { data_url: dataUrl, name: "" } : dataUrl || {};
    const parsed = parseMediaDataUrl(item.data_url);
    if (!parsed || parsed.media_type !== "image") throw Object.assign(new Error("Images must be JPG, PNG, WEBP or GIF up to 6MB."), { status: 400 });
    const filename = `${crypto.randomUUID()}.${parsed.ext}`;
    const key = `requests/${requestId}/${filename}`;
    const stored = await saveUpload(key, path.join(__dirname, "..", "uploads", "requests", requestId, filename), parsed.buffer, parsed.mime);
    images.push({ name: safeFilename(item.name || filename), url: stored || `/uploads/requests/${encodeURIComponent(requestId)}/${filename}` });
  }
  return images;
}

async function requestsFor(userId) {
  const rows = (await pool.query(
    `SELECT r.*, fu.name AS from_name, ou.name AS owner_name
       FROM work_requests r
       JOIN users fu ON fu.id = r.from_user_id
       JOIN users ou ON ou.id = r.owner_user_id
      WHERE r.owner_user_id = $1 OR r.from_user_id = $1
      ORDER BY r.created_at DESC LIMIT 200`,
    [userId],
  )).rows;
  const ids = rows.map((r) => r.id);
  const msgs = ids.length
    ? (await pool.query(
        `SELECT m.*, u.name AS user_name FROM work_request_messages m JOIN users u ON u.id = m.user_id
          WHERE m.request_id = ANY($1::uuid[]) ORDER BY m.created_at`,
        [ids],
      )).rows
    : [];
  return rows.map((r) => ({
    request_id: r.id,
    business_id: r.business_id,
    business_name: r.business_name,
    job_id: r.job_id,
    job_title: r.job_title,
    kind: r.kind,
    amount: Number(r.amount || 0),
    body: r.body,
    images: r.images || [],
    status: r.status,
    from_user_id: r.from_user_id,
    from_name: r.from_name,
    from_role: r.from_role,
    owner_user_id: r.owner_user_id,
    owner_name: r.owner_name,
    created_at: r.created_at,
    updated_at: r.updated_at,
    messages: msgs
      .filter((m) => m.request_id === r.id)
      .map((m) => ({ message_id: m.id, user_id: m.user_id, user_name: m.user_name, body: m.body, images: m.images || [], created_at: m.created_at })),
  }));
}

app.get("/api/work/requests", auth, async (req, res, next) => {
  try { res.json({ requests: await requestsFor(req.user.id) }); } catch (error) { next(error); }
});

// Businesses the signed-in user can send requests to (never their own).
app.get("/api/work/targets", auth, async (req, res, next) => {
  try {
    const links = await linkedWork(req.user.id);
    res.json({
      targets: links.map((l) => ({
        business_id: l.business.business_id,
        business_name: l.business.business_name || "Business",
        role: l.role,
        jobs: (l.ownerState.jobs || [])
          .filter((j) => j?.business_id === l.business.business_id && (l.role === "employee" ? l.employeeIds.includes(j.employee_id) : l.customerIds.includes(j.customer_id)))
          .map((j) => ({ job_id: j.job_id, title: j.title, status: j.status })),
      })),
    });
  } catch (error) { next(error); }
});

app.post("/api/work/requests", auth, async (req, res, next) => {
  try {
    const businessId = String(req.body?.businessId || "");
    const kind = WORK_REQUEST_KINDS.has(req.body?.kind) ? req.body.kind : "Progress update";
    const body = String(req.body?.body || "").trim().slice(0, 4000);
    const amount = kind === "Money" ? Math.max(0, Number(req.body?.amount || 0)) : 0;
    const jobId = String(req.body?.jobId || "");
    const inputImages = Array.isArray(req.body?.images) ? req.body.images : [];
    if (!body && !inputImages.length) return res.status(400).json({ error: "Add a message or at least one image." });
    if (kind === "Money" && !(amount > 0)) return res.status(400).json({ error: "Enter the amount you are requesting." });
    const links = (await linkedWork(req.user.id)).filter((l) => l.business.business_id === businessId);
    const wantedRole = req.body?.role === "customer" ? "customer" : "employee";
    const link = links.find((l) => l.role === wantedRole) || links[0];
    if (!link) return res.status(403).json({ error: "You can only send requests to a business you work for or buy from." });
    if (String(link.ownerId) === String(req.user.id)) return res.status(400).json({ error: "Requests go from an employee or customer to the business owner." });
    const job = jobId
      ? (link.ownerState.jobs || []).find((j) => j?.job_id === jobId && j.business_id === businessId && (link.role === "employee" ? link.employeeIds.includes(j.employee_id) : link.customerIds.includes(j.customer_id)))
      : null;
    if (jobId && !job) return res.status(403).json({ error: "That job is not linked to you." });
    const requestId = randomUUID();
    const images = await saveRequestImages(requestId, inputImages);
    await pool.query(
      `INSERT INTO work_requests (id, business_id, business_name, owner_user_id, from_user_id, from_role, job_id, job_title, kind, amount, body, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [requestId, businessId, link.business.business_name || "", link.ownerId, req.user.id, link.role, job?.job_id || "", job?.title || "", kind, amount, body, JSON.stringify(images)],
    );
    await pool.query(
      "INSERT INTO app_notifications (user_id, title, body, href) VALUES ($1,$2,$3,$4)",
      [link.ownerId, `${kind} from ${req.user.name}`, (job ? `${job.title}: ` : "") + (body || "Sent images"), "/requests"],
    );
    res.status(201).json({ requests: await requestsFor(req.user.id) });
  } catch (error) {
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.post("/api/work/requests/:requestId/messages", auth, async (req, res, next) => {
  try {
    const requestId = String(req.params.requestId || "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return res.status(404).json({ error: "Request not found" });
    const found = await pool.query("SELECT * FROM work_requests WHERE id=$1", [requestId]);
    const request = found.rows[0];
    const isOwner = request && String(request.owner_user_id) === String(req.user.id);
    const isSender = request && String(request.from_user_id) === String(req.user.id);
    if (!isOwner && !isSender) return res.status(404).json({ error: "Request not found" });
    const body = String(req.body?.body || "").trim().slice(0, 4000);
    const inputImages = Array.isArray(req.body?.images) ? req.body.images : [];
    if (!body && !inputImages.length) return res.status(400).json({ error: "Add a message or at least one image." });
    const images = await saveRequestImages(requestId, inputImages);
    await pool.query("INSERT INTO work_request_messages (request_id, user_id, body, images) VALUES ($1,$2,$3,$4)", [requestId, req.user.id, body, JSON.stringify(images)]);
    await pool.query("UPDATE work_requests SET updated_at=NOW() WHERE id=$1", [requestId]);
    const other = isOwner ? request.from_user_id : request.owner_user_id;
    await pool.query(
      "INSERT INTO app_notifications (user_id, title, body, href) VALUES ($1,$2,$3,$4)",
      [other, `New message from ${req.user.name}`, body || "Sent images", "/requests"],
    );
    res.status(201).json({ requests: await requestsFor(req.user.id) });
  } catch (error) {
    if (error?.status === 400) return res.status(400).json({ error: error.message });
    next(error);
  }
});

app.patch("/api/work/requests/:requestId", auth, async (req, res, next) => {
  try {
    const requestId = String(req.params.requestId || "");
    const status = String(req.body?.status || "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return res.status(404).json({ error: "Request not found" });
    if (!WORK_REQUEST_STATUSES.has(status) || status === "Pending") return res.status(400).json({ error: "Invalid status" });
    const result = await pool.query(
      "UPDATE work_requests SET status=$1, updated_at=NOW() WHERE id=$2 AND owner_user_id=$3 RETURNING *",
      [status, requestId, req.user.id],
    );
    const request = result.rows[0];
    if (!request) return res.status(404).json({ error: "Request not found" });
    await pool.query(
      "INSERT INTO app_notifications (user_id, title, body, href) VALUES ($1,$2,$3,$4)",
      [request.from_user_id, `Request ${status.toLowerCase()}`, `${request.kind}${request.job_title ? ` · ${request.job_title}` : ""} was ${status.toLowerCase()} by ${req.user.name}.`, "/requests"],
    );
    res.json({ requests: await requestsFor(req.user.id) });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Server error" });
});

async function runScheduledCollectionReminders() {
  try {
    const owners = await pool.query(
      "SELECT user_id, state FROM user_state WHERE state ? 'collection_settings'"
    );
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (const owner of owners.rows) {
      const state = owner.state || {};
      const settings = state.collection_settings || {};
      const channel = ["lifeBoostSME", "whatsapp", "both"].includes(settings.channel) ? settings.channel : "lifeBoostSME";
      // WhatsApp needs a configured WhatsApp Business API/template. The manual Send action
      // remains available for click-to-chat when that provider is not configured.
      if (channel === "whatsapp") continue;
      const timing = ["before", "due", "overdue"].includes(settings.timing) ? settings.timing : "before";
      const days = Math.max(1, Math.min(30, Number(settings.days || 3)));
      const customers = Array.isArray(state.customers) ? state.customers : [];
      for (const customer of customers) {
        if (!customer.user_id || Number(customer.amount || 0) <= 0 || !customer.due_date) continue;
        const due = new Date(customer.due_date);
        if (Number.isNaN(due.getTime())) continue;
        const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
        const diffDays = Math.round((dueUtc - todayUtc) / 86400000);
        const matches = timing === "before" ? diffDays === days : timing === "due" ? diffDays === 0 : diffDays === -days;
        if (!matches) continue;
        const logged = await pool.query(
          `INSERT INTO collection_reminder_log (owner_user_id, customer_id, due_date, timing, days)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
          [owner.user_id, String(customer.customer_id), due.toISOString().slice(0, 10), timing, days],
        );
        if (!logged.rowCount) continue;
        const message = `Hello ${String(customer.name || "Customer")}, this is a payment reminder for ${Number(customer.amount || 0).toFixed(2)}. Due date: ${due.toLocaleDateString()}. Please contact the business if you have already paid.`;
        await pool.query(
          "INSERT INTO app_notifications (user_id, title, body, href) VALUES ($1,$2,$3,$4)",
          [customer.user_id, "Payment reminder", message, "/tab"],
        );
      }
    }
  } catch (error) {
    console.error("Scheduled collection reminder failed:", error);
  }
}

const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");
pool.query(schema)
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log(`lifeBoostSME API running on http://localhost:${PORT}`));
    void runScheduledCollectionReminders();
    setInterval(() => void runScheduledCollectionReminders(), 15 * 60 * 1000);
  })
  .catch((error) => { console.error("Database initialization failed", error); process.exit(1); });
