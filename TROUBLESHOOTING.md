# Troubleshooting 403 Forbidden on /refresh

## Problem
Getting 403 Forbidden (LiteSpeed error page) when calling `POST /refresh`

## Diagnosis Steps

### 1. Check if Node.js app is running
```bash
curl https://api.worthysproperties.com/health
```
Expected: `{"status":"ok","time":"..."}`

### 2. Check refresh status (no auth required)
```bash
curl https://api.worthysproperties.com/refresh/status
```
Expected response:
```json
{
  "refreshAvailable": true,
  "hasState": true,
  "lastRefresh": "2026-01-16T10:15:36+0500",
  "totalProjects": 2257,
  "message": "Refresh endpoint is available"
}
```

If `refreshAvailable: false`, the `API_KEY` environment variable is not set on the server.

### 3. Test with correct API key
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ACTUAL_API_KEY" \
  https://api.worthysproperties.com/refresh
```

## Common Causes & Fixes

### Cause 1: API_KEY not set in environment
**Symptom:** `/refresh/status` shows `refreshAvailable: false`

**Fix:** Set the `API_KEY` environment variable in cPanel:
1. Go to cPanel → Node.js App
2. Add environment variable: `API_KEY=your_secret_key_here`
3. Restart the Node.js app

### Cause 2: ModSecurity blocking POST requests
**Symptom:** 403 error before reaching Node.js app

**Fix:** Disable ModSecurity for this path in `.htaccess`:
```apache
<IfModule mod_security.c>
  SecRuleEngine Off
</IfModule>
```

Or add to your `.htaccess`:
```apache
<LocationMatch "/refresh">
  SecRuleEngine Off
</LocationMatch>
```

### Cause 3: LiteSpeed blocking the request
**Symptom:** HTML error page instead of JSON

**Fix:** Check LiteSpeed Web Application Firewall (WAF) rules in cPanel

### Cause 4: Wrong API key
**Symptom:** 401 Unauthorized (JSON response)

**Fix:** Use the correct API key that matches the `API_KEY` environment variable on the server

### Cause 5: IP/Rate limiting
**Symptom:** Intermittent 403 errors

**Fix:** Whitelist your IP or increase rate limits in cPanel

## Quick Test Script

Save this as `test-refresh.sh`:

```bash
#!/bin/bash

API_KEY="your_api_key_here"
BASE_URL="https://api.worthysproperties.com"

echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq .

echo -e "\n2. Testing refresh status..."
curl -s "$BASE_URL/refresh/status" | jq .

echo -e "\n3. Testing refresh endpoint..."
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/refresh" | jq .

echo -e "\n4. Testing projects endpoint..."
curl -s -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/projects?page=1&per_page=1" | jq '.data[0].title'
```

Run: `bash test-refresh.sh`

## Server-Side Checks

SSH into your server and check:

```bash
# Check if Node.js app is running
pm2 list
# or
ps aux | grep node

# Check environment variables
pm2 env 0  # Replace 0 with your app ID

# Check logs
pm2 logs
# or
tail -f /path/to/app/logs/error.log

# Test locally on server
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/refresh
```

## Expected Behavior

✅ **Correct setup:**
- `/health` → 200 OK (JSON)
- `/refresh/status` → 200 OK (JSON with `refreshAvailable: true`)
- `POST /refresh` with correct key → 200 OK (JSON with success)
- `POST /refresh` with wrong key → 401 Unauthorized (JSON)
- `POST /refresh` without key → 401 Unauthorized (JSON)

❌ **Incorrect setup:**
- Any endpoint → 403 Forbidden (HTML) = Server/WAF blocking
- `/refresh/status` shows `refreshAvailable: false` = API_KEY not set
- `POST /refresh` → 500 error = Server configuration issue

## Contact Server Admin

If none of the above works, contact your hosting provider with:
- The exact curl command you're running
- The full error response (including HTML if applicable)
- Request to check ModSecurity and LiteSpeed WAF logs
