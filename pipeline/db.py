"""Datenbank-Anbindung der Datenjobs (Verbindung über die Umgebungsvariable DATABASE_URL)."""

from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def connect():
    import psycopg

    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit("DATABASE_URL ist nicht gesetzt (GitHub-Secret bzw. .env.local).")
    # prepare_threshold=None: keine serverseitig vorbereiteten Statements (verträgt sich mit Connection-Poolern)
    return psycopg.connect(url, prepare_threshold=None, connect_timeout=30)


def run_migrations(conn) -> list[str]:
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    done = []
    with conn.cursor() as cur:
        for f in files:
            cur.execute(f.read_text(encoding="utf-8"))
            done.append(f.name)
    conn.commit()
    return done


class RunLog:
    """Schreibt Start und Ergebnis eines Jobs in pipeline_runs (für die Statusanzeige)."""

    def __init__(self, conn, job: str):
        self.conn = conn
        self.job = job
        with conn.cursor() as cur:
            cur.execute("INSERT INTO pipeline_runs (job) VALUES (%s) RETURNING run_id", (job,))
            self.run_id = cur.fetchone()[0]
        conn.commit()

    def finish(self, ok: bool, summary: dict) -> None:
        self.conn.rollback()  # eine evtl. abgebrochene Transaktion verwerfen
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE pipeline_runs SET finished_at = now(), ok = %s, summary = %s::jsonb WHERE run_id = %s",
                (ok, json.dumps(summary, ensure_ascii=False, default=str), self.run_id),
            )
        self.conn.commit()
