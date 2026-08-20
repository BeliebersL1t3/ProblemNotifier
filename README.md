# 🏝️ Telunas Resort Issue Tracker & WhatsApp Bot

<p align="center">
  <img src="public/favicon.ico" width="80" alt="Telunas Logo">
</p>

<p align="center">
  <b>A comprehensive, real-time facility maintenance & incident tracking system built specifically for Telunas Resorts.</b><br>
  Combines a modern web application, native desktop client, Google Sheets two-way cloud synchronization, comprehensive multi-sheet analytics, and an intelligent WhatsApp Community Bot integration.
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

Staff members can report, claim, delay (*pending*), and resolve maintenance tickets either through the **Interactive Web Dashboard** or directly from their mobile phones via **WhatsApp Community Sub-Group Chats**.

---

## ✨ Key Features

### 🖥️ 1. Interactive Web Dashboard (`/dashboard`)
- **Live Kanban / Task Columns**: Real-time task board divided into `Open (Unclaimed)`, `In Progress`, `Pending (Delayed)`, and `Solved`.
- **Emergency Fast-Track (SOS)**: Instant emergency trigger with pulsing audio alarms, priority countdown timers, and auto-generated `SOS-` ticket IDs.
- **Full Ticket Lifecycle Management**:
  - **Claim Job**: Tag staff identity and update state to in-progress.
  - **Mark Pending**: Specify postponement reason and attach delay photo proof.
  - **Mark Solved**: Submit resolution notes and final completion photo proof.
  - **Edit & Categorize**: Update department, location, and issue category on the fly.
- **Interactive Lightbox & Magnifier**: High-resolution image preview with interactive zoom magnifier for inspecting damage and proof photos.
- **Bilingual Interface**: Seamlessly switch between **Bahasa Indonesia (ID)** and **English (EN)**.
- **Sheet Period Selector**: Switch between operational years/periods or generate new archive sheets directly from the header.

---

### 📊 2. Advanced Performance Analytics (`/analytics`)
Dedicated analytical engine designed for operational reviews, monthly reporting, and cross-departmental KPI tracking:

- **Multi-Sheet Consolidated Analytics**:
  - Select and combine multiple Google Sheets data periods (e.g. `2025` + `2026`) with one click to view consolidated multi-year reports.
  - Fully isolated from Dashboard and Bot operations.
- **Comprehensive Time Range Filter**:
  - Filter analytics dynamically by *All Time, Today (24h), 3 Days, 1 Week, 2 Weeks, 3 Weeks, 4 Weeks, 1 Month, 3 Months, 6 Months, or 1 Year*.
- **Category Distribution (Pie Chart)**:
  - Interactive donut/pie chart displaying the distribution across 10 resort categories.
  - Distinct **Vibrant Red (`#EF4444`)** slice with `AlertTriangle` icon for Emergency (SOS) tickets.
- **Department Breakdown (Bar Chart)**:
  - **Display Limit Selector**: Filter bars by `Top 5`, `Top 10`, `Top 15`, `Top 20`, or `All`.
  - **Smart Department Abbreviations**: Automatically switches to clean short codes (`ENG`, `IT`, `PC`, `SEC`, `FAS`, `HK`, `F&B`, `SRV`, `BAR`, `GR`, `SPA`, `TRK`, `OE`, `PROC`, `S/M`, `RSV`, `FIN`) when viewing many departments to prevent label clutter.
  - **Full Name Tooltips**: Hover over any bar to view the exact department name and issue count.
  - Excludes Emergency and undefined entries to maintain pure operational metrics.
- **Recent Issue Activity (Timeline Log)**:
  - **Status & Priority Filters**: Multi-select `Open`, `In Progress`, `Pending`, `Solved`, and `Critical`.
  - **Combinable Department Filter with 3 Scope Modes**:
    - `Both (Origin & Tagged)`: Shows issues originating from OR tagging the department.
    - `Reported by (Origin Only)`: Shows issues reported by that department only.
    - `Tagged Only`: Shows issues where the department was tagged/assigned by others.
  - **Combinable Category Filter**: Multi-select categories with corresponding color badges.
  - **In-Page PDF Exporter**: Download comprehensive printable PDF reports directly from the analytics layout.

---

### 🤖 3. WhatsApp Community Bot (`whatsapp-bot/bot.js`)
Powered by `@whiskeysockets/baileys`, the bot runs alongside the web platform with multi-group intelligent routing:

- **18 Department Sub-Group Routing**: Automatically detects and routes notifications to the appropriate department sub-group chats (`Engineer`, `IT`, `Security`, `Housekeeping`, `F&B`, `Pest Control`, `Fasilitas`, `Service`, `Bar`, `GR`, `Spa`, `TiRek`, `OE`, `Procurement`, `Sales/Marketing`, `Reservasi`, `Finance`, `Tekong`) plus the **General Announcement Group**.
- **Per-Group Tag Customization**:
  - **General Group**: Receives full department tags (e.g. `*Tags:* @Engineer @IT` or `*Tags:* @ALL`).
  - **Department Sub-Group**: Receives only its relevant tag (e.g. `*Tags:* @Engineer` in the Engineer group chat).
- **One-Touch Reply Claiming**: Staff can reply directly to any notification in the group with `!claim <Name>` or `!claim` to claim the task.
- **Step-by-Step Reporting**: Conversational questionnaire to report issues directly from WhatsApp.
- **Emergency SOS Fast-Track**: Commands like `sos`, `darurat`, `tolong`, `help`, `bantuan`, or `emergency` trigger high-priority emergency broadcasts across all 19 community groups.
- **DM Issue Resolution & Delay**: Resolve (`!solve`) or mark pending (`!pending`) by sending the Issue ID, description, and photo proof in WhatsApp DM.
- **Smart Partial ID Matcher**: Accepts partial IDs (e.g. typing `190826-4` automatically resolves to `SOS-190826-4` or `Eng-190826-4`).
- **Auto-Escalation Engine**: Periodically checks for overdue or unhandled critical tickets and notifies the relevant groups.

---

### 🗄️ 4. Hybrid Storage Architecture
- **Tabular Data**: Synced with **Google Sheets API v4** for real-time collaborative cloud access, reporting, and backup.
- **Image Storage**: **100% Local Storage** (`public/uploads/`) with strict MIME validation (`jpg`, `jpeg`, `png`, `webp`), 5MB file size limit, and automatic filename sanitization. Eliminates third-party image hosting dependency and rate limits.

---

## 💬 WhatsApp Bot Commands Reference

| Command (ID) | Command (EN) | Description |
| :--- | :--- | :--- |
| `!darurat` / `darurat` / `sos` / `tolong` / `bantuan` / `help` | `!sos` / `sos` / `emergency` / `help` | 🚨 Trigger emergency SOS report (broadcasts to all 19 groups) |
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
- **Charts & Data Visualization**: [Recharts](https://recharts.org/), [Anime.js](https://animejs.com/)
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

# 7. Run database migrations
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
3. Once linked, add the bot number to your Telunas Staff WhatsApp Groups.
4. Type **`!setgroup`** in the main announcement group chat. The bot will automatically map all 18 sub-groups and save the configuration to `config.json`.

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
