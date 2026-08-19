# 🏝️ Telunas Resort Issue Tracker & WhatsApp Bot

<p align="center">
  <img src="public/favicon.ico" width="80" alt="Telunas Logo">
</p>

<p align="center">
  <b>A comprehensive, real-time facility maintenance & incident tracking system built specifically for Telunas Resorts.</b><br>
  Combines a modern web application, native desktop client, Google Sheets two-way cloud synchronization, and an intelligent WhatsApp bot integration.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-11.x-FF2D20?style=for-the-badge&logo=laravel&logoColor=white" alt="Laravel 11">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18">
  <img src="https://img.shields.io/badge/Inertia.js-v2-9553E9?style=for-the-badge&logo=inertia&logoColor=white" alt="Inertia.js">
  <img src="https://img.shields.io/badge/TailwindCSS-v3-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/WhatsApp_Bot-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp Bot">
  <img src="https://img.shields.io/badge/Storage-Local_%2B_Google_Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white" alt="Google Sheets">
</p>

---

## 📌 Overview

**Telunas Resort Issue Tracker** is designed to streamline facility maintenance, guest issue reporting, and cross-departmental task escalation across **Telunas Private Island (TPI)**, **Telunas Beach Resort (TBR)**, and the **Main Office (Kantor)**.

Staff members can report, claim, delay (*pending*), and resolve maintenance tickets either through the **Interactive Web Dashboard** or directly from their mobile phones via **WhatsApp Group / Private Chat Bot**.

---

## ✨ Key Features

### 🖥️ 1. Interactive Web Dashboard (React + Inertia.js)
- **Live Kanban / Task Columns**: Grouped by `Open (Unclaimed)`, `In Progress`, `Pending (Delayed)`, and `Solved`.
- **Interactive Analytics Bar**: Real-time metrics, breakdown charts by Department, Category, Duration, and Month-over-Month comparison.
- **Emergency Fast-Track (SOS)**: Instant emergency trigger with pulsing audio alarms, priority countdown timers, and auto-generated `SOS-` ticket IDs.
- **Full Ticket Lifecycle**:
  - Claim tickets with staff identity tagging.
  - Mark as *Pending* with required reason and delay photo proof.
  - Mark as *Solved* with fix description and completion photo proof.
  - Reassign / Edit Categories on the fly.
- **Enhanced Image Lightbox**: High-resolution image preview with interactive zoom magnifier for inspecting damage and proof photos.
- **Multi-Language Support**: Complete bilingual interface (**Bahasa Indonesia** & **English**).
- **Sheet Period Management**: Dynamically switch between monthly / custom period sheets or generate new archive sheets directly from the UI.
- **Native Desktop Client**: Packaged with Electron for seamless desktop operation.

---

### 🤖 2. WhatsApp Bot Integration (`whatsapp-bot/bot.js`)
Powered by `@whiskeysockets/baileys`, the bot runs alongside the system:
- **Instant Group Broadcasts**: Sends new issue notifications with photo attachments, priority badges, location, origin department, and tagged department mentions (`@Engineering`, `@Security`, etc.).
- **One-Touch Reply Claiming**: Staff can reply directly to any notification in the group with `!claim <Name>` or just `!claim` to claim the ticket.
- **Step-by-Step Reporting**: Conversational questionnaire to report issues directly from WhatsApp.
- **Emergency SOS Fast-Track**: Commands like `sos`, `darurat`, `tolong`, `help`, `bantuan`, or `emergency` trigger high-priority emergency reporting with countdown deadlines.
- **DM Issue Resolution & Delay**: Resolve (`!solve`) or mark pending (`!pending`) by sending the Issue ID, description, and photo proof in WhatsApp DM.
- **Smart Partial ID Matcher**: Accepts partial IDs (e.g. typing `190826-4` automatically resolves to `SOS-190826-4` or `Eng-190826-4`).
- **Dual-Language Menu**: Open guide with `menu`, `menu ID`, or `menu EN`.
- **Auto-Escalation Engine**: Periodically checks for overdue or unhandled critical tickets and notifies the linked group.

---

### 🗄️ 3. Hybrid Storage Architecture
- **Tabular Data**: Synced with **Google Sheets API v4** for real-time collaborative cloud access, reporting, and backup.
- **Image Storage**: **100% Local Storage** (`public/uploads/`) with strict MIME validation (`jpg`, `jpeg`, `png`, `webp`), 5MB file size limit, and automatic filename sanitization. Eliminates third-party image hosting dependency and rate limits.

---

## 💬 WhatsApp Bot Commands Reference

