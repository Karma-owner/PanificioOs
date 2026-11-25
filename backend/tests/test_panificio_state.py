import os
import uuid

import requests


BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


def test_health_and_state_round_trip():
    health = requests.get(f"{BASE_URL}/health", timeout=15)
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    current = requests.get(f"{BASE_URL}/api/panificio/state", timeout=15)
    assert current.status_code == 200
    payload = current.json()
    assert {"mode", "notes", "batches", "stock", "returns", "recipes"}.issubset(payload)

    marker = f"TEST_{uuid.uuid4().hex[:8]}"
    payload["notes"] = list(payload["notes"]) + [{
        "id": marker,
        "shift": "Notte",
        "priority": "Normale",
        "text": marker,
        "time": "Adesso",
    }]
    saved = requests.put(f"{BASE_URL}/api/panificio/state", json=payload, timeout=15)
    assert saved.status_code == 200
    assert any(note["id"] == marker for note in saved.json()["notes"])

    reread = requests.get(f"{BASE_URL}/api/panificio/state", timeout=15)
    assert reread.status_code == 200
    assert any(note["id"] == marker for note in reread.json()["notes"])