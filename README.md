# 🏝️ Telunas Resort Issue Tracker & WhatsApp Bot

<p align="center">
  <img src="public/logo.png" width="160" alt="Telunas Logo">
</p>

<p align="center">
  <b>A comprehensive, real-time facility maintenance, operational scheduling & incident tracking system built specifically for Telunas Resorts.</b><br>
  Combines a modern web application, native desktop client, Google Sheets two-way cloud synchronization, 2-way Google Calendar synchronization, operational work board, multi-sheet analytics, offline outbox with late-send detection, granular RBAC security, audit logging, and an intelligent WhatsApp Community Bot integration with strict access control.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-11.x-FF2D20?style=for-the-badge&logo=laravel&logoColor=white" alt="Laravel 11">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18">
  <img src="https://img.shields.io/badge/Inertia.js-v2-9553E9?style=for-the-badge&logo=inertia&logoColor=white" alt="Inertia.js">
  <img src="https://img.shields.io/badge/TailwindCSS-v3-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/WhatsApp_Bot-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp Bot">
  <img src="https://img.shields.io/badge/Google_Calendar-2--Way_Sync-4285F4?style=for-the-badge&logo=google-calendar&logoColor=white" alt="Google Calendar">
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
- **Multi-Location Tagging**: Support for selecting multiple resort locations (`TPI`, `TBR`, `Kantor`) simultaneously with custom detail specs.
- **Full Ticket Lifecycle Management**:
  - **Claim Job**: Tag staff identity and update state to in-progress.
  - **Mark Pending**: Specify postponement reason and attach delay photo proof.
  - **Mark Solved**: Submit resolution notes and final completion photo proof.
  - **Edit & Categorize**: Update department, location, and issue category on the fly.
- **Offline Outbox & Late-Send Detection**:
  - If Wi-Fi signal drops while submitting, the ticket is safely queued locally in device memory preserving the original incident timestamp.
  - When connection is restored, tickets automatically sync to the server and are flagged as **Late Send (`⏳ Telat Terkirim`)** with delay duration (`+X menit/jam`).
  - **Interactive Toast Notification**: Floating toast popup in bottom-right corner alerts staff when offline reports are successfully synced.
  - Visual badges on **Issue Cards** and a dedicated alert container in **Activity Detail Timeline (Step 1)** comparing Input Time vs. Server Sync Time.
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
  - **In-Page PDF Exporter**: Download comprehensive printable PDF reports directly from the analytics layout (guarded by `can_export_reports` permission).
  - **Permission-Guarded Access**: Accounts restricted from analytics automatically see a friendly access-denied state with navigation controls.

---

### 📅 3. Operations & Maintenance Work Board (`/operations` / `/calendar`)
Full-fledged operational scheduling and project timeline manager:

- **Interactive Calendar Matrix**:
  - View multi-day maintenance schedules, resort improvement projects, and ongoing tasks across departments.
  - Multi-department filter with quick-toggle chips and color-coded schedule blocks.
  - Location pills showing exact locations (`TPI`, `TBR`, `Kantor`).
- **Drag-and-Drop Date Range Picker**:
  - Mini calendar range picker with multi-block selection and visual drag highlighting.
- **Task Lifecycle & Progress**:
  - Status indicators for `Aktif (Active)`, `Selesai (Done)`, and `Tertunda (Pending)`.
  - Photo attachment proof with in-modal image lightbox.
- **2-Way Google Calendar Synchronization**:
  - Push tasks from Telunas Issue Tracker to Google Calendar.
  - Pull updates and deletions from Google Calendar back to the web dashboard.
  - **Automated Scheduler**: Background scheduler (`calendar:sync-gcal`) automatically syncs every 5 minutes.
  - **Smart Soft Deletion & Restore Protection**:
    - When a task is deleted on Google Calendar, the data is preserved in Google Sheets and flagged with `Dihapus dari Google Calendar`.
    - **Restore Restriction**: Only **Administrators** or the **Head of Department (HOD)** of the task's department can restore deleted tasks.
    - Instant alert notifications sent to WhatsApp Bot and Dashboard notification center.
  - **Calendar Sync Activity Logs Modal**: Dedicated audit viewer displaying history of created, updated, deleted, and restored calendar events.
- **Export Calendar Schedule PDF**:
  - Clean, print-ready schedule exports formatted with custom resort typography and branding.
- **Automated Ops Spreadsheet Formatting**:
  - Automatically styles the Google Sheets operations tab with elegant dark navy headers (`#1E293B`), white bold text, frozen top row, clean gridlines, and badge color highlights.

---

### 👥 4. User Management & Granular RBAC (`/users`)
Enterprise-grade user management and security administration:

- **Role Presets**:
  - **Administrator**: Full system access, period/sheet creation, user approvals, and audit log inspection.
  - **Head of Department (HOD)**: Supervisory rights over department tasks, user approval verification, and restoration authority.
  - **Department User**: Scoped task management with customizable department views.
  - **Viewer (Peninjau)**: Read-only access for monitoring and reporting.
- **Granular Capability & Barrier Toggles**:
  - `can_view_all_departments`: Toggle between restricted department scope and full island-wide visibility.
  - `can_manage_issues`: Control rights to claim, delay, resolve, and update maintenance tickets.
  - `can_delete_issues`: Secure issue deletion to authorized personnel only.
  - `can_access_analytics`: Enable or restrict access to performance analytics and charts.
  - `can_access_calendar`: Control access to operational work board schedules.
  - `can_sync_google_calendar`: Control authority to trigger manual two-way Google Calendar synchronization.
  - `can_export_reports`: Permit or disable PDF and Excel report generation.
  - `can_manage_categories`: Manage and reassign category definitions.
