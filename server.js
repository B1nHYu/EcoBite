// ================================
// EcoBite Final Server (with Gmail Email OTP)
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

// -------- Static File Path --------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(cors());
app.use(express.json());

// -------- Email Transporter (Gmail App Password) --------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,          
  port: Number(process.env.SMTP_PORT),  
  secure: Number(process.env.SMTP_PORT) === 465,  
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// -------- Request Log --------
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// -------- Static Files --------
app.use(express.static(PUBLIC_DIR, { index: "home.html" }));

app.get("/login", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

// -------- HTML Fallback --------
app.get("/:page", (req, res, next) => {
  const page = req.params.page;

  const skip = ["auth", "inventory", "report"];
  if (skip.some(p => page.startsWith(p))) return next();

  const candidate = path.join(PUBLIC_DIR, `${page}.html`);
  fs.access(candidate, fs.constants.F_OK, err => {
    if (err) return next();
    res.sendFile(candidate);
  });
});

// -------- Debug Public Dir --------
app.get("/__debug", (_req, res) => {
  fs.readdir(PUBLIC_DIR, (err, files) => {
    res.json({
      publicDir: PUBLIC_DIR,
      exists: !err,
      files: files || []
    });
  });
});

/* ======================================
   AUTH: Send Email Verification Code (OTP)
====================================== */

app.post("/auth/send-code", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email required" });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresMinutes = Number(process.env.CODE_EXPIRE_MINUTES || 10);

  try {
    // Save to DB
    await pool.query(
      `INSERT INTO verification_codes (email, code, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [email, code, expiresMinutes]
    );

    // Send Gmail
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Your EcoBite Verification Code",
      html: `
        <h2>Your EcoBite Email Verification</h2>
        <p>Your code is:</p>
        <h1 style="letter-spacing:4px;">${code}</h1>
        <p>This code expires in ${expiresMinutes} minutes.</p>
      `
    });

    return res.json({ message: "Verification code sent" });

  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
});

/* ======================================
   AUTH: Register + OTP validation
====================================== */

app.post("/auth/register", async (req, res) => {
  const { email, password, verificationCode } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email & password required" });

  // Validate OTP
  const [codeRows] = await pool.query(
    `SELECT * FROM verification_codes
     WHERE email=? AND code=? AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, verificationCode]
  );

  if (!codeRows.length)
    return res.status(400).json({ error: "Invalid or expired verification code" });

  try {
    const [exists] = await pool.query("SELECT id FROM users WHERE email=?", [email]);
    if (exists.length)
      return res.status(409).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users(email, password_hash) VALUES(?,?)",
      [email, hash]
    );

    return res.status(201).json({ message: "Registered successfully" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ======================================
   AUTH: Login
====================================== */

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email & password required" });

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (!rows.length)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: user.id, email: user.email });

    return res.json({ token, user: { id: user.id, email: user.email } });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ======================================
   INVENTORY / DONATE / REPORT  (unchanged)
====================================== */

function validateItem({ name, quantity, category, expiry_date }) {
  if (!name || !name.trim()) return "Name required";
  if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0)
    return "Quantity must be positive";
  const allowed = ["Refrigerated", "Pantry", "Frozen"];
  if (!allowed.includes(category)) return "Category invalid";
  return null;
}

function computeStatus(expiry_date) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const exp = new Date(expiry_date);

  if (exp < today) return "expired";

  const diff = Math.ceil((exp - today) / (1000*60*60*24));
  return diff <= 3 ? "near_expiry" : "available";
}

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

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      id: r.insertId, name, quantity, category, expiry_date,
      status: "available", user_id: req.user.id
    });

  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/inventory/:id/donate", authRequired, async (req, res) => {
  try {
    await pool.query("UPDATE food_items SET status='donated' WHERE id=?", [req.params.id]);

    const [rows] = await pool.query("SELECT * FROM food_items WHERE id=?", [req.params.id]);
    return res.json(rows[0]);

  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/report", authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM food_items WHERE user_id = ? OR user_id IS NULL",
      [req.user.id]
    );

    const report = {
      Pantry:0, Refrigerated:0, Frozen:0,
      Donated:0, Expired:0, NearExpiry:0, Available:0
    };

    for(const r of rows){
      if(report[r.category] !== undefined) report[r.category]++;
      if(r.status === "donated") report.Donated++;
      else {
        const s = computeStatus(r.expiry_date);
        if(s==="expired") report.Expired++;
        else if(s==="near_expiry") report.NearExpiry++;
        else report.Available++;
      }
    }
    res.json(report);

  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ======================================
   START SERVER
====================================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`EcoBite backend running → http://localhost:${PORT}`));
