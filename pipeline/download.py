"""HTTP-Hilfen: Downloads mit Cache, höfliche Wiederholungen."""

from __future__ import annotations

import time
from pathlib import Path

import requests

USER_AGENT = "SunifyBot/2.0 (Wetter-Rueckwaertssuche; https://github.com) python-requests"
CACHE = Path(".cache")

session = requests.Session()
session.headers["User-Agent"] = USER_AGENT


def fetch_file(url: str, name: str) -> Path:
    """Lädt eine Datei einmal herunter und legt sie unter .cache/ ab."""
    CACHE.mkdir(exist_ok=True)
    target = CACHE / name
    if target.exists() and target.stat().st_size > 0:
        return target
    print(f"   Lade {url} …", flush=True)
    with session.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        tmp = target.with_suffix(target.suffix + ".part")
        with open(tmp, "wb") as fh:
            for chunk in r.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
        tmp.rename(target)
    return target


def get_json(url: str, params=None, *, data=None, retries: int = 4, timeout: int = 90, headers=None):
    """GET/POST mit Wiederholung bei 429/5xx und Netzwerkfehlern."""
    last = "unbekannt"
    for attempt in range(retries + 1):
        if attempt:
            time.sleep(min(120, 10 * attempt * attempt))
        try:
            if data is not None:
                r = session.post(url, params=params, data=data, timeout=timeout, headers=headers)
            else:
                r = session.get(url, params=params, timeout=timeout, headers=headers)
        except requests.RequestException as e:
            last = str(e)
            continue
        if r.status_code == 429 or r.status_code >= 500:
            last = f"HTTP {r.status_code}"
            retry_after = r.headers.get("Retry-After")
            if retry_after and retry_after.isdigit():
                time.sleep(min(120, int(retry_after)))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"{url} nicht erreichbar ({last})")
