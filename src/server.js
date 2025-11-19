<<<<<<< HEAD
// ================================
// EcoBite Final Server (with Gmail OTP + Notifications)
// ================================

=======
// src/server.js
>>>>>>> f7c9a771cebcb0ef4426b2e78c3f7cee0e1f9e4d
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import pool from "./db.js";
import { signToken, authRequired } from "./auth.js";
<<<<<<< HEAD
import nodemailer from "nodemailer";
=======
>>>>>>> f7c9a771cebcb0ef4426b2e78c3f7cee0e1f9e4d

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

<<<<<<< HEAD
dotenv.config();

// -------- Static Path --------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
=======
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public"); // <== Absolute path：src/public

dotenv.config();
>>>>>>> f7c9a771cebcb0ef4426b2e78c3f7cee0e1f9e4d

const app = express();
app.use(cors());
app.use(express.json());

<<<<<<< HEAD
/* ======================================
   EMAIL TRANSPORTER (GMAIL)
====================================== */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function createNotification(user_id, title, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message)
       VALUES (?,?,?)`,
      [user_id, title, message]
    );
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

/* ======================================
   STATIC FILES
====================================== */

app.use(express.static(PUBLIC_DIR, { index: "home.html" }));
app.get("/login", (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "login.html"))
);

// allow pages routing except backend paths
app.get("/:page", (req, res, next) => {
  const skip = ["auth", "inventory", "report", "notifications"];
  const page = req.params.page;

  if (skip.includes(page)) return next();

  const filePath = path.join(PUBLIC_DIR, `${page}.html`);
  fs.access(filePath, fs.constants.F_OK, err =>
    err ? next() : res.sendFile(filePath)
  );
});

/* ======================================
   AUTH: SEND VERIFICATION CODE
====================================== */

app.post("/auth/send-code", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email required" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresMinutes = Number(process.env.CODE_EXPIRE_MINUTES || 10);

  try {
    await pool.query(
      `INSERT INTO verification_codes (email, code, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [email, code, expiresMinutes]
    );

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Your EcoBite Verification Code",
      html: `<h1>${code}</h1><p>Expires in ${expiresMinutes} minutes.</p>`
    });

    res.json({ message: "Verification code sent" });
  } catch (err) {
    res.status(500).json({ error: "Email sending failed" });
  }
});

/* ======================================
   AUTH: REGISTER (OTP VALIDATION)
====================================== */

