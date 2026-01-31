
import requests
import os

LIST_URL = "https://my.remapp.ae/api/project/public/list"

def get_total_count():
    # Fetch just the first page to get metadata
    response = requests.post(LIST_URL, json={"page": 1})
    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        return
    
    data = response.json()
    meta = data.get("data", {})
    
    total = meta.get("total")
    per_page = meta.get("per_page")
    last_page = meta.get("last_page")
    
    print(f"Total Projects from API: {total}")
    print(f"Per Page: {per_page}")
    print(f"Last Page: {last_page}")

if __name__ == "__main__":
    get_total_count()
