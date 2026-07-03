from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import re
import tempfile


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_FILE = DATA_DIR / "habit-data.json"
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HABIT_IDS = {
    "studying",
    "walking",
    "reading",
    "cooking",
    "cleaning",
    "workout",
    "television",
    "badminton",
}


def default_state():
    return {"completions": {}}


def load_state():
    if not DATA_FILE.exists():
        return default_state()

    try:
        with DATA_FILE.open("r", encoding="utf-8") as file:
            state = json.load(file)
    except (json.JSONDecodeError, OSError):
        return default_state()

    if not isinstance(state, dict) or not isinstance(state.get("completions"), dict):
        return default_state()

    return sanitize_state(state)


def save_state(state):
    DATA_DIR.mkdir(exist_ok=True)
    sanitized = sanitize_state(state)

    with tempfile.NamedTemporaryFile(
        "w",
        delete=False,
        dir=DATA_DIR,
        encoding="utf-8",
    ) as file:
        json.dump(sanitized, file, indent=2, sort_keys=True)
        file.write("\n")
        temp_name = file.name

    os.replace(temp_name, DATA_FILE)
    return sanitized


def sanitize_state(state):
    completions = {}

    for habit_id, dates in state.get("completions", {}).items():
        if habit_id not in HABIT_IDS or not isinstance(dates, dict):
            continue

        clean_dates = {
            date_key: True
            for date_key, is_complete in dates.items()
            if is_complete is True and DATE_PATTERN.match(date_key)
        }

        if clean_dates:
            completions[habit_id] = clean_dates

    return {"completions": completions}


class HabitRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path == "/api/state":
            self.send_json(load_state())
            return

        super().do_GET()

    def do_PUT(self):
        if self.path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON")
            return

        self.send_json(save_state(payload))

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def run():
    port = int(os.environ.get("PORT", "4174"))
    server = ThreadingHTTPServer(("127.0.0.1", port), HabitRequestHandler)
    print(f"Daily Habits backend running at http://127.0.0.1:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    run()
