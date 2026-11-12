// Fotos von Wikimedia Commons: Vorschaubild-URL und Seite mit Urheber- und Lizenzangaben.

const COMMONS = "https://commons.wikimedia.org";

/** Vorschaubild in der gewünschten Breite (Commons skaliert serverseitig). */
export function commonsThumb(file: string, width = 640): string {
  return `${COMMONS}/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

/** Dateiseite mit Urheber und Lizenz – Pflichtangabe bei CC-Lizenzen. */
export function commonsPage(file: string): string {
  return `${COMMONS}/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}