| Command (ID) | Command (EN) | Description |
| :--- | :--- | :--- |
| `!darurat` / `darurat` / `sos` / `tolong` / `bantuan` / `help` | `!sos` / `sos` / `emergency` / `help` | 🚨 Trigger emergency SOS report (sets critical deadline) |
| `!lapor` / `lapor` / `rusak` | `!report` / `report` / `broken` | 📋 Start step-by-step issue reporting flow |
| `!perbaiki` / `perbaiki` / `selesai` | `!solve` / `solve` / `fix` | 🔧 Resolve an issue with fix description & photo proof |
| `!tunda` / `tunda` / `tertunda` | `!pending` / `pending` / `delay` | ⏳ Mark job as pending with reason & delay photo proof |
| `!claim <Nama>` *(in Group)* | `!claim <Name>` *(in Group)* | 🤝 Reply to issue notification to claim the task |
| `!status` / `!masalah` | `!status` / `!issues` | 📊 Check active/solved issue summary by department |
| `menu ID` | `menu EN` | 📖 Open full command guide in Indonesian / English |
| `batal` / `reset` | `cancel` / `reset` | ❌ Cancel active conversation & return to main state |
| `!setgroup` *(Admin)* | `!setgroup` *(Admin)* | 🔗 Link the WhatsApp group for notifications & broadcasts |

---

## 🛠️ Tech Stack

- **Backend Framework**: [Laravel 11](https://laravel.com/) (PHP 8.2+)
- **Frontend Framework**: [React 18](https://react.dev/) via [Inertia.js v2](https://inertiajs.com/)
- **Styling & UI**: [Tailwind CSS](https://tailwindcss.com/), [Lucide React Icons](https://lucide.dev/), [Shadcn UI components](https://ui.shadcn.com/)
- **WhatsApp Integration**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys), Axios, Pino, Form-Data
- **Desktop Wrapper**: [Electron 34](https://www.electronjs.org/)
- **Database & Cloud Storage**: Google Sheets API v4 via `google/apiclient`
- **Asset Bundler**: [Vite](https://vitejs.dev/)

---

## 🚀 Installation & Local Setup

### 1. Prerequisites
- **PHP** >= 8.2 (with `gd`, `fileinfo`, `curl`, `mbstring`, `pdo_sqlite` or `pdo_mysql` extensions enabled)
- **Composer** >= 2.x
- **Node.js** >= 18.x and **npm**
- **Google Cloud Service Account JSON Key** (with Google Sheets API enabled)

---

### 2. Backend & Frontend Setup

```bash
# 1. Clone the repository
git clone https://github.com/BeliebersL1t3/ProblemNotifier.git
cd ProblemNotifier

# 2. Install PHP dependencies
composer install

# 3. Install Node.js dependencies
npm install

# 4. Copy environment file and generate application key
cp .env.example .env
php artisan key:generate

# 5. Place your Google Service Account credentials
# Save your Google Cloud credentials JSON file to the project root as:
# google-credentials.json

# 6. Configure .env with your Google Sheet ID:
# GOOGLE_SHEET_ID=your_google_spreadsheet_id_here

# 7. Run SQLite migrations
php artisan migrate

# 8. Build frontend assets
npm run build
```

---

### 3. Running the Web Application

To run the application locally:

```bash
# Terminal 1: Start Laravel Development Server
php artisan serve

# Terminal 2: Start Vite Dev Server (Optional for development hot-reloading)
npm run dev
```

The web dashboard is now accessible at `http://localhost:8000`.

---

### 4. Running the WhatsApp Bot

```bash
# 1. Navigate to whatsapp-bot directory
cd whatsapp-bot

# 2. Install bot dependencies
npm install

# 3. Start the bot
node bot.js
```

1. On initial startup, a **QR Code** will appear in the terminal.
2. Open WhatsApp on your device -> **Linked Devices** -> **Link a Device** -> Scan the QR code.
3. Once linked, add the bot number to your Telunas Staff WhatsApp Group.
4. Type **`!setgroup`** in the group chat. The bot will save the group ID to `config.json` and begin broadcasting all incoming tickets.

---

### 5. Running Desktop Client (Optional)

```bash
# Start Electron native desktop app
npm run electron
```

---

## 🛡️ Security & Privacy

- **API Keys & Secrets**: `.env`, `google-credentials.json`, `auth_info_baileys/`, and `config.json` are strictly excluded from version control via `.gitignore`.
- **Upload Hardening**: Restricts uploaded files to `image/jpeg`, `image/png`, `image/webp` (max 5MB) with server-side extension sanitization.
- **Bcrypt Password Hashing**: All user authentication accounts are hashed using standard Bcrypt.

---

## 📄 License

This project is proprietary software developed for **Telunas Resorts**. All rights reserved.
