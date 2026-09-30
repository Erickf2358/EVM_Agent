# PCE EVM — Earned Value Management System

A construction project-controls web application for tracking **Earned Value Management**
(EVM) metrics: budget, earned value, actual cost, and schedule/cost variance across a
project's cost breakdown structure.



## Features

- **Cost Breakdown Structure (CBS)** — four-level hierarchy:
  `Project → CBS Project Group → CBS Control Account → Work Package`
- **Performance Measurement Baseline (PMB)** — each work package's budget is spread
  straight-line across its baseline working days and aggregated into monthly and
  cumulative Planned Value (PV).
- **Excel round-trip import** — download a template per level, pre-filled with that
  project's current rows plus blank rows for new ones, preview the changes (nothing is
  saved), then confirm the import.
- **EVM metrics** — per Control Account and reporting period: EV, AC, CV, SV, CPI, SPI,
  with EAC/VAC derived in the UI.
- **Visualizations** — a PMB histogram (SVG) and a PV vs EV vs AC bar chart (Recharts).
- **Auto cost activities** — each new Control Account automatically gets a synthetic
  work package to carry AC/ETC, so those costs never inflate EV.

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Python 3.13, Django 6.0, Django REST Framework, openpyxl, gunicorn |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Recharts, React Router 7 |
| Database | SQLite by default; PostgreSQL supported via `DATABASE_URL` |

## Prerequisites

- **Python 3.13+** — verify with `py --version`
- **Node.js 22.12+** (Node 24 recommended) and npm — verify with `node --version`
- Git (only if you need to pull changes)

> **Windows:** use the `py` launcher rather than bare `python`. On many Windows
> installs `python` resolves to the Microsoft Store alias stub and fails with
> *"Python was not found"*. Every command below already uses `py` or the venv's
> interpreter, so this only matters if you run `python` yourself.

## Installation

Run all commands from the repository root.

### 1. Backend

```powershell
py -m venv backend\venv
backend\venv\Scripts\python.exe -m pip install --upgrade pip
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

> The venv **must** be created at `backend\venv` — `start.ps1` hardcodes that path.

### 2. Database

```powershell
cd backend
venv\Scripts\python.exe manage.py migrate
venv\Scripts\python.exe manage.py createsuperuser   # optional, for /admin/
venv\Scripts\python.exe manage.py check
cd ..
```

`migrate` creates `backend\db.sqlite3` and applies the 11 project migrations.
No configuration file is required: with no environment variables set, the backend
falls back to SQLite, `DEBUG=True`, and CORS allows `http://localhost:5173`.

### 3. Frontend

```powershell
cd frontend
npm ci
cd ..
```

Use `npm install` instead if `package-lock.json` ever drifts out of sync with
`package.json`.

## Running the app

```powershell
.\start.ps1
```

This opens two console windows — Django on **http://localhost:8000** and Vite on
**http://localhost:5173** — and opens your browser. Pass `-NoBrowser` to suppress the
browser launch. Close the two windows to stop both servers.

To run them manually instead:

```powershell
# Terminal 1
cd backend
venv\Scripts\python.exe manage.py runserver 8000

# Terminal 2
cd frontend
npm run dev
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000/api/ |
| Health check | http://localhost:8000/api/health |
| Django admin | http://localhost:8000/admin/ |

Verify the backend with `Invoke-RestMethod http://localhost:8000/api/health`, which
should return `status: ok`. The home page also shows a live connection indicator.

## First run walkthrough

1. **Projects** → create a project (code, name, type).
2. **CBS Project Group** → add a group under the project.
3. **CBS Control Account** → add a control account under the group.
4. **Work Packages** → add work packages with budget, qty, and baseline start/end dates.
   Excel import is available on every level via the *Template / Import* controls. The
   template arrives pre-filled with the rows that level already has, so re-downloading it
   later is the easy way to bulk-edit: edit existing rows in place, add new ones at the
   bottom, then upload. Deleting a row from the spreadsheet does **not** delete it from the
   database — imports only touch the rows present in the file.
5. **Histogram** → click **Recompute PMB** to generate the Planned Value curve.
6. **Monthly Updates** → create a period, download the pre-filled progress template,
   fill in actuals, preview, and confirm. EVM metrics compute on import.

