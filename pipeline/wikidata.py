"""Bekanntheit, Fotos und Orts-Merkmale aus Wikidata/Wikimedia Commons.

- Bekanntheit: Anzahl der Wikipedia-Sprachversionen eines Orts (sitelinks)
- Foto: Bild-Eigenschaft P18 (Datei auf Wikimedia Commons) samt Urheber und Lizenz
- Merkmale: Kurort, Seebad, Skigebiet, Denkmalschutz, an einem See oder am Meer
Wikidata-Inhalte stehen unter CC0; die Fotos unter ihrer jeweiligen Commons-Lizenz (wird mitgespeichert).
"""

from __future__ import annotations

import html
import re
import time
from urllib.parse import unquote

from .download import get_json

SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

MAIN_QUERY = """
SELECT ?gn (MAX(?links) AS ?sitelinks) (SAMPLE(?img) AS ?image) WHERE {
  ?country wdt:P297 "%s" .
  ?item wdt:P17 ?country ; wdt:P1566 ?gn ; wikibase:sitelinks ?links .
  OPTIONAL { ?item wdt:P18 ?img }
} GROUP BY ?gn
"""

KIND_QUERY = """
SELECT DISTINCT ?gn ?kind WHERE {
  ?country wdt:P297 "%s" .
  ?item wdt:P17 ?country ; wdt:P1566 ?gn .
  { ?item wdt:P31 wd:Q4946461 . BIND("wellness" AS ?kind) }
  UNION { ?item wdt:P31 wd:Q1640824 . BIND("coast" AS ?kind) }
  UNION { ?item wdt:P31 wd:Q130003 . BIND("mountains" AS ?kind) }
  UNION { ?item wdt:P1435 ?heritage . BIND("historic" AS ?kind) }
  UNION { ?item wdt:P206 ?w . ?w wdt:P31 ?wt . VALUES ?wt { wd:Q23397 wd:Q131681 } BIND("lake" AS ?kind) }
  UNION { ?item wdt:P206 ?w . ?w wdt:P31 ?wt . VALUES ?wt { wd:Q165 wd:Q9430 wd:Q39594 wd:Q1322134 } BIND("coast" AS ?kind) }
}
"""


def _sparql(query: str) -> list[dict]:
    data = get_json(
        SPARQL,
        data={"query": query},
        headers={"Accept": "application/sparql-results+json"},
        timeout=90,
        retries=3,
    )
    return data["results"]["bindings"]


def _gid(value: str) -> int | None:
    value = value.strip()
    return int(value) if value.isdigit() else None


def file_name_from_url(url: str) -> str:
    """http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20bar.jpg -> 'Foo bar.jpg'"""
    return unquote(url.rsplit("/", 1)[-1]).replace("_", " ")[:300]


def fetch_country(country: str) -> tuple[dict[int, tuple[int, str | None]], dict[int, set[str]], str | None]:
    """Liefert ({geonameid: (sitelinks, bilddatei)}, {geonameid: {merkmale}}, fehler)."""
    info: dict[int, tuple[int, str | None]] = {}
    kinds: dict[int, set[str]] = {}
    error = None
    try:
        for row in _sparql(MAIN_QUERY % country):
            gid = _gid(row["gn"]["value"])
            if gid is None:
                continue
            links = int(row.get("sitelinks", {}).get("value", 0) or 0)
            img = row.get("image", {}).get("value")
            info[gid] = (links, file_name_from_url(img) if img else None)
    except Exception as e:  # Zeitüberschreitung bei sehr großen Ländern: Ort bekommt nur den Grundwert
        error = f"Hauptabfrage: {e}"
    time.sleep(1)
    try:
        for row in _sparql(KIND_QUERY % country):
            gid = _gid(row["gn"]["value"])
            if gid is not None:
                kinds.setdefault(gid, set()).add(row["kind"]["value"])
    except Exception as e:
        error = (error + "; " if error else "") + f"Merkmale: {e}"
    time.sleep(1)
    return info, kinds, error


_TAG_RE = re.compile(r"<[^>]+>")


def clean_artist(raw: str) -> str:
    text = html.unescape(_TAG_RE.sub("", raw or "")).strip()
    return re.sub(r"\s+", " ", text)[:200]


ALLOWED_LICENSE = re.compile(r"^(CC0|CC BY(-SA)?( \d\.\d)?|Public domain|PD.*)", re.I)


def fetch_image_credits(files: list[str]) -> dict[str, tuple[str, str]]:
    """{datei: (urheber, lizenz)} – nur frei nutzbare Lizenzen (CC0, CC BY, CC BY-SA, gemeinfrei)."""
    out: dict[str, tuple[str, str]] = {}
    for i in range(0, len(files), 50):
        batch = files[i : i + 50]
        try:
            data = get_json(
                COMMONS_API,
                params={
                    "action": "query",
                    "format": "json",
                    "formatversion": "2",
                    "prop": "imageinfo",
                    "iiprop": "extmetadata",
                    "iiextmetadatafilter": "Artist|LicenseShortName",
                    "titles": "|".join(f"File:{f}" for f in batch),
                },
                timeout=60,
            )
        except Exception as e:
            print(f"   Commons-Abfrage übersprungen: {e}", flush=True)
            continue
        normalized = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
        for page in data.get("query", {}).get("pages", []):
            info = (page.get("imageinfo") or [{}])[0].get("extmetadata", {})
            license_name = (info.get("LicenseShortName", {}) or {}).get("value", "").strip()
            if not license_name or not ALLOWED_LICENSE.match(license_name):
                continue
            title = normalized.get(page.get("title", ""), page.get("title", ""))
            name = title.split(":", 1)[-1]
            artist = clean_artist((info.get("Artist", {}) or {}).get("value", "")) or "Unbekannt"
            out[name] = (artist, license_name[:80])
        time.sleep(0.5)
    return out
