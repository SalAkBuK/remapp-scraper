# Final OOM Fix - Reduce Batch Size + Force GC

## Root Cause
Your server has a memory limit (likely 512MB or 1GB). The Python process is being killed by the OOM killer when it exceeds this limit around batch 1150-1200.

## Memory Usage Breakdown (at batch 1200)
- `all_projects` list: 2261 projects × ~2KB each = ~4.5MB
- `seen_ids` set: 1200 integers × 28 bytes = ~34KB  
- `seen_slugs` set: 1200 strings × ~100 bytes = ~120KB
- API response buffers: ~50MB per batch
- **Python overhead + requests library**: ~400-800MB 😱

The `requests` library and JSON parsing create lots of temporary objects that aren't garbage collected immediately.

## Solutions Applied

### 1. Force Garbage Collection
```python
import gc
# After each batch
gc.collect()  # Force Python to free memory NOW
```

### 2. Reduce Batch Size (Recommended)
Instead of 50 projects per batch, use 25:
```bash
REMAPP_BATCH_UNTIL_COMPLETE=1 REMAPP_DETAIL_BATCH_SIZE=25 python3 dist/fetch_public_projects.py
```

This halves the memory spike from API responses.

### 3. Alternative: Process Without Batch Loop
Run single batches and let your bash script handle the looping:
```bash
#!/bin/bash
while true; do
  # Run ONE batch, exit
  REMAPP_DETAIL_BATCH_SIZE=25 python3 dist/fetch_public_projects.py
  
  # Check if done
  next_offset=$(grep -oP '"next_offset":\s*\K\d+' dist/detail_batch_state.json 2>/dev/null || echo "0")
  [ "$next_offset" -eq 0 ] && break
  
  sleep 1
done
```

This way each Python process exits after 25 projects, freeing ALL memory before the next batch starts.

## Recommended Approach
Use option #3 (bash loop with small batches). This is the most memory-safe approach for limited RAM environments.
