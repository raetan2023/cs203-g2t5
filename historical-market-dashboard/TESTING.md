# Teammate Testing Guide

Welcome! This guide outlines how to clone, run, and test the **Historical Market Database & Dashboard** on your local machine.

---

## 📋 Prerequisites

| Component | Required Software | Check Command |
|---|---|---|
| **Frontend** | Node.js (v18+) & npm | `node -v` and `npm -v` |
| **Backend** *(Optional)* | Java (JDK 17+) & Maven | `java -version` and `mvn -v` |
| **Database** | *None required!* The app pulls live market data via API | — |

---

## ⚡ Method 1: Quick Test (Frontend Only - Recommended)

You can launch and interact with the full graphical dashboard in **under 2 minutes** without setting up Java or a backend. The frontend will automatically pull live market data from the external Data Hub API (`https://mgo-data-api.vercel.app/`).

### Steps:

1. **Clone and navigate to the project directory**:
   ```bash
   git clone <repository-url>
   cd historical-market-db
   ```

2. **Install frontend dependencies**:
   ```bash
   cd frontend
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm start
   ```
   *(Alternatively, from the project root you can run: `npm install --prefix frontend && npm start`)*

4. **Open the graphical dashboard in your browser**:
   👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🚀 Method 2: Full-Stack Test (Spring Boot Backend + React Frontend)

If you want to test the complete multi-tier architecture with the local Java Spring Boot REST API:

### Step 1: Start the Spring Boot Backend (Terminal 1)
```bash
cd backend
mvn spring-boot:run
```
Wait until the terminal logs display:
```
Started MarketDashboardApplication in X.XXX seconds
```
The backend REST API is now listening on port `8080`.

#### Test the backend endpoint directly:
* **In your browser**: Open **[http://localhost:8080/api/v1/market/dashboard](http://localhost:8080/api/v1/market/dashboard)**
* **In terminal (Bash / Mac / Linux / Git Bash)**:
  ```bash
  curl http://localhost:8080/api/v1/market/dashboard
  ```
* **In PowerShell**:
  ```powershell
  curl.exe http://localhost:8080/api/v1/market/dashboard
  ```
*(Note: Visiting port 8080 returns machine-readable JSON text payload).*

### Step 2: Start the React Frontend (Terminal 2)
In a new terminal window:
```bash
cd frontend
npm install
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser. Vite will proxy `/api` requests to your local Spring Boot backend on port 8080.

---

## ✅ What to Look for & Verify

When viewing **[http://localhost:3000](http://localhost:3000)**:

1. **Top Navigation Bar**:
   - Clean navigation header featuring the cyan hamburger menu toggle button on the left.
   - The Bunker Buddy logo and text have been removed.
   - The scenario badge (`HISTORICAL VIEW · AS OF [DATE]`) appears on the right.
2. **Ticker Cards (4 Cards)**:
   - Singapore MGO (observed quote in USD/MT)
   - Gasoil Futures (estimated proxy in USD/bbl)
   - Brent Crude (observed quote in USD/bbl)
   - USD Index (macro currency benchmark)
   - Live price values, badges, and percentage changes should be displayed.
3. **MGO History & Forecast Chart**:
   - Interactive line chart visualizing historical observed quotes and derived estimates.
   - Hover over data points to inspect the tooltip date and price.
4. **Selected Indicators Table**:
   - Displays Brent-Dubai Spread, Gasoil 10ppm Crack, MGO Volatility, and Singapore Bunker Sales Volume.
5. **Slide-out Navigation Drawer**:
   - Click the hamburger button (☰) in the top-left corner to open the sidebar.
   - Click anywhere on the dark backdrop or the close button (`<`) to collapse it.

---

## ❓ Frequently Asked Questions & Troubleshooting

### Q1: Why do I only see raw text or JSON in my browser?
* If your browser shows raw text like `{"scenarioDate":"2026-09-16","tickers":[...]}`:
  * You opened the **backend API URL** (`http://localhost:8080/...`). Port 8080 is only a REST API.
  * To see the **visual dashboard interface**, go to **[http://localhost:3000](http://localhost:3000)**.

### Q2: Do I need to set up a PostgreSQL or Supabase database?
* **No.** Database auto-configuration has been intentionally disabled in `backend/src/main/resources/application.properties`. Both the backend and frontend automatically pull live quotes from the cloud API (`https://mgo-data-api.vercel.app/`).

### Q3: `npm start` fails with "module not found"
* You must run `npm install` inside the `frontend/` folder after cloning from GitHub:
  ```bash
  cd frontend
  npm install
  npm start
  ```

### Q4: `curl: (7) Failed to connect to localhost port 8080`
* This means the Java Spring Boot backend is not running.
* You can either start the backend in `backend/` using `mvn spring-boot:run`, or simply test the frontend alone on `http://localhost:3000` (which automatically fetches live data even if port 8080 is offline).

### Q5: `Invoke-RestMethod: command not found`
* `Invoke-RestMethod` is a Windows PowerShell command. If you are using Git Bash, WSL, or macOS/Linux terminal, use standard `curl`:
  ```bash
  curl http://localhost:8080/api/v1/market/dashboard
  ```
