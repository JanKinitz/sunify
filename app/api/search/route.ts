// Phase 3 · POST /api/search – Wetter-Rückwärtssuche auf der eigenen Datenbank.
// Request-Format gemäß Kapitel 7 der Spezifikation (plus category, favoriteIds).

import { NextResponse } from "next/server";
import { getPool } from "@/services/db";
import { parseSearchRequest, runSearch } from "@/services/searchService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = parseSearchRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await runSearch(getPool(), parsed.value);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Suche fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Die Suche ist gerade nicht verfügbar. Bitte später erneut versuchen." },
      { status: 500 }
    );
  }
}
