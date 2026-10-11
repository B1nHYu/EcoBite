# 🍃 EcoBite – Food Waste Management System

![License](https://img.shields.io/badge/license-MIT-green)
![Version](https://img.shields.io/badge/version-1.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-database-4479A1?logo=mysql&logoColor=white)

> **Course project – BIT216 Software Engineering Principles, HELP University**

---

## 🧾 Project Overview

Households throw away a lot of edible food simply because nobody noticed it was about to expire.
**EcoBite** is a prototype web system that helps people **reduce food waste** and **share surplus food**.
Users keep track of what is in their kitchen, get warned before items expire, and can mark surplus items as donated.

## 🚀 Main Features

| Feature | Description |
|---|---|
| 🔐 **Secure sign-up & login** | Email registration verified by a one-time code (OTP) sent by email; passwords hashed with bcrypt; sessions handled with JWT. |
| 🗂️ **Food inventory management** | Add, edit, delete and view food items with quantity, category (Pantry / Refrigerated / Frozen) and expiry date. Each item is automatically classed as available, near expiry, expired or donated. |
| ⏰ **Expiry alerts & notifications** | Items nearing expiry generate notifications that are stored per user and shown on a dedicated page. |
| 🤝 **Donation listing** | Mark an item as donated so surplus food is shared instead of wasted (already-donated items are protected from double donation). |
| 🍳 **Meal planner** | A planner page to help use up ingredients before they expire. |
| 📊 **Analytics report** | Summary counts per storage category and per status (available, near expiry, expired, donated). |

## 🖥️ Pages

| Page | File |
|---|---|
| Home / dashboard (overview, recent items, quick add, report) | `public/home.html` |
| Inventory | `public/index.html` |
| Login & Register | `public/login.html` |
| Meal Planner | `public/planner.html` |
| Notifications | `public/notifications.html` |
| Analytics | `public/analytics.html` |

## 🖼️ System Preview

| Home Page |
|------------|
| ![Home](https://github.com/B1nHYu/EcoBite/blob/main/public/images/zhuyemian.jpg?raw=true) |

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript (static pages served by Express)
- **Backend:** Node.js, Express 4 (ES modules)
- **Database:** MySQL via `mysql2`
- **Authentication:** `bcryptjs` (password hashing), `jsonwebtoken` (JWT)
- **Email:** `nodemailer` (SMTP, used for OTP verification codes)
- **Config:** `dotenv`

## 🔌 REST API

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/send-code` | – | Send an OTP to the user's email |
| POST | `/auth/register` | – | Register with email, password and OTP |
| POST | `/auth/login` | – | Log in and receive a JWT |
| GET | `/inventory` | ✔ | List the user's food items |
| POST | `/inventory` | ✔ | Add a food item |
| PUT | `/inventory/:id` | ✔ | Update a food item |
| DELETE | `/inventory/:id` | ✔ | Delete a food item |
| POST | `/inventory/:id/donate` | ✔ | Mark an item as donated |
| GET | `/report` | ✔ | Summary report for analytics |
| GET | `/notifications` | ✔ | List the user's notifications |

## 📁 Project Structure

```
EcoBite/
├── server.js          # Express server and API routes
├── auth.js            # JWT sign / verify and auth middleware
├── db.js              # MySQL connection pool
├── public/            # Frontend pages and images
├── package.json
├── WBS_EcoBite.xlsx   # Work breakdown structure
├── *.gan              # Gantt chart project plans
├── Iteration2_TestChart.xlsx   # Iteration 2 test results
└── Assignment 1EcoBite.pdf     # Assignment brief / documentation
```

## ⚙️ Installation & Setup

**Prerequisites:** Node.js 18+, MySQL 8+, and an SMTP account (for example a Gmail app password) for sending OTP emails.

1. **Clone the repository**
   ```bash
   git clone https://github.com/B1nHYu/EcoBite.git
   cd EcoBite
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Create the database** – create a MySQL database with the tables `users`, `verification_codes`, `inventory` and `notifications` (the SQL queries in `server.js` show the columns used).
4. **Configure environment variables** – create a `.env` file in the project root (never commit it):
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=ecobite

   PORT=3000
   JWT_SECRET=a_long_random_string

   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_app_password
   SMTP_FROM="EcoBite <your_email@gmail.com>"

   CODE_EXPIRE_MINUTES=10
   ```
5. **Run the server**
   ```bash
   node server.js
   ```
6. Open **http://localhost:3000** in your browser.

## 🧪 Project Management & Testing

- Work was planned with a **Work Breakdown Structure** (`WBS_EcoBite.xlsx`) and **Gantt charts** (`*.gan`).
- The project was built in iterations; **Iteration 2** test cases and results are recorded in `Iteration2_TestChart.xlsx`.

## 🔭 Future Improvements

- Public donation board where other users can browse and claim donated food
- Automatic scheduled expiry reminders by email
- Recipe suggestions based on items close to expiry
- Automated tests and a database migration script

## 👥 Team

Built by [@B1nHYu](https://github.com/B1nHYu) and [@zwz0304](https://github.com/zwz0304) as a BIT216 group project.

## 📄 License

Released under the MIT License.
