"""Fehlende Ortsfotos nachtragen (eigener Datenschritt, läuft nachts in Etappen).

Quellen, alle frei und ohne Schlüssel; Urheber und Lizenz kommen je Datei von Wikimedia Commons:
  1. Wikidata-Hauptbild (P18) – auch für Orte unterhalb der Foto-Schwelle des Neuaufbaus
  2. Commons-Kategorie des Orts (Wikidata P373)
  3. Commons-Umkreissuche (2 km) – nur mit Ortsname im Dateinamen
Bei 2 und 3 zählt nur ein Foto, das nach Ortsansicht aussieht (Ansicht, Panorama, Zentrum, Kirche, Burg …,
oder der Dateiname besteht praktisch nur aus dem Ortsnamen). Innenräume, Essen, Fahrzeuge, Raumstation u. Ä.
fallen weg (Auswertung Nov. 2026: sonst jedes vierte Foto unpassend).

Ergebnisse stehen in place_images (Schlüssel: GeoNames-ID) und überstehen so einen Neuaufbau der Orte.
Auch Orte ohne Fund werden vermerkt (image_file NULL) und erst nach RETRY_DAYS erneut geprüft.
"""

from __future__ import annotations

import os
import re
import time
import unicodedata
from urllib.parse import unquote

from .download import get_json
from .wikidata import ALLOWED_LICENSE, COMMONS_API, _sparql, clean_artist

MIN_SCORE = int(os.environ.get("IMAGES_MIN_SCORE", "35"))
BATCH = int(os.environ.get("IMAGES_BATCH", "20000"))
MAX_MINUTES = float(os.environ.get("IMAGES_MAX_MINUTES", "320"))
RETRY_DAYS = 60
PAUSE = 0.2  # Sekunden zwischen Commons-Abfragen (höflich; 429 wird in get_json abgefangen)

# kein Ortsfoto: Wappen, Karten, Grafiken
NOT_A_PHOTO = re.compile(
    r"(wappen|coat[ _]of[ _]arms|blason|escudo|stemma|\bherb\b|flag|flagge|logo|\bmap\b|karte|locator|\blage\b|"
    r"location|\bplan\b|diagram|signature|unterschrift|\.svg$|\.png$|\.gif$|\.tiff?$|\.pdf$|\.webm$|\.ogv$)",
    re.I,
)
# Motive, die für ein Titelbild nicht taugen
BAD = re.compile(
    r"(iss\d|view of earth|astronaut|satellite|sentinel|interior|innenansicht|innenraum|inside|altar|orgel|\borgan\b|"
    r"vitra(il|ux)|stained glass|glasfenster|fresco|fresko|gem[aä]lde|painting|food|essen|restaurant|menu|dish|"
    r"tempura|caldereta|kindergarten|school|schule|college|insect|bird|vogel|flower|blume|bl[uü]te|mushroom|pilz|"
    r"exponat|statue|skulptur|bronze|relief|kreuzweg|grab|grave|funeral|martyr|sign\b|schild|plaque|tafel|"
    r"inscription|car\b|auto\b|bus\b|bmw|oldtimer|rallye|locomotive|lokomotive|train|\bzug\b|workers|graffiti|"
    r"nara\b|army|survey|waterworks|\bplant\b|coke|steel|band\b|en vivo|concert|konzert|hotel|portrait|porträt)",
    re.I,
)
# Motive, die nach Ortsansicht aussehen
VIEW = re.compile(
    r"(panorama|panoramica|panoramio|view|blick|ansicht|vista|veduta|aerial|a[eé]rea|luftbild|drone|dji|overview|"
    r"skyline|centre|center|zentrum|centro|centrum|ortsbild|village|dorf|town|stadt|ciudad|cidade|citt[aà]|ville|"
    r"church|kirche|iglesia|igreja|chiesa|[ée]glise|ko[sś]ci[oó][lł]|castle|schloss|burg|castello|castillo|ch[aâ]teau|"
    r"lake|\bsee\b|lago|laguna|\blac\b|river|fluss|beach|strand|playa|praia|harbou?r|hafen|porto|puerto|"
    r"square|platz|plaza|piazza|pra[cç]a|market|markt|rathaus|town hall|ayuntamiento|municipio|mairie|"
    r"mountain|berg|monte|valley|tal\b|valle)",
    re.I,
)
_SKIP_WORDS = {"sankt", "saint", "santa", "santo", "bad", "san", "sao", "the", "les", "los", "las", "del", "der", "die"}


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def place_words(place: str) -> list[str]:
    return [w for w in norm(place).split() if len(w) >= 4 and w not in _SKIP_WORDS]


