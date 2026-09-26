# Historical Market Database & Dashboard (Anjali AS - Market Context Feature)

A full-stack application displaying historical market observations, derived proxy prices, and macroeconomic indicators for maritime bunker fuel (Singapore MGO).

Data is pulled directly from the live MGO Data Hub API: **`https://mgo-data-api.vercel.app/`**.

---

## Architecture & Data Flow

```
[ https://mgo-data-api.vercel.app/ ]  (Live Data Hub)
          ▲                   ▲
          │                   │ Fallback if backend offline
          │                   │
   Spring Boot Backend   ────┼────▶   React Frontend
   (Port 8080)               │        (Port 3000)
```

1. **Direct API Integration**: No database (Supabase/PostgreSQL) setup or credentials needed to run!
2. **Dual Mode / Resilient**:
   * **Frontend-Direct Fallback**: The React app first attempts to fetch from the local Spring Boot backend. If the backend is not running, it automatically and gracefully pulls live data directly from `https://mgo-data-api.vercel.app/`.
   * **Spring Boot API Proxy**: The Spring Boot backend fetches live data from `https://mgo-data-api.vercel.app/`, maps it to clean DTOs, and exposes `/api/v1/market/dashboard`.

> 📖 **Teammate Testing Guide**: For detailed step-by-step instructions, visual verification checklist, and troubleshooting, see **[TESTING.md](TESTING.md)**.

---

## Quick Start (Frontend Only - Recommended)

You can launch and test the dashboard immediately without running any database or backend:

```bash
cd frontend
npm install
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to see the live market data!

---

## Running with Spring Boot Backend

To run the complete full-stack architecture:

1. **Start the Spring Boot backend**:
   ```powershell
   cd backend
   mvn spring-boot:run
   ```
2. **Start the React frontend** (in a separate terminal):
   ```powershell
   cd frontend
   npm start
   ```
3. Test backend endpoint directly:
   ```bash
   curl http://localhost:8080/api/v1/market/dashboard
   ```
