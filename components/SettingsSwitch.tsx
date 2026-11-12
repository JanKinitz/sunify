"use client";

// Sprache (DE/EN) und Einheiten (°C/km bzw. °F/mi) in der Top-Bar umschalten,
// dazu "App installieren", sobald der Browser die Installation als PWA anbietet.

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { tr } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n-react";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-white/10 p-0.5 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1 text-[11.5px] font-bold transition ${
            value === o.value ? "bg-white text-ink-900" : "text-ink-200 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsSwitch() {
  const { locale, units, setLocale, setUnits } = useI18n();
  return (
    <div className="flex items-center gap-1.5">
      <Segmented
        label={tr("Sprache")}
        value={locale}
        onChange={setLocale}
        options={[
          { value: "de", label: "DE", title: "Deutsch" },
          { value: "en", label: "EN", title: "English" },
        ]}
      />
      <Segmented
        label={tr("Einheiten")}
        value={units}
        onChange={setUnits}
        options={[
          { value: "metric", label: "°C", title: tr("Celsius, Kilometer") },
          { value: "imperial", label: "°F", title: tr("Fahrenheit, Meilen") },
        ]}
      />
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Zeigt "App installieren", wenn der Browser es anbietet (Chrome, Edge, Android). */
export function InstallButton() {
  useI18n();
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await event.prompt();
        await event.userChoice.catch(() => undefined);
        setEvent(null);
      }}
      title={tr("Sunify als App auf diesem Gerät installieren")}
      className="flex items-center gap-2 rounded-xl bg-sun-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sun-600"
    >
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">{tr("App installieren")}</span>
    </button>
  );
}