def name_in(file: str, place: str) -> bool:
    """Der wichtigste Wortteil des Ortsnamens steht im Dateinamen."""
    words = place_words(place)
    return bool(words) and words[0] in norm(file)


def looks_like_view(file: str, place: str) -> bool:
    """Ansicht/Wahrzeichen im Namen – oder der Dateiname ist praktisch nur der Ortsname (plus Nummern/Datum)."""
    if VIEW.search(file):
        return True
    rest = norm(file.rsplit(".", 1)[0])
    for w in norm(place).split():
        rest = rest.replace(w, " ")
    rest = re.sub(r"\b(\d+|jpg|jpeg|img|dsc|dscn|p|by|web|foto|photo|bild)\b", " ", rest)
    return not rest.split()


def usable(file: str, license_name: str, width: int, height: int) -> bool:
    return (
        bool(ALLOWED_LICENSE.match(license_name or ""))
        and not NOT_A_PHOTO.search(file)
        and not BAD.search(file)
        and width >= 800
        and height <= width
    )


def pick(candidates: list[dict], place: str, require_name: bool) -> dict | None:
    """Bestes Foto aus Commons-Kandidaten ({file, license, author, width, height})."""
    ok = []
    for c in candidates:
        if not usable(c["file"], c["license"], c["width"], c["height"]):
            continue
        has_name = name_in(c["file"], place)
        if require_name and not has_name:
            continue
        if not looks_like_view(c["file"], place):
            continue
        ok.append(((has_name, bool(VIEW.search(c["file"])), c["width"] * c["height"]), c))
    ok.sort(key=lambda x: x[0], reverse=True)
    return ok[0][1] if ok else None


def _candidates(data: dict) -> list[dict]:
    out = []
    for page in data.get("query", {}).get("pages", []):
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {}) or {}
        out.append({
            "file": page.get("title", "").split(":", 1)[-1],
            "license": ((meta.get("LicenseShortName") or {}).get("value") or "").strip(),
            "author": clean_artist((meta.get("Artist") or {}).get("value", "")) or "Unbekannt",
            "width": info.get("width", 0) or 0,
            "height": info.get("height", 0) or 0,
        })
    return out


_II = {"format": "json", "formatversion": "2", "prop": "imageinfo", "iiprop": "extmetadata|size",
       "iiextmetadatafilter": "Artist|LicenseShortName"}


def _commons(params: dict, post: bool = False) -> list[dict]:
    time.sleep(PAUSE)
    body = {"action": "query", **_II, **params}
    data = get_json(COMMONS_API, data=body, timeout=60) if post else get_json(COMMONS_API, body, timeout=60)
    return _candidates(data)