app.post("/auth/register", async (req, res) => {
  const { email, password, verificationCode } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email & password required" });

  const [rows] = await pool.query(
    `SELECT * FROM verification_codes
     WHERE email=? AND code=? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, verificationCode]
  );

  if (!rows.length)
    return res.status(400).json({ error: "Invalid or expired OTP" });

  try {
    const [exists] = await pool.query(
      "SELECT id FROM users WHERE email=?",
      [email]
    );

    if (exists.length)
      return res.status(409).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users(email, password_hash) VALUES(?,?)",
      [email, hash]
    );

    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================
   AUTH: LOGIN
====================================== */

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await pool.query(
    "SELECT * FROM users WHERE email=?",
    [email]
  );
  if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken({ id: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email } });
});

/* ======================================
   INVENTORY HELPERS
====================================== */

function validateItem({ name, quantity, category, expiry_date }) {
  if (!name.trim()) return "Name required";
  if (!Number(quantity) || Number(quantity) <= 0)
    return "Quantity must be positive";

  const allowed = ["Refrigerated", "Pantry", "Frozen"];
  if (!allowed.includes(category)) return "Category invalid";

  return null;
}

function fixDate(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function computeStatus(expiry_date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exp = new Date(expiry_date);
  if (exp < today) return "expired";

  const diff = Math.ceil((exp - today) / 86400000);
  return diff <= 3 ? "near_expiry" : "available";
}

/* ======================================
   INVENTORY: GET ALL
====================================== */

app.get("/inventory", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM inventory WHERE user_id=? ORDER BY expiry_date ASC",
    [req.user.id]
  );

  const result = rows.map(r => ({
    ...r,
    status: r.status === "donated" ? "donated" : computeStatus(r.expiry_date)
  }));

  res.json(result);
});

/* ======================================
   INVENTORY: ADD ITEM (with notification)
====================================== */

app.post("/inventory", authRequired, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, quantity, category, expiry_date } = req.body;
  const finalDate = fixDate(expiry_date);

  try {
    const [r] = await pool.query(
      `INSERT INTO inventory (name, quantity, category, expiry_date, user_id)
       VALUES (?,?,?,?,?)`,
      [name.trim(), quantity, category, finalDate, req.user.id]
    );

    /* --- Create notification --- */
    await createNotification(
      req.user.id,
      "New Item Added",
      `You added "${name}" (${quantity})`
    );

    res.json({
      id: r.insertId,
      name,
      quantity,
      category,
      expiry_date: finalDate,
      status: "available"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================================
   EDIT ITEM
====================================== */

app.put("/inventory/:id", authRequired, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });

  const { name, quantity, category, expiry_date } = req.body;
  const finalDate = fixDate(expiry_date);

  await pool.query(
    `UPDATE inventory SET name=?, quantity=?, category=?, expiry_date=?
     WHERE id=? AND user_id=?`,
    [name.trim(), quantity, category, finalDate, req.params.id, req.user.id]
  );

  const [rows] = await pool.query("SELECT * FROM inventory WHERE id=?", [
    req.params.id
  ]);

  res.json(rows[0]);
});

/* ======================================
   DELETE ITEM
====================================== */

app.delete("/inventory/:id", authRequired, async (req, res) => {
  await pool.query(
    "DELETE FROM inventory WHERE id=? AND user_id=?",
    [req.params.id, req.user.id]
  );

  await createNotification(
    req.user.id,
    "Item Deleted",
    `You deleted an item from your inventory`
  );

  res.json({ message: "Deleted successfully" });
});

/* ======================================
   DONATE
====================================== */

app.post("/inventory/:id/donate", authRequired, async (req, res) => {
  await pool.query(
    "UPDATE inventory SET status='donated' WHERE id=? AND user_id=?",
    [req.params.id, req.user.id]
  );

  await createNotification(
    req.user.id,
    "Item Donated",
    `You donated an inventory item`
  );

  const [rows] = await pool.query("SELECT * FROM inventory WHERE id=?", [
    req.params.id
  ]);

  res.json(rows[0]);
});

/* ======================================
   REPORT SUMMARY
====================================== */

app.get("/report", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM inventory WHERE user_id=?",
    [req.user.id]
  );

  const report = {
    Pantry: 0,
    Refrigerated: 0,
    Frozen: 0,
    Donated: 0,
    Expired: 0,
    NearExpiry: 0,
    Available: 0
  };

  for (const r of rows) {
    if (report[r.category] !== undefined) report[r.category]++;

    if (r.status === "donated") report.Donated++;
    else {
      const s = computeStatus(r.expiry_date);
      if (s === "expired") report.Expired++;
      else if (s === "near_expiry") report.NearExpiry++;
      else report.Available++;
    }
  }

  res.json(report);
});

/* ======================================
   NOTIFICATIONS API
====================================== */

app.get("/notifications", authRequired, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC`,
    [req.user.id]
  );

  res.json(rows);
});

/* ======================================
   SERVER START
====================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`EcoBite backend running → http://localhost:${PORT}`)
);
=======
// ----------- Simple request log, convenient for troubleshooting (can be kept or deleted) -----------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ----------- Static files   Default homepage -----------
app.use(express.static(PUBLIC_DIR, { index: "home.html" }));

// ----------- Friendly routing (can open without .html suffix) -----------
app.get(["/", "/home"], (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "home.html"));
});
app.get("/login", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

// Note: /inventory is an API (see below), do not use the same name as a page route。
//If you want to give the inventory page a suffix-free alias, you can do it like this: /inventory-page
app.get("/inventory-page", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.get("/analytics", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "analytics.html"));
});

app.get("/planner", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "planner.html"));
});

app.get("/notifications", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "notifications.html"));
});

// ----------- Generic HTML fallback (the last line of defense) -----------
// When accessing /something, return src/public/something.html if it exists.
app.get("/:page", (req, res, next) => {
  const page = req.params.page;

  // Avoid conflicts with the API: endpoints like inventory, report, auth/* should be directly allowed through to the backend API.
  const apiPrefixes = ["auth", "report"];
  if (page === "inventory" || apiPrefixes.some(p => page.startsWith(p))) return next();

  const candidate = path.join(PUBLIC_DIR, `${page}.html`);
  fs.access(candidate, fs.constants.F_OK, (err) => {
    if (err) return next(); // If it doesn't exist, leave it to the subsequent process (404 or API)
    res.sendFile(candidate);
  });
});

// -----------Debugging endpoint: Let's see which directory is being read -----------
app.get("/__debug", (_req, res) => {
  fs.readdir(PUBLIC_DIR, (err, files) => {
    res.json({
      publicDir: PUBLIC_DIR,
      exists: !err,
      files: files || [],
    });
  });
});

/* ======================  The following are your original APIs ====================== */

