// Phase 2 · Geschützte Cron-Route für den zyklischen Wetter-Import (alle 6 Stunden).
// Aufruf: GET /api/cron/sync-weather mit Header "Authorization: Bearer <CRON_SECRET>".
// Vercel Cron sendet diesen Header automatisch, wenn CRON_SECRET als Umgebungsvariable gesetzt ist.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { connect } from "@/scripts/lib/db";
import { SyncBusyError, syncWeather } from "@/services/weatherSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET ist nicht gesetzt – die Route bleibt gesperrt." },
      { status: 503 }
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
  }

  let client;
  try {
    client = await connect();
  } catch {
    return NextResponse.json({ ok: false, error: "Datenbank nicht erreichbar." }, { status: 500 });
  }

  try {
    const result = await syncWeather(client);
    const ok = result.failedBatches.length === 0;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 207 });
  } catch (error) {
    if (error instanceof SyncBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    console.error("Wetter-Sync fehlgeschlagen:", error);
    return NextResponse.json({ ok: false, error: "Wetter-Sync fehlgeschlagen." }, { status: 500 });
  } finally {
    await client.end().catch(() => undefined);
  }
}
