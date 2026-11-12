"""Ortsdaten aus GeoNames (CC BY 4.0, https://www.geonames.org): Orte > 1.000 Einwohner weltweit,
Bundesländer/Regionen und deutsche/englische Namen."""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from .download import fetch_file

BASE = "https://download.geonames.org/export/dump/"
SKIP_CODES = {"PPLH", "PPLQ", "PPLW", "PPLX", "PPLCH"}  # historisch, verlassen, zerstört, Ortsteil


@dataclass
class Place:
    geoname_id: int
    name: str
    lat: float
    lon: float
    country: str
    admin1: str
    population: int
    elevation: int | None
    feature_code: str
    timezone: str
    name_de: str | None = None
    name_en: str | None = None
    tags: set[str] = field(default_factory=set)


def _read_zip_member(path, member: str):
    with zipfile.ZipFile(path) as zf:
        with zf.open(member) as raw:
            yield from io.TextIOWrapper(raw, encoding="utf-8")


def parse_cities_lines(lines) -> list[Place]:
    places: list[Place] = []
    for line in lines:
        col = line.rstrip("\n").split("\t")
        if len(col) < 18 or col[6] != "P" or col[7] in SKIP_CODES:
            continue
        try:
            lat, lon = float(col[4]), float(col[5])
        except ValueError:
            continue
        elev_raw = col[15] or col[16]
        try:
            elev = int(float(elev_raw)) if elev_raw else None
        except ValueError:
            elev = None
        if elev is not None and elev < -500:  # -9999 = keine Angabe
            elev = None
        places.append(
            Place(
                geoname_id=int(col[0]),
                name=col[1][:200],
                lat=lat,
                lon=lon,
                country=col[8],
                admin1=col[10],
                population=int(col[14] or 0),
                elevation=elev,
                feature_code=col[7],
                timezone=col[17],
            )
        )
    return places


def load_places() -> list[Place]:
    path = fetch_file(BASE + "cities1000.zip", "cities1000.zip")
    return parse_cities_lines(_read_zip_member(path, "cities1000.txt"))


def load_admin1() -> dict[str, tuple[str, int]]:
    """'DE.02' -> ('Bavaria', geonameid)"""
    path = fetch_file(BASE + "admin1CodesASCII.txt", "admin1CodesASCII.txt")
    out: dict[str, tuple[str, int]] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            col = line.rstrip("\n").split("\t")
            if len(col) >= 4 and col[3].isdigit():
                out[col[0]] = (col[1], int(col[3]))
    return out


def pick_names_lines(lines, wanted: set[int], languages=("de", "en")) -> dict[int, dict[str, str]]:
    """Wählt je Ort und Sprache den besten Namen: bevorzugt > normal > Kurzform; ohne umgangssprachliche
    und historische Namen."""
    best: dict[tuple[int, str], tuple[int, str]] = {}
    langs = set(languages)
    for line in lines:
        col = line.rstrip("\n").split("\t")
        if len(col) < 8 or col[2] not in langs:
            continue
        try:
            gid = int(col[1])
        except ValueError:
            continue
        if gid not in wanted or col[6] == "1" or col[7] == "1":  # colloquial / historic
            continue
        rank = 3 if col[4] == "1" else (1 if col[5] == "1" else 2)
        key = (gid, col[2])
        if key not in best or rank > best[key][0]:
            best[key] = (rank, col[3][:200])
    out: dict[int, dict[str, str]] = {}
    for (gid, lang), (_, name) in best.items():
        out.setdefault(gid, {})[lang] = name
    return out


def load_names(wanted: set[int]) -> dict[int, dict[str, str]]:
    path = fetch_file(BASE + "alternateNamesV2.zip", "alternateNamesV2.zip")
    return pick_names_lines(_read_zip_member(path, "alternateNamesV2.txt"), wanted)


_offset_cache: dict[str, int] = {}


def utc_offset_hours(tz_name: str, when: datetime | None = None) -> int:
    """Aktueller UTC-Versatz einer Zeitzone in ganzen Stunden (für die Tagesgrenzen der GFS-Werte)."""
    if tz_name in _offset_cache:
        return _offset_cache[tz_name]
    try:
        offset = (when or datetime.now(timezone.utc)).astimezone(ZoneInfo(tz_name)).utcoffset()
        hours = round(offset.total_seconds() / 3600) if offset is not None else 0
    except Exception:
        hours = 0
    _offset_cache[tz_name] = hours
    return hours
