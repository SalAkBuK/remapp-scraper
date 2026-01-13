# Remapp Scraper Init

## What this is
Node + Playwright scripts that log into `offplan.remapp.ae` and scrape off-plan project data into JSON.

## Key scripts
- `scrape.js` logs in, scrolls the project list, and writes `projects.json`.
- `scrape_details.js` logs in, opens the first project, and writes `single_project_detail.json`.
- `inspect_html.js` searches `detail_page.html` for keywords to help refine selectors.

## Inputs
- `.env` needs:
  - `REMAPP_EMAIL`
  - `REMAPP_PASSWORD`

## Outputs and artifacts
- `projects.json`: array of project cards with `title`, `district`, `price`, `image`, `handover`.
- `single_project_detail.json`: basic detail extraction (title, amenities, payment plan).
- Screenshots: `final_screenshot.png`, plus any error screenshots.
- HTML captures: `dashboard.html`, `detail_page.html` and their preview images.

## How to run
1. `npm install`
2. Set credentials in `.env` (see `.env.example`).
3. Run one of:
   - `node scrape.js`
   - `node scrape_details.js`
4. Start the API:
   - `node server.js`

## API
- `GET /projects` returns cached data with metadata.

## Cron
- `node cron_scrape.js` runs the scraper headlessly and updates `projects.json`.
- Uses `projects.json.bak` as a fallback if the new JSON is invalid.

## Notes
- Both scrapers run with `headless: false` for debugging.
- The details scraper currently clicks only the first project card.
- The sample detail output may include noisy `title` values if the page structure changes.
