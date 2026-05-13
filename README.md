# Remapp Scraper

Fetches Remapp project data, stores it as JSON, and exposes a small API for downstream systems.

## What this repo does

- Python fetcher in dist/fetch_public_projects.py pulls the project list and details from Remapp.
- Cached JSON outputs in dist/ are used by the API server.
- Node API (server.js) serves project data and provides a refresh endpoint.
- Normalization utilities in src/normalize/ convert raw scrape data into a consistent schema.

## Requirements

- Node.js 18+ (for the API server)
- Python 3.9+ (for the fetcher)
- Python package: requests (install if missing)

## Quick start

1. Install Node dependencies:
   ```bash
   npm install
   ```

2. Create a local environment file:
   ```bash
   copy .env.example .env
   ```
   Fill in your Remapp credentials.

3. Fetch project data:
   ```bash
   python dist/fetch_public_projects.py
   ```

4. Start the API server:
   ```bash
   npm start
   ```

## Environment variables

### Fetcher (Python)

Set these in .env (or your server environment):

- REMAPP_EMAIL or REMAPP_USERNAME
- REMAPP_PASSWORD
- REMAPP_BEARER_TOKEN (optional; auto-login can set it)
- REMAPP_USE_LOCAL_LIST=1 (default) or 0 to refetch the list
- REMAPP_INCREMENTAL_MODE=1 (default) or 0 for full refetch
- REMAPP_REHYDRATE_ONLY=1 to rebuild outputs from JSONL without API calls

### API server (Node)

Set these in your server environment (not in Git):

- API_KEY (required for protected endpoints)
- PORT (default 3000)
- PYTHON_PATH (optional, defaults to python3)

## API endpoints

Base URL (local): http://localhost:3000

- GET /health (no auth)
- GET /refresh/status (no auth)
- GET /projects (auth required)
- GET /projects/:id (auth required)
- POST /refresh (auth required)
  - Add ?full=true to force a full refresh

Example request:

```bash
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/projects?page=1&per_page=20
```

## Output files (dist/)

- projects_from_api.json (list view)
- projects_details.json (details array)
- projects_details_by_fk.json (id -> detail map)
- projects_merged.json (list + detail attached)
- projects_details.jsonl (detail cache)
- projects_details_errors.jsonl (invalid detail responses)
- incremental_state.json (incremental mode state)

## Normalization utilities

Normalize a single raw JSON file:

```bash
node scripts/normalize_one.js path/to/raw.json
```

Run tests:

```bash
npm test
```

## Deployment and operations

- See DEPLOYMENT.md for hosting notes and restart steps.
- See REFRESH_API.md for refresh behavior, responses, and examples.
- See TROUBLESHOOTING.md for common errors and fixes.

## Public publishing checklist

Before making this repository public:

- Remove .env and any real credentials or API keys.
- Remove or sanitize dist/*.json and projects.json.bak if they contain real data.
- Replace any real domains in examples with placeholders.
- Rotate API keys after publishing if any were ever exposed.

## License

No license has been declared. Add a LICENSE file if you plan to distribute this publicly.
