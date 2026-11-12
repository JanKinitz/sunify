"use client";

// React-Anbindung der Mehrsprachigkeit: Provider mit Sprach-/Einheitenwahl (im LocalStorage gemerkt).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applySettings, getLocale, getUnits, tr, type Locale, type Units } from "./i18n";

const LOCALE_KEY = "sunify:locale";
const UNITS_KEY = "sunify:units";


interface I18nValue {
  locale: Locale;
  units: Units;
  setLocale: (l: Locale) => void;
  setUnits: (u: Units) => void;
}

const I18nContext = createContext<I18nValue>({
  locale: "de",
  units: "metric",
  setLocale: () => undefined,
  setUnits: () => undefined,
});

function initialLocale(): Locale {
  try {
    const param = new URLSearchParams(window.location.search).get("lang");
    if (param === "de" || param === "en") return param;
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "de" || stored === "en") return stored;
  } catch {
    /* ohne Speicher: Browsersprache */
  }
  return (navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
}

function initialUnits(): Units {
  try {
    const stored = window.localStorage.getItem(UNITS_KEY);
    if (stored === "metric" || stored === "imperial") return stored;
  } catch {
    /* ohne Speicher: aus der Region ableiten */
  }
  // Fahrenheit/Meilen nur dort, wo sie üblich sind
  return /^en-(us|lr|mm)$/i.test(navigator.language || "") ? "imperial" : "metric";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    applySettings(initialLocale(), getUnits());
    return getLocale();
  });
  const [units, setUnitsState] = useState<Units>(() => {
    applySettings(getLocale(), initialUnits());
    return getUnits();
  });

  const setLocale = useCallback((l: Locale) => {
    applySettings(l, getUnits());
    setLocaleState(l);
    try {
      window.localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* egal */
    }
  }, []);

  const setUnits = useCallback((u: Units) => {
    applySettings(getLocale(), u);
    setUnitsState(u);
    try {
      window.localStorage.setItem(UNITS_KEY, u);
    } catch {
      /* egal */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = tr("Sunify – Finde dein Wunschwetter");
  }, [locale]);

  const value = useMemo(() => ({ locale, units, setLocale, setUnits }), [locale, units, setLocale, setUnits]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Sprache und Einheiten; Komponenten mit diesem Hook werden bei einer Umstellung neu gezeichnet. */
export function useI18n() {
  return useContext(I18nContext);
}
