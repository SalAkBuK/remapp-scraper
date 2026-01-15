# Remapp Scraper Init (API Flow)

## What this is
Python script that calls the Remapp APIs to fetch the project list + details and saves JSON outputs for CRM use.

## Key script
- `dist/fetch_public_projects.py`

## Inputs
- `.env` supports:
  - `REMAPP_BEARER_TOKEN` (optional; auto-login will set it)
  - `REMAPP_USERNAME` or `REMAPP_EMAIL`
  - `REMAPP_PASSWORD`

## Outputs (all in `dist/`)
- `projects_from_api.json`: list view data (cards).
- `projects_details.json`: full details array.
- `projects_merged.json`: list items with `details` attached.
- `projects_details_by_fk.json`: map of list `id` -> detail.
- `projects_details.jsonl`: detail cache for resume.
- `projects_details_errors.jsonl`: any invalid detail responses.

## How to run
1. Set credentials in `.env` (see `.env.example`).
2. Run:
   - `python remapp_scraper/dist/fetch_public_projects.py`

## Flags
- `REMAPP_USE_LOCAL_LIST=1` (default): use cached `projects_from_api.json`.
- `REMAPP_USE_LOCAL_LIST=0`: fetch a fresh list from the API.
- `REMAPP_INCREMENTAL_MODE=1` (default): only fetch new projects since last run.
- `REMAPP_INCREMENTAL_MODE=0`: force full refetch of all projects.
- `REMAPP_REHYDRATE_ONLY=1`: rebuild outputs from JSONL without API calls.

## Incremental Mode
- When enabled (default), the script tracks the last fetch state in `incremental_state.json`.
- On subsequent runs, it only fetches new projects by checking page 1 until it finds a known project ID.
- This dramatically reduces API calls and execution time.
- To force a full refetch, set `REMAPP_INCREMENTAL_MODE=0`.

## API Endpoints
The server (`server.js`) provides:
- `GET /projects` - List all projects with pagination
- `GET /projects/:id` - Get project details by ID
- `POST /refresh` - Trigger incremental update (requires API key)
  - Add `?full=true` to force a full refetch
- `GET /health` - Health check

## Cron
- Run `python remapp_scraper/dist/fetch_public_projects.py` on a schedule.
  - It resumes from `projects_details.jsonl` and only fetches missing details.
