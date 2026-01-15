import json
from pathlib import Path


def main() -> None:
    data_path = Path(__file__).with_name("projects_with_presentation_links.json")
    data = json.loads(data_path.read_text(encoding="utf-8"))

    if isinstance(data, list):
        count = sum(1 for item in data if isinstance(item, dict) and item.get("title"))
    elif isinstance(data, dict):
        count = 1 if data.get("title") else 0
    else:
        count = 0

    print(count)


if __name__ == "__main__":
    main()
