# CrickView — Cricket Tournament Analytics Platform

> **Tagline:** See Beyond the Score.

**CrickView** is a production-ready, full-stack cricket tournament analytics platform designed for managing corporate and club tournaments, scoring ball-by-ball matches under strict MCC cricket rules, tracking detailed player and team metrics, and generating professional sports insights.

---

## Architecture & Technology Stack

- **Architecture**: Modular Monolith
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts
- **Backend**: Node.js, Express.js, TypeScript
- **Database & ORM**: PostgreSQL, Prisma ORM
- **Validation**: Zod (shared across frontend & backend)
- **Testing**: Vitest & Supertest
- **Containers**: Docker & Docker Compose

### Directory Structure

```
d:/CrickView/
├── packages/
│   └── shared/                # Zod schemas, domain enums, cricket math helpers
├── apps/
│   ├── backend/               # Express API, Prisma schema & migrations, Scoring Engine
│   └── frontend/              # Vite React app, Dashboard, Scorer, Analytics UI
├── docker-compose.yml         # Container definitions for Postgres, Backend & Frontend
├── sample_players_import.csv  # Sample CSV template for historical data imports
└── .env.example               # Environment variables template
```

---

## Key Features

1. **Deterministic Ball-by-Ball Scoring Engine**:
   - Stores legal deliveries as pure integers (never floating-point overs).
   - Precision handling for dot balls, 1, 2, 3, 4, 6 runs.
   - Extras: Wides, No-Balls, Byes, Leg-Byes, and Penalties.
   - Wicket classification distinguishing bowler-credited dismissals (Bowled, Caught, LBW, Stumped, Hit Wicket) from non-bowler dismissals (Run Outs, Retired).
   - Strike rotation rules on odd runs and end-of-over (6 legal balls).
   - Audited delivery corrections with full immutable recalculation.

2. **Tournament & Match Operations**:
   - Multi-season support with configurable overs and points systems.
   - Team registration, player squads, toss decisions, and playing XIs.
   - Automated match finalization with margin calculations (runs or wickets).

3. **Analytics & Performance Insights**:
   - Tournament standings with Net Run Rate (NRR).
   - Top Run Scorers and Leading Wicket-Takers leaderboards.
   - Player profiles with batting average, strike rate, bowling economy, and fielding dismissals.

4. **Historical CSV & Excel Imports**:
   - File preview, schema validation, and safe row committing without fabricating missing ball-by-ball data.

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20+ or v24+
- **PostgreSQL** or **Docker**

### 2. Setup Environment
Copy the example environment file:
```bash
cp .env.example .env
```

### 3. Run Automated Tests
Execute the pure scoring engine and API test suite:
```bash
cd apps/backend
npm test
```

### 4. Build Monorepo
```bash
npm run build --workspaces
```

### 5. Running with Docker Compose
```bash
docker-compose up --build
```
- Frontend: `http://localhost` (or `http://localhost:5173` in dev mode)
- Backend API: `http://localhost:4000`
- API Health Check: `http://localhost:4000/health`

### 6. Default Admin Account
- **Email**: `admin@crickview.com`
- **Password**: `admin123`
