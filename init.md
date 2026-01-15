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
- `REMAPP_REHYDRATE_ONLY=1`: rebuild outputs from JSONL without API calls.

## Cron
- Run `python remapp_scraper/dist/fetch_public_projects.py` on a schedule.
  - It resumes from `projects_details.jsonl` and only fetches missing details.
