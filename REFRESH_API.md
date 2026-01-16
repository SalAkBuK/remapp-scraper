# Refresh API Documentation

## Overview

The `/refresh` endpoint updates project data by fetching new projects from the Remapp API. It uses **incremental mode by default** to only fetch newly added projects, making updates fast and efficient.

## Endpoint

```
POST https://api.worthysproperties.com/refresh
```

## Authentication

Requires API key in the Authorization header:

```bash
Authorization: Bearer YOUR_API_KEY
```

## Usage

### Incremental Update (Default - Recommended)

Fetches only new projects added since the last refresh:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.worthysproperties.com/refresh
```

**What it does:**
- ✅ Fetches **only new projects** added since last refresh
- ✅ Stops when it finds a project ID it already has
- ✅ Much faster (typically only fetches page 1)
- ✅ Fewer API calls to Remapp
- ✅ Updates `projects_from_api.json` with new projects prepended

**When to use:**
- Regular scheduled updates (hourly/daily)
- Checking for new listings
- Most common use case

### Full Refresh (Force Complete Refetch)

Fetches all projects from scratch:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.worthysproperties.com/refresh?full=true
```

**What it does:**
- ⚠️ Fetches **ALL projects** from scratch
- ⚠️ Slower (fetches all pages)
- ⚠️ More API calls to Remapp
- ✅ Ensures complete data sync

**When to use:**
- First-time setup
- Data inconsistencies suspected
- After major Remapp API changes
- Rarely needed (weekly/monthly)

## Response Format

### Success Response

```json
{
  "success": true,
  "mode": "incremental",
  "output": "Loaded 2257 existing projects...\nFound 3 new projects\nUpdated cache with 2260 total projects\n..."
}
```

### Error Response

```json
{
  "error": "Refresh failed",
  "message": "Error message here",
  "stderr": "Error details"
}
```

## Recommended Setup

### Option 1: Scheduled Cron Job (Server-side)

```bash
# Every 6 hours - incremental update
0 */6 * * * curl -X POST -H "Authorization: Bearer YOUR_API_KEY" https://api.worthysproperties.com/refresh

# Weekly full refresh (Sunday 2 AM)
0 2 * * 0 curl -X POST -H "Authorization: Bearer YOUR_API_KEY" https://api.worthysproperties.com/refresh?full=true
```

### Option 2: Manual Trigger (Admin Panel)

Add a refresh button in your admin panel that calls this endpoint.

### Option 3: Scheduled Task (Node.js)

```javascript
const axios = require('axios');

// Run every 6 hours
setInterval(async () => {
  try {
    const response = await axios.post('https://api.worthysproperties.com/refresh', {}, {
      headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
    });
    console.log('Refresh successful:', response.data);
  } catch (error) {
    console.error('Refresh failed:', error.message);
  }
}, 6 * 60 * 60 * 1000); // 6 hours
```

## Performance Comparison

| Mode | Typical Time | API Calls | Projects Fetched |
|------|-------------|-----------|------------------|
| Incremental | 5-30 seconds | 1-3 pages | Only new ones |
| Full | 5-10 minutes | ~113 pages | All 2200+ projects |

## How It Works

### Incremental Mode Flow

1. Loads existing projects from `projects_from_api.json`
2. Loads last fetch state from `incremental_state.json`
3. Fetches page 1 from Remapp API
4. Compares project IDs with existing data
5. Stops when it finds a known project ID
6. Prepends new projects to the list
7. Saves updated state

### State Tracking

The system tracks:
- `last_fetch_timestamp` - When the last fetch completed
- `highest_project_id` - Highest project ID seen
- `newest_created_at` - Most recent project creation date
- `total_projects` - Total number of projects

## Data Freshness

Check the `/projects` endpoint response for data age:

```json
{
  "source": "dist/projects_from_api.json",
  "lastUpdated": "2026-01-16T10:15:36.000Z",
  "ageHours": 5.5,
  "isStale": false,
  "data": [...]
}
```

- `isStale: true` means data is older than 24 hours
- `ageHours` shows how old the data is

## Important Notes

- The endpoint runs asynchronously (may take seconds to complete)
- Data is immediately available after refresh completes
- Incremental mode has a safety limit of 10 pages
- If 10 pages are fetched without finding known projects, it switches to full fetch
- Project details are also fetched for new projects only

## Troubleshooting

### "No new projects found"
- This is normal if no new projects were added to Remapp
- The data is still fresh and up-to-date

### "Refresh failed"
- Check API credentials are correct
- Verify Python is installed on the server
- Check server logs for detailed error messages

### Data seems outdated
- Run a full refresh: `?full=true`
- Check when the last successful refresh occurred
- Verify cron job is running

## Related Endpoints

- `GET /projects` - List all projects with pagination
- `GET /projects/:id` - Get project details by ID
- `GET /health` - Health check

## Environment Variables

Configure these on your server:

- `REMAPP_INCREMENTAL_MODE=1` - Enable incremental mode (default)
- `REMAPP_INCREMENTAL_MODE=0` - Force full fetch
- `REMAPP_USE_LOCAL_LIST=1` - Use cached list (default)
- `REMAPP_BEARER_TOKEN` - Remapp API token
- `REMAPP_USERNAME` - Remapp username (for auto-login)
- `REMAPP_PASSWORD` - Remapp password (for auto-login)
