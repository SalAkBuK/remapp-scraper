# Deployment Guide

## Quick Deployment Steps

### 1. Pull Latest Changes
```bash
cd /path/to/remapp_scraper
git pull origin master
```

### 2. Verify Files Are Present
```bash
ls -la .htaccess  # Should exist
ls -la server.js  # Should be updated
```

### 3. Restart Node.js App
```bash
# If using PM2
pm2 restart all

# If using cPanel Node.js app
# Go to cPanel → Setup Node.js App → Click "Restart"

# If using systemd
sudo systemctl restart your-app-name
```

### 4. Test the Fix
```bash
# Test status endpoint (no auth)
curl https://api.worthysproperties.com/refresh/status

# Test refresh endpoint (with auth)
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.worthysproperties.com/refresh
```

## What Changed

### New Files
- `.htaccess` - Disables ModSecurity to allow POST requests
- `REFRESH_API.md` - Complete API documentation
- `TROUBLESHOOTING.md` - Troubleshooting guide

### Updated Files
- `server.js` - Added `/refresh/status` endpoint

## Expected Results

✅ **Before fix:** 403 Forbidden (HTML error page)  
✅ **After fix:** 200 OK (JSON response with refresh status)

## If Still Getting 403

1. **Check .htaccess is uploaded** - Make sure the file is in the root directory
2. **Check file permissions** - `.htaccess` should be readable (644)
3. **Check LiteSpeed WAF** - May need to disable in cPanel
4. **Contact hosting support** - Ask them to allow POST to `/refresh`

## Folder Structure

Your deployed app should look like:
```
/path/to/remapp_scraper/
├── .htaccess              ← NEW (fixes 403)
├── .env                   ← Contains API_KEY
├── server.js              ← Updated
├── REFRESH_API.md         ← NEW (documentation)
├── TROUBLESHOOTING.md     ← NEW (help guide)
├── dist/
│   ├── projects_from_api.json
│   ├── projects_details_by_fk.json
│   ├── incremental_state.json
│   └── fetch_public_projects.py
└── node_modules/
```

## Environment Variables (cPanel)

Make sure these are set in cPanel → Node.js App → Environment Variables:
- `API_KEY=your_secret_key_here`
- `PORT=3000` (or your port)
- `REMAPP_BEARER_TOKEN=...` (optional, for auto-refresh)
- `REMAPP_USERNAME=...` (optional)
- `REMAPP_PASSWORD=...` (optional)

## Testing Checklist

- [ ] `/health` returns 200 OK
- [ ] `/refresh/status` shows `refreshAvailable: true`
- [ ] `POST /refresh` with correct key returns 200 OK (not 403)
- [ ] `/projects` returns project list
- [ ] `/projects/2604` returns project details

## Rollback Plan

If something breaks:
```bash
git checkout HEAD~1  # Go back one commit
pm2 restart all
```
