// ================================
// EcoBite Final Server (with Gmail OTP + Notifications)
// ================================

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import pool from "./db.js";
import { signToken, authRequired } from "./auth.js";
import nodemailer from "nodemailer";

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

// -------- Static Path --------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.json());

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