def files_info(files: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for i in range(0, len(files), 50):
        for c in _commons({"titles": "|".join(f"File:{f}" for f in files[i:i + 50])}, post=True):
            out[c["file"]] = c
    return out


def category_photo(category: str, place: str) -> dict | None:
    cands = _commons({"generator": "categorymembers", "gcmtitle": f"Category:{category}", "gcmtype": "file", "gcmlimit": 80})
    return pick(cands, place, require_name=False)


def nearby_photo(lat: float, lon: float, place: str) -> dict | None:
    cands = _commons({"generator": "geosearch", "ggscoord": f"{lat}|{lon}", "ggsradius": 2000,
                      "ggsnamespace": 6, "ggslimit": 50})
    return pick(cands, place, require_name=True)


def wikidata_info(gids: list[int]) -> dict[int, dict]:
    query = """SELECT ?gn ?img ?cat WHERE {
      VALUES ?gn { %s } ?item wdt:P1566 ?gn .
      OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?item wdt:P373 ?cat }
    }""" % " ".join(f'"{g}"' for g in gids)
    out: dict[int, dict] = {}
    for b in _sparql(query):
        d = out.setdefault(int(b["gn"]["value"]), {"p18": [], "cat": None})
        if "img" in b:
            f = unquote(b["img"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
            if f not in d["p18"]:
                d["p18"].append(f)
        if "cat" in b and not d["cat"]:
            d["cat"] = b["cat"]["value"]
    return out


def run(conn) -> dict:
    t0 = time.time()
    with conn.cursor() as cur:
        cur.execute(
            """SELECT d.geoname_id, d.name, d.lat, d.lon
               FROM destinations d LEFT JOIN place_images p ON p.geoname_id = d.geoname_id
               WHERE d.image_file IS NULL AND d.tourism_score >= %s AND d.geoname_id IS NOT NULL
                 AND (p.geoname_id IS NULL OR (p.image_file IS NULL AND p.checked_at < now() - %s * interval '1 day'))
               ORDER BY d.tourism_score DESC, d.population DESC
               LIMIT %s""",
            (MIN_SCORE, RETRY_DAYS, BATCH),
        )
        todo = cur.fetchall()
    print(f"   {len(todo)} Orte ohne Foto zu prüfen (Score >= {MIN_SCORE})", flush=True)
    found = {"p18": 0, "kategorie": 0, "umkreis": 0}
    checked = 0
    stopped = False
    for i in range(0, len(todo), 50):
        if (time.time() - t0) / 60 > MAX_MINUTES:
            stopped = True
            break
        chunk = todo[i:i + 50]
        try:
            wd = wikidata_info([r[0] for r in chunk])
        except Exception as e:  # noqa: BLE001
            print(f"   Wikidata übersprungen: {e}", flush=True)
            wd = {}
        p18_files = sorted({f for v in wd.values() for f in v["p18"] if not NOT_A_PHOTO.search(f)})
        try:
            p18_info = files_info(p18_files) if p18_files else {}
        except Exception as e:  # noqa: BLE001
            print(f"   Commons-Lizenzen übersprungen: {e}", flush=True)
            p18_info = {}
        rows = []
        for gid, name, lat, lon in chunk:
            info = wd.get(gid, {"p18": [], "cat": None})
            hit, source = None, None
            for f in info["p18"]:
                c = p18_info.get(f)
                if c and ALLOWED_LICENSE.match(c["license"]) and not NOT_A_PHOTO.search(f) and c["width"] >= 400:
                    hit, source = c, "p18"
                    break
            try:
                if not hit and info["cat"]:
                    hit, source = category_photo(info["cat"], name), "kategorie"
                if not hit:
                    hit, source = nearby_photo(lat, lon, name), "umkreis"
            except Exception as e:  # noqa: BLE001
                print(f"   {name}: {e}", flush=True)
                continue  # nicht als geprüft vermerken – nächstes Mal erneut
            if hit:
                found[source] += 1
                rows.append((gid, hit["file"][:300], hit["author"][:200], hit["license"][:80], source))
            else:
                rows.append((gid, None, None, None, None))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO place_images (geoname_id, image_file, image_author, image_license, source, checked_at)
                   VALUES (%s, %s, %s, %s, %s, now())
                   ON CONFLICT (geoname_id) DO UPDATE SET image_file = EXCLUDED.image_file,
                     image_author = EXCLUDED.image_author, image_license = EXCLUDED.image_license,
                     source = EXCLUDED.source, checked_at = now()""",
                rows,
            )
        conn.commit()
        checked += len(rows)
        if (i // 50) % 20 == 0:
            print(f"   {checked}/{len(todo)} geprüft, gefunden: {found}", flush=True)
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM place_images WHERE image_file IS NOT NULL")
        total = cur.fetchone()[0]
    return {"checked": checked, "found": found, "open": len(todo) - checked, "stopped_by_time": stopped,
            "place_images_total": total}
