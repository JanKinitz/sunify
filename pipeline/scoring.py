"""Tourismus-Score (0–100) und Orts-Merkmale.

Grundlage: Bekanntheit (Wikipedia-Sprachversionen), Merkmale aus Wikidata (Kurort, Seebad, Skigebiet,
Denkmal, See, Meer), Höhenlage, Foto vorhanden und Einwohnerzahl. Große Städte erhalten einen kleinen
Abzug, damit charmante Ausflugsziele vor Industriestädten stehen. Die von Hand bewerteten Ziele aus
Version 1.0 (DACH) überschreiben den berechneten Wert.
"""

from __future__ import annotations

import json
import math
import unicodedata
from pathlib import Path

from .geonames import Place

CURATED_FILE = Path(__file__).resolve().parent / "data" / "curated_destinations.json"

KIND_BONUS = {"wellness": 10, "coast": 9, "mountains": 8, "historic": 7, "lake": 8}


def score_place(place: Place, sitelinks: int, has_image: bool) -> int:
    s = 20.0
    s += 6.0 * math.log1p(max(0, sitelinks))  # 10 → 14, 50 → 24, 300 → 34
    for kind in place.tags & KIND_BONUS.keys():
        s += KIND_BONUS[kind]
    elev = place.elevation or 0
    if elev >= 800:
        s += 6
    elif elev >= 500:
        s += 3
    if has_image:
        s += 3
    pop = place.population
    if 2_000 <= pop < 60_000:
        s += 4
    elif pop >= 500_000:
        s -= 6
    elif pop >= 150_000:
        s -= 3
    return int(max(0, min(92, round(s))))


def derive_tags(place: Place) -> None:
    elev = place.elevation or 0
    if elev >= 600:
        place.tags |= {"mountains", "hiking"}
    if "mountains" in place.tags:
        place.tags.add("hiking")
    if place.population >= 100_000 or place.feature_code in {"PPLC", "PPLA"}:
        place.tags.add("culture")
    if place.name.startswith("Bad "):
        place.tags.add("wellness")


def _norm(name: str) -> str:
    n = name.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    n = unicodedata.normalize("NFD", n)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn").replace("sankt", "st")
    return "".join(c for c in n if c.isalnum())


def apply_curated(places: list[Place], scores: dict[int, int]) -> int:
    """Übernimmt die handgepflegten Bewertungen aus Version 1.0. Liefert die Zahl der Treffer."""
    curated = json.loads(CURATED_FILE.read_text(encoding="utf-8"))
    by_country: dict[str, list[Place]] = {}
    for p in places:
        if p.country in {"DE", "AT", "CH"}:
            by_country.setdefault(p.country, []).append(p)
    matched = 0
    taken: set[int] = set()
    for c in curated:
        key = _norm(c["name"])[:6]
        best, best_rank = None, -1e9
        for p in by_country.get(c["country"], []):
            if p.geoname_id in taken or abs(p.lat - c["lat"]) > 0.12 or abs(p.lon - c["lon"]) > 0.2:
                continue
            if not _norm(p.name).startswith(key):
                continue
            rank = (1000 if _norm(p.name) == _norm(c["name"]) else 0) + math.log10(p.population + 10) * 10
            if rank > best_rank:
                best, best_rank = p, rank
        if best is None:
            continue
        taken.add(best.geoname_id)
        matched += 1
        scores[best.geoname_id] = max(scores.get(best.geoname_id, 0), int(c["score"]))
        best.tags |= set(c["tags"])
    return matched
