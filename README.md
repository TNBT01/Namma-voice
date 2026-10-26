# NAMMA VOICE — APS College of Arts and Science
> **NAMMA COLLEGE. NAMMA VOICE.**  
> *Your Campus. Your Voice. Your Future.*  
> **"Students speak. The campus listens. Problems get resolved."**

---

## 1. Project Overview

**NAMMA VOICE** is an institutional student grievance redressal and academic resource repository developed for **APS College of Arts and Science**. Built as a final-year Bachelor of Computer Applications (BCA) capstone project, it replaces informal complaint boxes and lost paper petitions with a transparent, digitized grievance lifecycle and past examination paper repository.

### Core Capabilities:
- **Student Registration & Login:** Students register with their full name, College Registration Number (or auto-assigned unique ID), a required valid email address, course, semester, and password. Student email OTP verification is temporarily paused; new accounts can sign in immediately.
- **Student Grievance Lifecycle:** Students report infrastructure, lab, library, canteen, water, electrical, and facility issues with location details and evidence attachments.
- **Sequential Tracking Identifiers:** Every grievance receives a formal reference ID (e.g. `NV-2026-001`).
- **Administrative Dispatch Console:** Administrators review issues, assign campus maintenance departments, update workflow status (*Pending*, *In Progress*, *Resolved*), and append official audit remarks.
- **Chronological History Trail:** Every status transition is immutably recorded in SQLite with timestamps and actor details.
- **Academic Resource Archive:** Administrators upload syllabus and previous year university question papers (PDF format); students search, preview, and download them.
- **Forgot Password & Recovery:** Students and administrators verify a short-lived email OTP before setting a new password. OTP hashes are stored; codes are single-use and rate-limited.
- **No Default Demo Logins:** The user-facing app does not provide default demo accounts, demo passwords, or auto-fill buttons.


## Complaint Privacy & Launch State

Complaint records retain an internal student relationship so students can view their own submissions and the system can enforce ownership checks. Administrator complaint APIs and screens omit student names, registration numbers, emails, phone numbers, account IDs, and profile data. Complaint attachments are delivered through authenticated owner/admin routes; they are not public static files. A complaint can still contain identifying information if a student includes it in text or an image, and operators with direct database access can see the internal relationship.

The server does not seed complaint records. Existing complaint and account data may be present in the configured local database; do not infer that it is empty from an older snapshot or documentation. Complaint ownership links remain in SQLite for student history and authorization, while admin complaint responses omit student account identifiers.

---

## 2. Technology Stack & Architecture

- **Frontend:** Responsive HTML5, Vanilla JavaScript, CSS3, Fetch API, Chart.js (pure web standards for performance, clarity, and viva examination).
- **Backend:** Node.js, Express.js REST API with modular routes, controllers, middleware, and rate limiting.
- **Database:** SQLite with WebAssembly engine (`database/namma_voice.sqlite`), foreign keys enabled, parameterized SQL queries (preventing SQL injection), and transaction safety.
- **Security:** `bcryptjs` password hashing (12 rounds), server-managed session cookies (`express-session`), hashed cryptographic email OTPs, account/IP rate limits, Helmet security headers, and Multer upload restrictions.

---

## 3. Local Setup Instructions for Windows & VS Code

These step-by-step instructions are designed specifically for your Windows computer with the project directory located at:
```text
C:\Users\sprak\Desktop\Namma voice_updated
```