- **Registration Approval Workflow**:
  - Self-registered staff accounts require review by Department HOD and final approval by Administrator before activating.
- **WhatsApp Phone Auto-Linking**:
  - Links staff WhatsApp numbers for instant recognition when interacting with the Bot.
- **Safe Soft Deletion (Archive / Restore)**:
  - Archive users without breaking historical issue relation links, with one-click restore.

---

### 🛡️ 5. Security Audit Trail & Visual Diff Viewer
Transparent accountability and compliance logging:

- **Comprehensive Action Tracking**:
  - Logs user creation, profile edits, permission changes, password resets, archiving, and restorations.
  - Records responsible administrator, target user, timestamp, and IP address.
- **Human-Readable Before-and-After Diff Viewer**:
  - Intelligently extracts **only the fields that changed**, eliminating raw database JSON clutter.
  - Visual before-and-after pills (e.g. `[Sebelum: Nonaktif]` ➔ `[Sesudah: Aktif]`).
  - Context-aware action badges (`Profil Diperbarui`, `Izin Diubah`, `Reset Password`, etc.).
  - Case-insensitive email normalization preventing phantom diff reports.
  - Optional expandable raw JSON viewer for technical diagnostics.

---

### 🤖 6. WhatsApp Community Bot (`whatsapp-bot/bot.js`)
Powered by `@whiskeysockets/baileys`, the bot runs alongside the web platform with multi-group intelligent routing and strict access controls:

- **Strict Access Restriction (Verified Staff Only)**:
  - **Group Chats**: Any message or command from unregistered phone numbers is **silently ignored** (*silent drop*), preventing spam and disruptions in staff groups.
  - **Private DM**: Non-registered numbers receive a firm rejection notice (`🔒 AKSES DITOLAK`) with instructions to register via the Web Dashboard.
- **Anti-Spam Rate Limiting**:
  - Rejection messages in DM are rate-limited to **maximum 1 reply per hour** per number to conserve message quota and avoid WhatsApp spam flags.
- **Automated Security Alerts to Admin & General Group**:
  - If an unregistered number attempts $\ge 3$ interactions, the bot automatically dispatches a formatted security alert to the **General Announcement Group** and **Direct Message (DM) to all registered Administrators**.
- **On-Demand Staff Directory Sync**:
  - Automatically syncs with `/api/staff-directory` on incoming messages (with 10-second debounce) so newly approved staff can interact immediately without waiting for background timers.
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

### 🗄️ 7. Hybrid Storage Architecture
- **Tabular Data**: Synced with **Google Sheets API v4** for real-time collaborative cloud access, reporting, and backup.
- **Calendar Data**: Synchronized with **Google Calendar API** with 2-way sync and background cron scheduler.
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
| `!whoami` / `!profil` / `!akun` | `!whoami` / `!profile` / `!account` | 📱 Check verified staff identity, department, and WhatsApp link |
| `!password` | `!password` | 🔑 Request Web Dashboard account login credentials |
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
- **Calendar & Spreadsheet Integration**: Google APIs Client (`Google_Service_Sheets`, `Google_Service_Calendar`)
- **Desktop Wrapper**: [Electron 34](https://www.electronjs.org/)
- **Asset Bundler**: [Vite](https://vitejs.dev/)

---

## 🚀 Installation & Local Setup

### 1. Prerequisites
- **PHP** >= 8.2 (with `gd`, `fileinfo`, `curl`, `mbstring`, `pdo_sqlite` or `pdo_mysql` extensions enabled)
- **Composer** >= 2.x
- **Node.js** >= 18.x and **npm**
- **Google Cloud Service Account JSON Key** (with Google Sheets API and Google Calendar API enabled)

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

# 6. Configure .env with your Google Sheet ID & Google Calendar ID:
# GOOGLE_SHEET_ID=your_google_spreadsheet_id_here
# GOOGLE_CALENDAR_ID=your_google_calendar_id_here

# 7. Run database migrations
php artisan migrate

# 8. Build frontend assets
npm run build
```

---

### 3. Running the Web Application & Scheduler

To run the application locally:

```bash
# Terminal 1: Start Laravel Development Server
php artisan serve

# Terminal 2: Start Laravel Task Scheduler (for 5-min Google Calendar auto-sync)
php artisan schedule:work

# Terminal 3: Start Vite Dev Server (Optional for development hot-reloading)
npm run dev
```

The web dashboard is accessible at `http://localhost:8000`.

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

- **Strict Access Verification**: Non-staff numbers are forbidden from issuing bot commands or spamming resort group chats.
- **API Keys & Secrets**: `.env`, `google-credentials.json`, `auth_info_baileys/`, and `config.json` are strictly excluded from version control via `.gitignore`.
- **Upload Hardening**: Restricts uploaded files to `image/jpeg`, `image/png`, `image/webp` (max 5MB) with server-side extension sanitization.
- **Bcrypt Password Hashing**: All user authentication accounts are hashed using standard Bcrypt.

---

## 📄 License

This project is proprietary software developed for **Telunas Resorts**. All rights reserved.