/* ---------- Auth: Register / Login ---------- */
app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });
  try {
    const [exists] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (exists.length) return res.status(409).json({ error: "Email already registered" });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query("INSERT INTO users(email, password_hash) VALUES(?,?)", [email, hash]);
    const user = { id: r.insertId, email };
    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = signToken({ id: u.id, email: u.email });
    res.json({ token, user: { id: u.id, email: u.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Validation helper ---------- */
function validateItem({ name, quantity, category, expiry_date }) {
  if (!name || !name.trim()) return "Name is required";
  if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) return "Quantity must be a positive integer";
  const allowed = ["Refrigerated", "Pantry", "Frozen"];
  if (!allowed.includes(category)) return "Category is required";
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiry_date);
  if (isNaN(exp.getTime()) || exp < today) return "Expiry must be today or later";
  return null;
}

/* ---------- Runtime status helper ---------- */
function computeStatus(expiry_date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiry_date);
  if (exp < today) return "expired";
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  return diffDays <= 3 ? "near_expiry" : "available";
}

/* ---------- Inventory APIs (protected) ---------- */
app.get("/inventory", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE user_id = ? OR user_id IS NULL ORDER BY expiry_date ASC",
      [req.user.id]
    );
    const data = rows.map(r => ({
      ...r,
      status: r.status === "donated" ? "donated" : computeStatus(r.expiry_date)
    }));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/inventory", authRequired, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, quantity, category, expiry_date } = req.body;
  try {
    const [r] = await pool.query(
      "INSERT INTO food_items (name, quantity, category, expiry_date, user_id) VALUES (?,?,?,?,?)",
      [name.trim(), Number(quantity), category, expiry_date, req.user.id]
    );
    res.status(201).json({
      id: r.insertId, name, quantity: Number(quantity), category, expiry_date,
      status: "available", user_id: req.user.id
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/inventory/:id", authRequired, async (req, res) => {
  const err = validateItem(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, quantity, category, expiry_date } = req.body;
  try {
    await pool.query(
      "UPDATE food_items SET name=?, quantity=?, category=?, expiry_date=? WHERE id=? AND (user_id=? OR user_id IS NULL)",
      [name.trim(), Number(quantity), category, expiry_date, req.params.id, req.user.id]
    );
    const [rows] = await pool.query("SELECT * FROM food_items WHERE id=?", [req.params.id]);
    const item = rows[0];
    if (!item) return res.json({});
    const status = item.status === "donated" ? "donated" : computeStatus(item.expiry_date);
    res.json({ ...item, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/inventory/:id", authRequired, async (req, res) => {
  try {
    await pool.query("DELETE FROM food_items WHERE id=? AND (user_id=? OR user_id IS NULL)", [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Donate ---------- */
app.post("/inventory/:id/donate", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE id=? AND (user_id=? OR user_id IS NULL)",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Item not found" });
    const item = rows[0];
    if (item.status === "donated") return res.status(400).json({ error: "Already donated" });
    await pool.query("UPDATE food_items SET status='donated' WHERE id=?", [req.params.id]);
    const [after] = await pool.query("SELECT * FROM food_items WHERE id=?", [req.params.id]);
    res.json(after[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- Report ---------- */
app.get("/report", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE user_id = ? OR user_id IS NULL",
      [req.user.id]
    );
    const report = { Pantry: 0, Refrigerated: 0, Frozen: 0, Donated: 0, Expired: 0, NearExpiry: 0, Available: 0 };
    for (const r of rows) {
      if (report[r.category] !== undefined) report[r.category]++;
      if (r.status === "donated") report.Donated++;
      else {
        const s = computeStatus(r.expiry_date);
        if (s === "expired") report.Expired++;
        else if (s === "near_expiry") report.NearExpiry++;
        else report.Available++;
      }
    }
    res.json(report);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- Start server ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
>>>>>>> f7c9a771cebcb0ef4426b2e78c3f7cee0e1f9e4d
