import json
import os
import time
import gc
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests


LIST_URL = "https://my.remapp.ae/api/project/public/list"
DETAIL_URL = "https://my.remapp.ae/api/project/details"
LOGIN_URL = "https://my.remapp.ae/api/login"
ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = Path(__file__).resolve().parent
ENV_PATH = ROOT_DIR / ".env"
DETAIL_SLEEP_SECONDS = 0.5
MAX_RETRIES = 5
RETRY_BACKOFF_SECONDS = 5
DETAILS_JSONL_PATH = OUTPUT_DIR / "projects_details.jsonl"
LOG_EVERY = 50
LIST_CACHE_PATH = OUTPUT_DIR / "projects_from_api.json"
DETAILS_ERROR_PATH = OUTPUT_DIR / "projects_details_errors.jsonl"
INCREMENTAL_STATE_PATH = OUTPUT_DIR / "incremental_state.json"
DETAIL_BATCH_STATE_PATH = OUTPUT_DIR / "detail_batch_state.json"


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


def save_env_value(path: Path, key: str, value: str) -> None:
    lines: List[str] = []
    if path.is_file():
        lines = path.read_text(encoding="utf-8").splitlines()
    updated = False
    for idx, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[idx] = f"{key}={value}"
            updated = True
            break
    if not updated:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_headers(token: Optional[str]) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://offplan.remapp.ae",
        "Referer": "https://offplan.remapp.ae/",
        "User-Agent": "Mozilla/5.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_page(page: int, token: Optional[str]) -> Dict[str, Any]:
    payload = {"page": page}
    response = requests.post(
        LIST_URL, headers=build_headers(token), json=payload, timeout=30
    )
    response.raise_for_status()
    return response.json()


