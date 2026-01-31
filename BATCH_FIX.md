# Critical Batch Processing Fixes

## Problems Found

1. **Data Loss Bug**: The merge step was running after every batch, overwriting `projects_details.json` with only the current batch (50 items) instead of all accumulated details (2258+ items).

2. **Bash Script Issue**: The script was checking for `batch_state.json` but Python creates `detail_batch_state.json`.

3. **Premature Deletion**: The bash script was deleting JSONL files when it detected incomplete data, causing infinite loops.

## Fixes Applied

### Python Script (`dist/fetch_public_projects.py`)
- ✅ Added `skip_merge` logic to prevent merge step during batch processing
- ✅ Merge only runs when `next_offset == 0` (cycle complete)
- ✅ Streaming file reads to reduce memory usage
- ✅ Removed `indent=2` from JSON writes to save memory

### Bash Script Fix Needed

Replace your bash loop with this corrected version:

```bash
#!/bin/bash
while true; do
  # Count details in JSONL (the source of truth during batching)
  detail_count=$(wc -l < /home/wortuckd/remapp_scraper/dist/projects_details.jsonl 2>/dev/null || echo "0")
  
  # Count projects from API
  project_count=$(grep -c '"id"' /home/wortuckd/remapp_scraper/dist/projects_from_api.json 2>/dev/null || echo "0")
  
  # Run the fetch with batch mode
  REMAPP_BATCH_UNTIL_COMPLETE=1 /usr/bin/python3 /home/wortuckd/remapp_scraper/dist/fetch_public_projects.py
  
  # Check if batch is complete (detail_batch_state.json has next_offset: 0)
  next_offset=$(grep -oP '"next_offset":\s*\K\d+' /home/wortuckd/remapp_scraper/dist/detail_batch_state.json 2>/dev/null || echo "0")
  
  if [ "$next_offset" -eq 0 ]; then
    echo "Batch processing complete!"
    break
  fi
  
  sleep 2
done >> /home/wortuckd/remapp_scraper/cron.log 2>&1
```

## Key Changes

1. **Don't delete files** - Let the script manage its own state
2. **Check `detail_batch_state.json`** not `batch_state.json`
3. **Use `REMAPP_BATCH_UNTIL_COMPLETE=1`** to enable continuous batching
4. **Count JSONL lines** not the final JSON (which doesn't exist during batching)

## Deploy Instructions

1. Copy the updated `fetch_public_projects.py` to your server
2. Update your bash script or cron job with the new logic above
3. Delete the corrupted files and restart:
   ```bash
   cd /home/wortuckd/remapp_scraper/dist
   rm projects_details.json projects_merged.json projects_details_by_fk.json
   # Keep projects_details.jsonl - it has your real data!
   ```
