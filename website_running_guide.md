# How to Run and Test the Whole Website Locally

Choose the instructions for your operating system:

- [macOS](#macos)
- [Windows](#windows)

The website needs two terminals running at the same time:

```text
Terminal 1: Spring Boot backend
Terminal 2: React frontend
```

## Values to get from the team first

Ask the team privately for:

- Supabase database host
- Supabase database username
- Supabase database password
- Clerk publishable key beginning with `pk_test_`
- Clerk issuer URL ending with `.clerk.accounts.dev`


# macOS

## Install beforehand

Install:

1. [Git](https://git-scm.com/download/mac)
2. [Node.js](https://nodejs.org/) version 22.12 or newer
3. [Java JDK](https://adoptium.net/) version 21


Check the installations in Terminal:

```bash
git --version
node --version
npm --version
java --version
```

## Step 1: Start the backend

Open Terminal in the project folder, then run:

```bash
cd backend

export SUPABASE_DB_URL='jdbc:postgresql://SUPABASE_HOST:5432/postgres?sslmode=require'
export SUPABASE_DB_USER='postgres.PROJECT_REF'
export SUPABASE_DB_PASSWORD='YOUR_DATABASE_PASSWORD'
export CLERK_ISSUER_URI='https://YOUR-CLERK-DOMAIN.clerk.accounts.dev'
export FRONTEND_ORIGINS='http://127.0.0.1:5173,http://localhost:5173'

./mvnw spring-boot:run
```

Replace the uppercase placeholders with the team's values. Keep this terminal open.

Check that the backend is working by opening:

```text
http://127.0.0.1:8000/health
```

## Step 2: Start the frontend

Open a second Terminal in the project folder, then run:

```bash
cd frontend
npm install
cp .env.example .env.local
nano .env.local
```

Set the file to:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_TEAM_KEY
VITE_API_URL=http://127.0.0.1:8000
VITE_API_KEY=mgo_public_demo_2026
```

In `nano`, press `Control+O`, press `Enter`, and then press `Control+X` to save and exit.

Start the frontend:

```bash
npm run dev
```

Keep this terminal open.

## Step 3: Test the website

Open:

```text
http://127.0.0.1:5173
```

Test these actions:

1. Register or sign in using Google, Microsoft/Outlook, or email.
2. Confirm that the website opens the Home page.
3. Open **Purchase plans**.
4. Create a plan with a quantity greater than zero and a deadline on or after `2025-10-24`.
5. Refresh the browser and confirm that the plan is still there.
6. Edit and delete the plan.
7. Sign out and confirm that `/purchase-plans` redirects to `/login`.

# Windows

## Install beforehand

Install:

1. [Git for Windows](https://git-scm.com/download/win)
2. [Node.js](https://nodejs.org/) version 22.12 or newer
3. [Java JDK](https://adoptium.net/) version 21

You do not need to install Maven because the project includes the Maven wrapper.

Check the installations in PowerShell:

```powershell
git --version
node --version
npm --version
java --version
```

## Step 1: Start the backend

Open PowerShell in the project folder, then run:

```powershell
cd backend

$env:SUPABASE_DB_URL='jdbc:postgresql://SUPABASE_HOST:5432/postgres?sslmode=require'
$env:SUPABASE_DB_USER='postgres.PROJECT_REF'
$env:SUPABASE_DB_PASSWORD='YOUR_DATABASE_PASSWORD'
$env:CLERK_ISSUER_URI='https://YOUR-CLERK-DOMAIN.clerk.accounts.dev'
$env:FRONTEND_ORIGINS='http://127.0.0.1:5173,http://localhost:5173'

.\mvnw.cmd spring-boot:run
```

Replace the uppercase placeholders with the team's values. Keep this PowerShell window open.

Check that the backend is working by opening:

```text
http://127.0.0.1:8000/health
```

## Step 2: Start the frontend

Open a second PowerShell window in the project folder, then run:

```powershell
cd frontend
npm install
```

edit .env.example the file to:

```env.
VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_TEAM_KEY
VITE_API_URL=http://127.0.0.1:8000
VITE_API_KEY=mgo_public_demo_2026
```


```powershell
npm run dev
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd run dev
```

Keep this PowerShell window open.

## Step 3: Test the website

Open:

```text
http://127.0.0.1:5173
```

Test these actions:

1. Register or sign in using Google, Microsoft/Outlook, or email.
2. Confirm that the website opens the Home page.


# Quick troubleshooting

## The backend does not start

- Confirm Java 21 is installed.
- Confirm the three `SUPABASE_DB_*` values are correct.
- Confirm the database URL starts with `jdbc:postgresql://`.
- Confirm the URL ends with `?sslmode=require`.
- Set the variables and run Spring Boot in the same terminal.

## The frontend stays on “Loading your session”

- Check the Clerk publishable key in `frontend/.env.local`.
- Confirm that it begins with `pk_test_`.
- Stop the frontend with `Ctrl+C` and run `npm run dev` again.

## The frontend cannot connect to Spring Boot

- Confirm the backend terminal is still running.
- Open `http://127.0.0.1:8000/health`.
- Confirm `VITE_API_URL=http://127.0.0.1:8000`.

## A protected request returns `401 Unauthorized`

- Confirm the Clerk issuer URL belongs to the same Clerk application as the frontend publishable key.
- Sign out and sign in again.

## Stop the website

Press `Ctrl+C` in both terminal windows.

# Optional automated tests

Frontend:

```bash
cd frontend
npm test
npm run build
```

Backend on macOS:

```bash
cd backend
./mvnw test
```

Backend on Windows:

```powershell
cd backend
.\mvnw.cmd test
```
