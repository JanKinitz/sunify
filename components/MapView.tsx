"use client";

// Screen 2: Interaktive Kartenansicht (React-Leaflet + OpenStreetMap-Standardkacheln, kein API-Key).
// Überlappende Treffer werden je Zoomstufe zu Sammel-Pills mit Trefferzahl zusammengefasst;
// ein Klick zoomt hinein, bis die einzelnen Wetter-Pills sichtbar werden.

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Origin, SearchResult } from "@/lib/types";
import { weatherEmoji } from "@/lib/weather";

export interface MapFocusRequest {
  ids: number[];
  nonce: number;
}

interface MapViewProps {
  origin: Origin;
  radiusKm: number;
  matches: SearchResult[];
  others: SearchResult[];
  selectedId: number | null;
  highlightId: number | null;
  favorites: number[];
  /** Aufforderung aus der Liste, auf eine Ortsgruppe zu zoomen */
  focusRequest: MapFocusRequest | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}

const MAX_ZOOM = 15;
const CLUSTER_ZOOM_LIMIT = 13;
/** Halbe Ausdehnung einer Pill in Pixeln – näher beieinander liegende Treffer werden gebündelt */
const CLUSTER_DX = 115;
const CLUSTER_DY = 30;

interface Cluster {
  lead: SearchResult;
  members: SearchResult[];
  x: number;
  y: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bündelt Treffer, deren Pills sich auf der aktuellen Zoomstufe überdecken würden. */
function clusterResults(results: SearchResult[], zoom: number): Cluster[] {
  const sorted = [...results].sort(
    (a, b) =>
      b.destination.tourismScore - a.destination.tourismScore ||
      b.destination.population - a.destination.population
  );
  const clusters: Cluster[] = [];
  for (const result of sorted) {
    const point = L.CRS.EPSG3857.latLngToPoint(
      L.latLng(result.destination.lat, result.destination.lon),
      zoom
    );
    const home = clusters.find(
      (c) => Math.abs(c.x - point.x) < CLUSTER_DX && Math.abs(c.y - point.y) < CLUSTER_DY
    );
    if (home) home.members.push(result);
    else clusters.push({ lead: result, members: [result], x: point.x, y: point.y });
  }
  return clusters;
}

function pillIcon(result: SearchResult, active: boolean, fav: boolean): L.DivIcon {
  const emoji = weatherEmoji(result.days[0]?.weatherCode ?? 2);
  const classes = ["sunify-pill", active ? "is-active" : "", fav ? "is-fav" : ""].join(" ");
  return L.divIcon({
    className: "sunify-marker",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="${classes}"><span>${emoji}</span><span>${Math.round(
      result.avgTempMax
    )}°C</span><span class="sep">|</span><span class="name">${escapeHtml(
      result.destination.name
    )}</span></div>`,
  });
}

function clusterIcon(cluster: Cluster, active: boolean): L.DivIcon {
  const temps = cluster.members.map((m) => Math.round(m.avgTempMax));
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const emoji = weatherEmoji(cluster.lead.days[0]?.weatherCode ?? 2);
  const classes = ["sunify-pill", "is-cluster", active ? "is-active" : ""].join(" ");
  const title = `${cluster.members.length} Orte um ${cluster.lead.destination.name} – klicken zum Hineinzoomen`;
  return L.divIcon({
    className: "sunify-marker",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="${classes}" title="${escapeHtml(title)}"><span class="count">${
      cluster.members.length
    }</span><span>Orte</span><span class="sep">|</span><span>${emoji}</span><span>${
      min === max ? `${max}°C` : `${min}–${max}°C`
    }</span><span class="sep">|</span><span class="name">um ${escapeHtml(
      cluster.lead.destination.name
    )}</span></div>`,
  });
}

function dotIcon(result: SearchResult, active: boolean): L.DivIcon {
  return L.divIcon({
    className: "sunify-marker",
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html: `<div class="sunify-dot ${active ? "is-active" : ""}" title="${escapeHtml(
      result.destination.name
    )} – erfüllt die Kriterien nicht"></div>`,
  });
}

const originIcon = L.divIcon({
  className: "sunify-marker",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<div class="sunify-origin" title="Dein Startpunkt"></div>`,
});

function boundsOf(results: SearchResult[]): L.LatLngBounds {
  return L.latLngBounds(results.map((r) => L.latLng(r.destination.lat, r.destination.lon)));
}

/** Hält den Kartenausschnitt passend zu Startpunkt, Radius, Auswahl und Gruppen-Fokus. */
function MapController({
  origin,
  radiusKm,
  focus,
  group,
  groupNonce,
  onZoom,
}: {
  origin: Origin;
  radiusKm: number;
  focus: { id: number; lat: number; lon: number } | null;
  group: SearchResult[];
  groupNonce: number;
  onZoom: (zoom: number) => void;
}) {
  const map = useMap();

  useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });

  // Radius-Kreis immer vollständig sichtbar halten
  useEffect(() => {
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.cos((origin.lat * Math.PI) / 180));
    map.fitBounds(
      [
        [origin.lat - dLat, origin.lon - dLon],
        [origin.lat + dLat, origin.lon + dLon],
      ],
      { padding: [28, 28], animate: true, duration: 0.3 }
    );
  }, [map, origin.lat, origin.lon, radiusKm]);

  // Sanft zum ausgewählten Ort schwenken
  const focusId = focus?.id ?? null;
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 8), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusId]);

  // Aus der Liste: auf eine Ortsgruppe zoomen
  useEffect(() => {
    if (groupNonce === 0 || group.length === 0) return;
    map.flyToBounds(boundsOf(group), { padding: [80, 80], maxZoom: 12, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, groupNonce]);

  // Größenänderungen des Containers (Fenster, Split-Screen) an Leaflet melden
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function MapView({
  origin,
  radiusKm,
  matches,
  others,
  selectedId,
  highlightId,
  favorites,
  focusRequest,
  onSelect,
  onHover,
}: MapViewProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [zoom, setZoom] = useState(7);

  const clusters = useMemo(() => clusterResults(matches, zoom), [matches, zoom]);

  const markers = useMemo(
    () =>
      clusters.map((cluster) => {
        const ids = cluster.members.map((m) => m.destination.id);
        const active =
          (selectedId !== null && ids.includes(selectedId)) ||
          (highlightId !== null && ids.includes(highlightId));
        const single = cluster.members.length === 1;
        return {
          cluster,
          active,
          single,
          icon: single
            ? pillIcon(cluster.lead, active, favorites.includes(cluster.lead.destination.id))
            : clusterIcon(cluster, active),
        };
      }),
    [clusters, selectedId, highlightId, favorites]
  );

  const otherMarkers = useMemo(
    () =>
      others.map((r) => {
        const active = r.destination.id === selectedId;
        return { result: r, active, icon: dotIcon(r, active) };
      }),
    [others, selectedId]
  );

  const focus = useMemo(() => {
    if (selectedId === null) return null;
    const hit = [...matches, ...others].find((r) => r.destination.id === selectedId);
    return hit ? { id: selectedId, lat: hit.destination.lat, lon: hit.destination.lon } : null;
  }, [selectedId, matches, others]);

  const group = useMemo(() => {
    if (!focusRequest) return [];
    return [...matches, ...others].filter((r) => focusRequest.ids.includes(r.destination.id));
  }, [focusRequest, matches, others]);

  const openCluster = (cluster: Cluster) => {
    if (!map) return;
    const current = map.getZoom();
    if (current >= CLUSTER_ZOOM_LIMIT) {
      // Orte liegen praktisch am selben Fleck: weiter hineinzoomen, zuletzt den besten Ort öffnen
      if (current >= MAX_ZOOM) onSelect(cluster.lead.destination.id);
      else map.flyTo([cluster.lead.destination.lat, cluster.lead.destination.lon], current + 1, { duration: 0.4 });
      return;
    }
    const target = map.getBoundsZoom(boundsOf(cluster.members), false, L.point(90, 90));
    map.flyToBounds(boundsOf(cluster.members), {
      padding: [90, 90],
      // immer mindestens eine Stufe hineinzoomen, damit sich die Gruppe sichtbar auflöst
      maxZoom: Math.min(CLUSTER_ZOOM_LIMIT, Math.max(target, current + 1)),
      duration: 0.6,
    });
  };

  return (
    <MapContainer
      ref={setMap}
      center={[origin.lat, origin.lon]}
      zoom={7}
      minZoom={5}
      maxZoom={MAX_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
      />
      <ZoomControl position="bottomright" />
      <MapController
        origin={origin}
        radiusKm={radiusKm}
        focus={focus}
        group={group}
        groupNonce={focusRequest?.nonce ?? 0}
        onZoom={setZoom}
      />

      {/* Suchradius-Overlay */}
      <Circle
        center={[origin.lat, origin.lon]}
        radius={radiusKm * 1000}
        pathOptions={{
          color: "#f98307",
          weight: 2,
          dashArray: "7 7",
          fillColor: "#ffa620",
          fillOpacity: 0.09,
        }}
        interactive={false}
      />

      {/* Eigener Standort */}
      <Marker position={[origin.lat, origin.lon]} icon={originIcon} interactive={false} keyboard={false} />

      {/* Orte im Radius ohne Wetter-Treffer (gedimmt) */}
      {otherMarkers.map(({ result, icon }) => (
        <Marker
          key={`o-${result.destination.id}`}
          position={[result.destination.lat, result.destination.lon]}
          icon={icon}
          zIndexOffset={-200}
          eventHandlers={{ click: () => onSelect(result.destination.id) }}
        />
      ))}

      {/* Wetter-Pills: einzelne Treffer und Sammel-Pills */}
      {markers.map(({ cluster, icon, active, single }) => (
        <Marker
          key={`m-${cluster.lead.destination.id}-${cluster.members.length}`}
          position={[cluster.lead.destination.lat, cluster.lead.destination.lon]}
          icon={icon}
          zIndexOffset={active ? 1000 : cluster.lead.destination.tourismScore + (single ? 0 : 100)}
          riseOnHover
          eventHandlers={{
            click: () => (single ? onSelect(cluster.lead.destination.id) : openCluster(cluster)),
            mouseover: () => onHover(cluster.lead.destination.id),
            mouseout: () => onHover(null),
          }}
        />
      ))}
    </MapContainer>
  );
}