### Prerequisites
1. **Node.js (LTS version recommended):**
   - Download from: [https://nodejs.org/](https://nodejs.org/)
   - Verify installation in Command Prompt or PowerShell:
     ```cmd
     node -v
     npm -v
     ```
2. **Visual Studio Code:** [https://code.visualstudio.com/](https://code.visualstudio.com/)

---

### Step-by-Step Installation & Execution

#### Step 1: Open the Project in VS Code
1. Open Visual Studio Code.
2. Click **File** → **Open Folder...**
3. Select your folder: `C:\Users\sprak\Desktop\Namma voice_updated`
4. Open the integrated terminal by pressing: `Ctrl + \`` (or **Terminal** → **New Terminal**).

#### Step 2: Install Node Dependencies
Run the following command in the VS Code terminal:
```bash
npm install
```

#### Step 3: Configure Environment Variables (`.env`)
In the VS Code terminal (or Windows Command Prompt), create your `.env` file from the example template:
```cmd
copy .env.example .env
```
*(On PowerShell, you can use: `Copy-Item .env.example .env`)*

Your `.env` file will look like:
```env
PORT=3000
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=<generate-a-unique-random-secret>
DATABASE_PATH=database/namma_voice.sqlite
MAX_FILE_SIZE=5242880
EMAIL_PROVIDER=resend
RESEND_API_KEY=<provider-api-key>
EMAIL_FROM=<address-on-a-verified-sending-domain>
EMAIL_FROM_NAME=NAMMA VOICE
# Optional; leave blank until APS College's official student email domain is confirmed.
STUDENT_EMAIL_DOMAINS=
```

#### Step 3a: Configure authentication email delivery
Create a Resend account, verify a sending domain you control, and create a sending-only API key. Set `RESEND_API_KEY`, set `EMAIL_FROM` to an address on that verified domain, and use `NAMMA VOICE` as the sender name. Keep credentials in `.env` and never commit them. Registration email verification is controlled by the single `EMAIL_VERIFICATION_ENABLED` setting, which defaults to `false`; registration does not issue an OTP or call the email provider while it is false. Password recovery still requires an emailed OTP, so it depends on the configured provider accepting email; password-change security notifications also use this provider. `STUDENT_EMAIL_DOMAINS` is an optional comma-separated allowlist; leave it blank unless the college confirms its official student email domain. Registration continues to validate email syntax and mail-domain routing. To reactivate registration verification later, set `EMAIL_VERIFICATION_ENABLED=true` after configuring the provider; the retained OTP routes and verification/resend UI become active with the same switch.

#### Step 4: Create Your Administrator Account
No default or demo administrator credentials are created. Use the interactive setup and enter an authorized administrator's details:

```bash
npm run create-admin
```

The setup prompts for a name, email address, and secure password. Existing administrator accounts are preserved.

#### Step 5: Start the Web Server
Start the local server:
```bash
npm start
```
You will see output confirming:
```text
✓ SQLite schema, migrations, and indexes verified successfully.
✓ Database initialization verified.
✓ Server running at: http://localhost:3000
==================================================
 NAMMA VOICE Portal is Ready.
 Student Registration: http://localhost:3000/student-register.html
 Administrator Setup:  npm run create-admin
==================================================
```

#### Step 6: Open the Website in Your Browser
Open your browser and navigate to:
```text
http://localhost:3000
```

---

## 4. Key Workflows to Test Locally

### 1. Student Registration & Login
1. Open `http://localhost:3000/student-register.html`.
2. Fill in:
   - Full Name: enter the student's own name
   - College Registration No: e.g. `U03AP24S001` (or leave empty to auto-generate)
   - Email: use the college email associated with the student account
   - Course: Select **BCA**, **B.Sc**, or **B.A**
   - Current Semester: Select your semester
   - Password: `Password@123`
3. Click **Complete Student Registration**.
4. You will be redirected to student sign-in. No verification email or code is required; sign in with the email and password you just registered.
5. Log out, then go to `http://localhost:3000/student-login.html` and sign in with your registered email and password.

### 2. Submitting a Campus Grievance
1. From the student dashboard, click **Raise Concern** (`/submit-complaint.html`).
2. Enter grievance title, category (e.g. *Classroom*, *Laboratory*, *Library*, *Washroom*, *Canteen*), campus location (e.g. *Room 304, 3rd Floor*), and detailed description.
3. Submit the form to receive an official tracking reference (e.g. `NV-2026-001`).
4. Click **My Complaints** (`/my-complaints.html`) to track live resolution progress.

### 3. Administrator Review & Status Dispatch
1. Open `http://localhost:3000/admin-login.html`.
2. Log in with the administrator email and password created in Step 4.
3. The **Admin Console** displays complaint status summaries, Chart.js trends, recent complaints, and recent academic resources. It does not list individual student accounts or expose database table counts.
4. Click **Grievance Management** (`/complaint-management.html`) or select any complaint.
5. Update the assigned department (e.g., *Maintenance*, *IT Department*), transition status to **In Progress** or **Resolved**, and record official admin remarks.
6. The student's complaint details page immediately reflects the updated status and chronological audit entries.

### 4. Uploading and Downloading Question Papers
1. In the Admin Dashboard (`admin-dashboard.html`), click **+ Upload Question Paper**.
2. Select course (**BCA**, **B.Sc**, or **B.A**), subject name, semester, academic year, and select a PDF file.
3. Students and visitors can browse and download digitized papers on the public **Student Resources** page (`/resources.html`).

### 5. Password Recovery
Email OTP verification for student registration is controlled by `EMAIL_VERIFICATION_ENABLED` and currently defaults to `false`. New accounts are marked verified at creation and can sign in immediately. While this flag is false, existing active students can also sign in with their password even if their stored `email_verified` value is `0`; those records are not rewritten, and session/account checks continue to enforce active status and session version. Setting the flag to `true` restores the email-verification gate for those accounts and their sessions. Password recovery remains protected by a separate short-lived email OTP and server-side reset authorization; it is available only for eligible accounts and still depends on the configured email provider. Existing unverified student accounts remain ineligible for password reset until verification is restored or an administrator resolves the account. Reset codes expire after 10 minutes, allow up to five attempts, and are single-use. Password changes invalidate existing sessions; the security notification uses the configured provider.

---

## 5. Running Automated Acceptance Tests

To verify the current integration, security, and persistence suite:
```bash
npm test
```
The test suite automatically tests:
- Required static pages and layout assets.
- Complete removal of demo credentials.
- Student registration without email OTP, frontend/backend email validation, normalized duplicate rejection (409), and immediate sign-in.
- Student authentication, session invalidation, password strength rules, OTP expiry/use/attempt checks, and recovery throttles.
- Administrator creation, authentication, and RBAC protection (403).
- Privacy checks that the admin dashboard omits student-account and database-inspector panels and that the corresponding list/count endpoints are absent.
- Complaint submission, sequential ID generation, status updates, and audit trail history.
- Academic repository listing and PDF download MIME validation.
- Student/admin OTP password reset, hashed OTP storage, expiration, one-use authorization, and password-change notification.
- Database persistence and automated backup creation.

---

## Production SEO and launch checklist

The app builds canonical URLs, `robots.txt` and `sitemap.xml` from `APP_BASE_URL`. Before public launch, deploy behind HTTPS, set `NODE_ENV=production`, configure the verified HTTPS `APP_BASE_URL`, and store a unique random `SESSION_SECRET` in the deployment secret store. Create an authorized administrator using `npm run create-admin` or the optional bootstrap variables; do not use default credentials.

Check `/robots.txt` and `/sitemap.xml`; the sitemap should contain public information pages only. Keep student dashboards, complaint details, APIs, uploads and account pages out of it. Verify that protected routes reject unauthenticated requests and return private/no-store headers. `robots.txt` is not access control; server-side authentication and authorization are required.

After deployment, verify domain ownership with the college-approved domain provider, submit the sitemap in the search console, and inspect public URLs. Run Lighthouse against the deployed HTTPS site and review performance, accessibility and failed requests. Search ranking is not guaranteed.

---

## 6. Database Backup & Safe Migration

### Creating a Snapshot Backup
Before making schema adjustments or updating packages, run:
```bash
npm run backup-db
```
This copies `database/namma_voice.sqlite` into a timestamped file inside the `backups/` directory (e.g. `backups/namma_voice_backup_YYYY-MM-DDTHH-mm-ss.sqlite`).

### Safe Database Migrations
The database initialization script (`backend/database/init-db.js`) uses safe, idempotent SQLite logic:
- `CREATE TABLE IF NOT EXISTS` ensures existing tables and records are never overwritten or dropped on startup.
- `PRAGMA table_info` checks existing column structures and applies `ALTER TABLE ... ADD COLUMN` without deleting or resetting student accounts, complaints, or resource metadata.

---

## 7. Troubleshooting Common Local Issues on Windows

### Port 3000 Conflict (`EADDRINUSE`)
If port 3000 is occupied by another application:
1. Open Command Prompt as Administrator.
2. Find the process using port 3000:
   ```cmd
   netstat -ano | findstr :3000
   ```
3. Terminate the process by PID:
   ```cmd
   taskkill /PID <PID_NUMBER> /F
   ```
4. Or alternatively, change `PORT=3001` in your `.env` file.

### Missing `node_modules`
If you receive an error like `Cannot find module 'express'`:
```bash
npm install
```

---

## 8. Database Schema Overview

```text
               +---------------------------+
               |         STUDENTS          |
               +---------------------------+
               | id (PK, AUTOINCREMENT)    |
               | student_id (TEXT, UNIQUE) |
               | name, email (UNIQUE)      |
               | phone, department         |
               | semester, password_hash   |
               | is_active (INTEGER)       |
               | email_verified (INTEGER)  |
               | session_version (INTEGER) |
               | created_at, updated_at    |
               +-------------+-------------+
                             | 1
                             |
                             | N
               +-------------v-------------+
               |        COMPLAINTS         |
               +---------------------------+
               | id (PK, AUTOINCREMENT)    |
               | complaint_id (TEXT, UNIQUE)|
               | student_id (FK)           |
               | title, description        |
               | category, location        |
               | attachment_path           |
               | assigned_department       |
               | status (Pending/In Prog.) |
               | admin_remarks             |
               | created_at, updated_at    |
               +-------------+-------------+
                             | 1
                             |
                             | N
               +-------------v-------------+
               |    COMPLAINT_HISTORY      |
               +---------------------------+
               | id (PK, AUTOINCREMENT)    |
               | complaint_id (FK)         |
               | old_status, new_status    |
               | remarks, updated_by       |
               | updated_at                |
               +---------------------------+
```

### Auxiliary Tables:
- **`admins`:** `id`, `name`, `email` (UNIQUE), `password_hash`, `department`, `role`, `is_active`, `session_version`, `created_at`, `updated_at`.
- **`resources`:** `id`, `resource_id` (UNIQUE), `title`, `department`, `subject`, `semester`, `academic_year`, `file_path`, `original_filename`, `uploaded_by`, `created_at`.
- **`password_resets`:** `id`, `user_id`, `user_type`, `token_hash`, `expires_at`, `used` (0 or 1), `created_at`.
- **`auth_otps`:** Purpose-bound OTP hashes, expiry, attempts, one-use state, and password-reset completion state.
- **`auth_otp_requests`:** HMAC-hashed email keys and request timestamps for per-address cooldowns; submitted email addresses are not stored in this table.
- **`audit_logs`:** `id`, `admin_id`, `admin_name`, `action`, `target_type`, `target_id`, `details`, `created_at`.

---

## 9. Official Project Credits & Acknowledgements

Faculty acknowledgements and project contributor credits are displayed in the website footer:

- **Associate Professor Manjunath** ? BCA / Computer Science faculty.
- **Dr. Satyashree** ? Head of the Computer Science Department.
- **Sathya Prakash** ? Developer / Project Contributor.
- **Kausar Bee S** ? Project Contributor.