## Configuration

Local development needs no configuration. All variables are optional and read from the
environment (see `backend/.env.example` and `frontend/.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | insecure dev fallback | Django secret key |
| `DJANGO_DEBUG` | `True` | Debug mode |
| `DJANGO_ALLOWED_HOSTS` | empty | Comma-separated hosts |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed frontend origins |
| `DATABASE_URL` | SQLite file | PostgreSQL connection string |
| `VITE_API_BASE` | `http://localhost:8000` | Backend base URL (baked at build time) |

To use PostgreSQL instead of SQLite, set `DATABASE_URL` and re-run `migrate`.

> **Security:** the API has **no authentication or permissions configured** — every
> endpoint is world-writable, and `DEBUG` defaults to `True`. This is suitable for local
> or trusted-network use only. Do not expose it publicly as-is. If you set
> `DJANGO_DEBUG=False`, you must also set `DJANGO_ALLOWED_HOSTS` or Django will reject
> all requests.

## Docker

`docker-compose.yml` runs the backend (gunicorn on `:8000`) and a built frontend behind
nginx (`:80`). It expects `backend/.env` to exist and connects to an **external**
PostgreSQL instance — there is no database container in the compose file.

```powershell
Copy-Item backend\.env.example backend\.env   # then edit backend\.env
docker compose up --build
```

Note that `VITE_API_BASE` is compiled into the bundle at image build time, so it must be
an absolute URL; nginx only does SPA fallback and does not proxy `/api/`.

## Project layout

```
backend/
  config/       Django settings, root URLconf, WSGI/ASGI
  core/         Health check endpoint
  projects/     Project model + CRUD API
  cbs/          CBS models, PMB computation, Excel import/export
  monthly/      Periods, progress, EVM metric engine
frontend/
  src/api/      Typed API client modules
  src/pages/    Route components
  src/components/ Shared UI (Excel import/export, tabs, breadcrumbs)
  src/utils/    EVM grouping math and currency formatting
```

Key files:

| Concern | Path |
| --- | --- |
| PMB / PV phasing algorithm | `backend/cbs/pmb.py` |
| EVM metric engine | `backend/monthly/evm.py` |
| Excel import processors | `backend/cbs/views.py` |
| EAC/VAC math (client-side) | `frontend/src/utils/evmGrouping.ts` |
| API base URL + fetch helpers | `frontend/src/api/client.ts` |

## Troubleshooting

**`Python was not found`** — the Microsoft Store alias is shadowing your real install.
Use `py` instead of `python`, or create the venv with `py -m venv backend\venv`.

**`'venv\Scripts\python.exe' is not recognized`** (from `start.ps1`) — the venv was
created in the wrong location. It must be at `backend\venv`, created from inside the
`backend` directory or with the `-m venv backend\venv` form shown above.

**Frontend shows "backend unreachable"** — the Django server is not running on port
8000, or the two are on different hosts/ports. Check
`http://localhost:8000/api/health` directly.

**CORS errors in the browser console** — the frontend is not running on port 5173. Add
its origin to `CORS_ALLOWED_ORIGINS`.

**`DisallowedHost` errors** — you set `DJANGO_DEBUG=False` without setting
`DJANGO_ALLOWED_HOSTS`. Add `localhost,127.0.0.1`.

**Histogram or EVM charts are empty** — you must click **Recompute PMB** after adding
work packages, and import progress for a period before EVM metrics appear. Both
operations are destructive/rebuild-style: `Recompute PMB` deletes and regenerates all
PV rows for the project.

**Vite fails to start on an older Node** — Vite 8 requires Node 22.12 or newer.

**`npm audit` reports vulnerabilities** — these are in transitive build tooling
(`browserslist`, `nanoid`, `brace-expansion`) and are not included in the browser
bundle. `npm audit fix` resolves them, but it rewrites `package-lock.json`.

## Development

```powershell
cd frontend
npm run dev      # dev server
npm run build    # type-check (tsc -b) + production build
npm run lint     # ESLint
```

```powershell
cd backend
venv\Scripts\python.exe manage.py test
```

The backend suite covers the Excel template/import round-trip (pre-fill, the
cost-activity exclusion, and re-uploading an untouched file as a no-op). Everything
else is still untested.