def extract_projects(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    data = payload.get("data", {})
    return data.get("data", []) if isinstance(data, dict) else []


def get_total_pages(payload: Dict[str, Any]) -> Optional[int]:
    data = payload.get("data", {})
    if not isinstance(data, dict):
        return None
    total = data.get("total")
    per_page = data.get("per_page")
    if isinstance(total, int) and isinstance(per_page, int) and per_page > 0:
        return (total + per_page - 1) // per_page
    return None


def fetch_detail(
    slug: Optional[str], project_id: Optional[int], token: Optional[str]
) -> Tuple[Dict[str, Any], int]:
    payload: Dict[str, Any] = {}
    if project_id is not None:
        payload["fk_project_id"] = project_id
    elif slug:
        payload["slug"] = slug
    else:
        raise ValueError("Missing slug and id for project detail request.")

    response = requests.post(
        DETAIL_URL, headers=build_headers(token), json=payload, timeout=30
    )
    if response.status_code == 422 and slug:
        payload = {"slug": slug}
        response = requests.post(
            DETAIL_URL, headers=build_headers(token), json=payload, timeout=30
        )
    response.raise_for_status()
    return response.json(), response.status_code


def login(username: str, password: str) -> str:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Device": "2",
        "Origin": "https://v3.remapp.ae",
        "Referer": "https://v3.remapp.ae/",
        "User-Agent": "Mozilla/5.0",
    }
    payload = {"username": username, "password": password, "rememberMe": False}
    response = requests.post(LOGIN_URL, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    token = extract_token(data)
    if not token:
        available_keys = ", ".join(sorted(data.keys())) if isinstance(data, dict) else ""
        raise RuntimeError(
            "Login succeeded but no token found in response. "
            f"Top-level keys: {available_keys}"
        )
    return token


def extract_token(payload: Any) -> Optional[str]:
    token_keys = {"token", "access_token", "api_token", "jwt"}
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in token_keys and isinstance(value, str) and value:
                return value
            nested = extract_token(value)
            if nested:
                return nested
    elif isinstance(payload, list):
        for item in payload:
            nested = extract_token(item)
            if nested:
                return nested
    return None


def load_incremental_state() -> Optional[Dict[str, Any]]:
    """Load the last incremental fetch state."""
    if not INCREMENTAL_STATE_PATH.is_file():
        return None
    try:
        return json.loads(INCREMENTAL_STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def load_batch_state() -> Dict[str, Any]:
    """Load the detail batch rotation state."""
    if not DETAIL_BATCH_STATE_PATH.is_file():
        return {}
    try:
        return json.loads(DETAIL_BATCH_STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_batch_state(state: Dict[str, Any]) -> None:
    """Persist the detail batch rotation state."""
    DETAIL_BATCH_STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8"
    )


def save_incremental_state(projects: List[Dict[str, Any]]) -> None:
    """Save the current fetch state for incremental updates."""
    if not projects:
        return
    
    highest_id = max((p.get("id") for p in projects if isinstance(p.get("id"), int)), default=0)
    newest_created_at = None
    
    for project in projects:
        created = project.get("created_at")
        if isinstance(created, str):
            if newest_created_at is None or created > newest_created_at:
                newest_created_at = created
    
    state = {
        "last_fetch_timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "highest_project_id": highest_id,
        "newest_created_at": newest_created_at,
        "total_projects": len(projects)
    }
    
    INCREMENTAL_STATE_PATH.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")


def is_project_in_list(project_id: int, existing_projects: List[Dict[str, Any]]) -> bool:
    """Check if a project ID exists in the existing project list."""
    return any(p.get("id") == project_id for p in existing_projects if isinstance(p, dict))


def fetch_detail_with_retry(
    slug: Optional[str],
    project_id: Optional[int],
    token: Optional[str],
    username: Optional[str] = None,
    password: Optional[str] = None,
) -> Dict[str, Any]:
    current_token = token
    for attempt in range(MAX_RETRIES):
        try:
            payload, status = fetch_detail(slug, project_id, current_token)
            if status != 429:
                return payload
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else None
            
            # Handle 404 Not Found or 422 Unprocessable Entity - Project likely deleted/invalid
            if status in {404, 422, 400}:
                print(f"Project not found or invalid (status {status}) for slug={slug}, id={project_id}. Skipping.")
                return {"error": f"Project not found (status {status})"}

            # Handle unauthorized/forbidden by attempting re-login
            if status in {401, 403} and username and password:
                print(f"Received {status} for detail fetch. Attempting re-login...")
                try:
                    new_token = login(username, password)
                    save_env_value(ENV_PATH, "REMAPP_BEARER_TOKEN", new_token)
                    os.environ["REMAPP_BEARER_TOKEN"] = new_token
                    current_token = new_token
                    # Retry immediately with new token
                    payload, status = fetch_detail(slug, project_id, current_token)
                    if status != 429:
                        return payload
                except Exception as login_exc:
                    print(f"Re-login failed during retry: {login_exc}")
                    # Continue to logic below to handle 429 or raise original error
            
            if status == 429:
                pass
            elif status in {401, 403} and (not username or not password):
                raise  # No credentials to refresh with
            elif status not in {401, 403}:
                 raise # Re-raise other errors

        sleep_for = RETRY_BACKOFF_SECONDS * (2**attempt)
        time.sleep(sleep_for)

    raise RuntimeError("Exceeded retries due to rate limiting (429) or auth failures.")


def main() -> None:
    load_env_file(ENV_PATH)
    rehydrate_only = (
        os.environ.get("REMAPP_REHYDRATE_ONLY", "0").strip().lower() in {"1", "true", "yes"}
    )
    force_detail_refresh = (
        os.environ.get("REMAPP_FORCE_DETAIL_REFRESH", "0").strip().lower()
        in {"1", "true", "yes"}
    )
    detail_batch_size = int(os.environ.get("REMAPP_DETAIL_BATCH_SIZE", "0") or "0")
    detail_batch_offset = int(os.environ.get("REMAPP_DETAIL_BATCH_OFFSET", "0") or "0")
    detail_batch_auto = (
        os.environ.get("REMAPP_DETAIL_BATCH_AUTO", "1").strip().lower()
        in {"1", "true", "yes"}
    )
    batch_until_complete = (
        os.environ.get("REMAPP_BATCH_UNTIL_COMPLETE", "0").strip().lower()
        in {"1", "true", "yes"}
    )
    token = os.environ.get("REMAPP_BEARER_TOKEN")
    username = os.environ.get("REMAPP_USERNAME") or os.environ.get("REMAPP_EMAIL")
    password = os.environ.get("REMAPP_PASSWORD")
    if not token and username and password:
        token = login(username, password)
        save_env_value(ENV_PATH, "REMAPP_BEARER_TOKEN", token)
        os.environ["REMAPP_BEARER_TOKEN"] = token

    all_projects: List[Dict[str, Any]] = []
    use_local_list = os.environ.get("REMAPP_USE_LOCAL_LIST", "1").strip() in {"1", "true", "yes"}
    incremental_mode = os.environ.get("REMAPP_INCREMENTAL_MODE", "1").strip() in {"1", "true", "yes"}
    
    # Load existing projects if available
    existing_projects: List[Dict[str, Any]] = []
    if LIST_CACHE_PATH.is_file():
        try:
            existing_projects = json.loads(LIST_CACHE_PATH.read_text(encoding="utf-8"))
            print(f"Loaded {len(existing_projects)} existing projects from {LIST_CACHE_PATH}")
        except (json.JSONDecodeError, OSError):
            existing_projects = []
    
    # Load incremental state
    incremental_state = load_incremental_state() if incremental_mode else None
    
    if use_local_list and existing_projects and not incremental_mode:
        # Use cached list without incremental update
        all_projects = existing_projects
        print(f"Using cached list: {len(all_projects)} projects (incremental mode disabled)")
    elif incremental_mode and existing_projects and incremental_state:
        # Incremental mode: fetch only new projects
        print(f"Incremental mode: checking for new projects (last highest ID: {incremental_state.get('highest_project_id')})")
        new_projects: List[Dict[str, Any]] = []
        page = 1
        found_existing = False
        
        while not found_existing:
            try:
                payload = fetch_page(page, None)
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in {401, 403}:
                    if not token and username and password:
                        token = login(username, password)
                        save_env_value(ENV_PATH, "REMAPP_BEARER_TOKEN", token)
                        os.environ["REMAPP_BEARER_TOKEN"] = token
                    if not token:
                        raise SystemExit(
                            "API requires auth. Set REMAPP_BEARER_TOKEN or login creds in remapp_scraper/.env"
                        ) from exc
                    payload = fetch_page(page, token)
                else:
                    raise
            
            page_projects = extract_projects(payload)
            if not page_projects:
                break
            
            # Check if we've reached projects we already have
            for project in page_projects:
                project_id = project.get("id")
                if isinstance(project_id, int) and is_project_in_list(project_id, existing_projects):
                    found_existing = True
                    break
                new_projects.append(project)
            
            if found_existing:
                break
            
            page += 1
            # Safety limit: don't fetch more than 10 pages in incremental mode
            if page > 10:
                print("Warning: Reached page limit in incremental mode, switching to full fetch")
                incremental_mode = False
                break
        
        if new_projects:
            print(f"Found {len(new_projects)} new projects")
            # Prepend new projects to existing list
            all_projects = new_projects + existing_projects
            LIST_CACHE_PATH.write_text(json.dumps(all_projects, ensure_ascii=True, indent=2))
            print(f"Updated cache with {len(all_projects)} total projects")
        else:
            print("No new projects found")
            all_projects = existing_projects
    else:
        page = 1

        while True:
            try:
                payload = fetch_page(page, None)
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in {401, 403}:
                    # Token might be expired, try to refresh
                    if username and password:
                        print(f"Received {status} fetching list page {page}. Attempting re-login...")
                        token = login(username, password)
                        save_env_value(ENV_PATH, "REMAPP_BEARER_TOKEN", token)
                        os.environ["REMAPP_BEARER_TOKEN"] = token
                        payload = fetch_page(page, token)
                    else:
                        raise SystemExit(
                            "API requires auth. Set REMAPP_BEARER_TOKEN or login creds in remapp_scraper/.env"
                        ) from exc
                else:
                    raise
            page_projects = extract_projects(payload)
            if not page_projects:
                break
            all_projects.extend(page_projects)

            total_pages = get_total_pages(payload)
            if total_pages is not None and page >= total_pages:
                break

            page += 1

        LIST_CACHE_PATH.write_text(json.dumps(all_projects, ensure_ascii=True, indent=2))
        print(f"Saved {len(all_projects)} list items to {LIST_CACHE_PATH}")

    # For memory efficiency: only track IDs, don't load full objects into RAM yet
    seen_ids: set[int] = set()
    seen_slugs: set[str] = set()
    
    # Scan the JSONL file to build the "seen" sets without loading full objects
    # Use regex to extract IDs without parsing entire JSON objects
    if DETAILS_JSONL_PATH.is_file() and not force_detail_refresh:
        try:
            import re
            detail_count = 0
            id_pattern = re.compile(r'"(?:fk_project_id|id)":\s*(\d+)')
            slug_pattern = re.compile(r'"slug":\s*"([^"]+)"')
            
            with DETAILS_JSONL_PATH.open("r", encoding="utf-8") as f:
                for raw_line in f:
                    raw_line = raw_line.strip()
                    if not raw_line:
                        continue
                    
                    detail_count += 1
                    
                    # Extract ID without parsing JSON
                    id_match = id_pattern.search(raw_line)
                    if id_match:
                        try:
                            seen_ids.add(int(id_match.group(1)))
                        except ValueError:
                            pass
                    
                    # Extract slug without parsing JSON
                    slug_match = slug_pattern.search(raw_line)
                    if slug_match:
                        seen_slugs.add(slug_match.group(1))
            
            if detail_count > 0:
                print(f"Loaded {detail_count} existing IDs from {DETAILS_JSONL_PATH} (memory-efficient mode)")
        except OSError:
            pass # File read error, perform fresh start

    if rehydrate_only:
        print("Rehydrate-only mode: skipping API calls.")
    else:
        total = len(all_projects)
        while True:
            skipped = 0
            missing_details = 0
            batch_end = total
            if detail_batch_size > 0:
                if detail_batch_auto:
                    batch_state = load_batch_state()
                    state_offset = batch_state.get("next_offset")
                    if isinstance(state_offset, int):
                        detail_batch_offset = state_offset
                detail_batch_offset = max(detail_batch_offset, 0)
                if detail_batch_offset >= total and total > 0:
                    detail_batch_offset = 0
                batch_end = min(detail_batch_offset + detail_batch_size, total)
                print(
                    "Batch mode: processing "
                    f"{detail_batch_offset + 1}..{batch_end} of {total}"
                )
            # Determine if we should wipe the file or append
            # Only wipe if: force_detail_refresh is True AND (offset is 0 AND file doesn't exist or is empty)
            # This prevents wiping mid-cycle when offset resets to 0 in a loop
            should_wipe = False
            if force_detail_refresh and detail_batch_offset == 0:
                # Check if the file is empty or doesn't exist (truly starting fresh)
                if not DETAILS_JSONL_PATH.is_file():
                    should_wipe = True
                else:
                    try:
                        file_size = DETAILS_JSONL_PATH.stat().st_size
                        should_wipe = (file_size == 0)
                    except OSError:
                        should_wipe = True
            
            details_mode = "w" if should_wipe else "a"
            error_mode = "w" if should_wipe else "a"
            
            # Only iterate through the batch slice, not all projects
            batch_projects = all_projects[detail_batch_offset:batch_end] if detail_batch_size > 0 else all_projects
            
            with DETAILS_JSONL_PATH.open(details_mode, encoding="utf-8") as progress_file, \
                 DETAILS_ERROR_PATH.open(error_mode, encoding="utf-8") as error_file:
                
                for batch_index, item in enumerate(batch_projects):
                    # Calculate the actual index in the full list for logging
                    index = detail_batch_offset + batch_index + 1
                    
                    slug = item.get("slug") if isinstance(item, dict) else None
                    project_id = item.get("id") if isinstance(item, dict) else None

                    if not slug and project_id is None:
                        skipped += 1
                        if index % LOG_EVERY == 0:
                            print(f"Progress: {index}/{total} (skipped {skipped})")
                        continue

                    if not force_detail_refresh:
                        # Check by ID first (most reliable)
                        if isinstance(project_id, int) and project_id in seen_ids:
                            if index % LOG_EVERY == 0:
                                print(f"Progress: {index}/{total} (cached by ID)")
                            continue
                        # Fallback to slug only if ID is missing
                        if project_id is None and isinstance(slug, str) and slug in seen_slugs:
                            if index % LOG_EVERY == 0:
                                print(f"Progress: {index}/{total} (cached by slug)")
                            continue

                    try:
                        detail_payload = fetch_detail_with_retry(slug, project_id, token, username, password)
                    except requests.HTTPError as exc:
                        # fetch_detail_with_retry handles 401/403 retry looping internally if creds are provided
                        # If it raises HTTPError here, it means it couldn't recover
                        raise

                    detail_data = (
                        detail_payload.get("data") if isinstance(detail_payload, dict) else None
                    )
                    if isinstance(detail_data, dict):
                        if isinstance(project_id, int):
                            detail_data = dict(detail_data)
                            detail_data["fk_project_id"] = project_id
                        # Write to disk immediately, don't accumulate in memory
                        progress_file.write(json.dumps(detail_data, ensure_ascii=True) + "\n")
                        progress_file.flush()
                        detail_id = detail_data.get("fk_project_id") or detail_data.get("id")
                        detail_slug = detail_data.get("slug")
                        if isinstance(detail_id, int):
                            seen_ids.add(detail_id)
                        if isinstance(detail_slug, str):
                            seen_slugs.add(detail_slug)
                    else:
                        missing_details += 1
                        error_file.write(
                            json.dumps(
                                {
                                    "id": project_id,
                                    "slug": slug,
                                    "response": detail_payload,
                                },
                                ensure_ascii=True,
                            )
                            + "\n"
                        )
                        error_file.flush()

                    if index % LOG_EVERY == 0:
                        print(
                            f"Progress: {index}/{total} (skipped {skipped}, missing {missing_details})"
                        )

                    time.sleep(DETAIL_SLEEP_SECONDS)

            # Clear seen sets to free memory - they're rebuilt from JSONL on next iteration
            seen_ids.clear()
            seen_slugs.clear()
            gc.collect()  # Force garbage collection to free memory immediately

            next_offset = 0
            if detail_batch_size > 0 and detail_batch_auto and total > 0:
                next_offset = batch_end
                if next_offset >= total:
                    next_offset = 0
                save_batch_state(
                    {
                        "next_offset": next_offset,
                        "last_total": total,
                        "last_run": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                        "batch_size": detail_batch_size,
                    }
                )
            
            # Check if we should continue for the next cycle
            if batch_until_complete and next_offset != 0:
                print(f"Full Cycle Mode: Continuing to next batch (offset {next_offset})")
                continue
            else:
                break

    # Only perform the merge if we're not in the middle of batch processing
    # Skip merge if:
    # 1. We're in batch mode (detail_batch_size > 0)
    # 2. AND we're not at the final batch (next_offset != 0)
    skip_merge = False
    if detail_batch_size > 0:
        batch_state = load_batch_state()
        state_offset = batch_state.get("next_offset", 0)
        # Skip merge if next_offset is not 0 (meaning more batches to process)
        if state_offset != 0:
            skip_merge = True
            print(f"Skipping merge step - batch processing incomplete (next offset: {state_offset})")
        else:
            print(f"Performing final merge - all batches complete")
    
    if not skip_merge:
        # Now that batch processing is complete, load all details from disk for final merge
        # Use streaming to avoid loading entire file into memory
        details: List[Dict[str, Any]] = []
        if DETAILS_JSONL_PATH.is_file():
            try:
                with DETAILS_JSONL_PATH.open("r", encoding="utf-8") as f:
                    for raw_line in f:
                        raw_line = raw_line.strip()
                        if not raw_line:
                            continue
                        try:
                            detail = json.loads(raw_line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(detail, dict):
                            details.append(detail)
            except OSError:
                details = []
        
        print(f"Loaded {len(details)} total details from disk for final merge")
        
        # Write details.json without indent to save memory
        details_output_path = OUTPUT_DIR / "projects_details.json"
        with details_output_path.open("w", encoding="utf-8") as f:
            json.dump(details, f, ensure_ascii=True)
        print(f"Saved {len(details)} project details to {details_output_path}")

        details_by_id: Dict[int, Dict[str, Any]] = {}
        details_by_slug: Dict[str, Dict[str, Any]] = {}
        details_by_fk: Dict[int, Dict[str, Any]] = {}
        for detail in details:
            if not isinstance(detail, dict):
                continue
            detail_fk = detail.get("fk_project_id")
            detail_id = detail_fk or detail.get("id")
            detail_slug = detail.get("slug")
            if isinstance(detail_id, int):
                details_by_id[detail_id] = detail
            if isinstance(detail_slug, str):
                details_by_slug[detail_slug] = detail
            if isinstance(detail_fk, int):
                details_by_fk[detail_fk] = detail

        merged: List[Dict[str, Any]] = []
        for item in all_projects:
            if not isinstance(item, dict):
                continue
            item_id = item.get("id")
            item_slug = item.get("slug")
            detail = None
            if isinstance(item_id, int):
                detail = details_by_id.get(item_id)
            if detail is None and isinstance(item_slug, str):
                detail = details_by_slug.get(item_slug)
            if detail is None:
                merged.append(item)
                continue
            combined = dict(item)
            combined["details"] = detail
            merged.append(combined)
            if isinstance(item_id, int):
                details_by_fk[item_id] = detail

        merged_output_path = OUTPUT_DIR / "projects_merged.json"
        with merged_output_path.open("w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=True)
        print(f"Saved {len(merged)} merged projects to {merged_output_path}")

        details_by_fk_path = OUTPUT_DIR / "projects_details_by_fk.json"
        with details_by_fk_path.open("w", encoding="utf-8") as f:
            json.dump(details_by_fk, f, ensure_ascii=True)
        print(f"Saved {len(details_by_fk)} details by fk to {details_by_fk_path}")
    
    # Save incremental state for next run
    if incremental_mode and all_projects:
        save_incremental_state(all_projects)
        print(f"Saved incremental state to {INCREMENTAL_STATE_PATH}")


if __name__ == "__main__":
    main()
