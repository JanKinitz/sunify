// GET /api/status – öffentlicher Stand der Daten (ohne Zugangsdaten): Umfang und letzte Datenjobs.

import { NextResponse } from "next/server";
import { getPool } from "@/services/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getPool();
    const counts = await db.query(
      `SELECT (SELECT COUNT(*) FROM weather_grid)::int AS grid_points,
              (SELECT COUNT(*) FROM destinations)::int AS destinations,
              (SELECT COUNT(*) FROM destinations WHERE image_file IS NOT NULL)::int AS with_photo,
              (SELECT COUNT(*) FROM weather_forecasts)::int AS forecasts,
              (SELECT COUNT(*) FROM weather_grid WHERE source = 'open-meteo')::int AS open_meteo_points,
              (SELECT MIN(start_date)::text FROM weather_forecasts) AS first_day,
              (SELECT MAX(start_date + array_length(temp_max, 1) - 1)::text FROM weather_forecasts) AS last_day,
              (SELECT MAX(updated_at) FROM weather_forecasts) AS weather_updated`
    );
    const runs = await db.query(
      `SELECT job, started_at, finished_at, ok, summary FROM pipeline_runs ORDER BY run_id DESC LIMIT 10`
    );
    return NextResponse.json({ ok: true, ...counts.rows[0], runs: runs.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Status fehlgeschlagen:", error);
    return NextResponse.json({ ok: false, error: "Datenbank nicht erreichbar." }, { status: 500 });
  }
}
