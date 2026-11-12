"""Globale 16-Tage-Prognose des US-Wettermodells NOAA GFS (0,25°), bereitgestellt von dynamical.org
als Zarr-Datensatz (CC BY 4.0; Quelle: NOAA NWS NCEP GFS, aufbereitet von dynamical.org)."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from .daily import Daily, aggregate_gfs

DATASET = "noaa-gfs-forecast"
VARIABLES = {
    "tmax": "maximum_temperature_2m",
    "tmin": "minimum_temperature_2m",
    "prate": "precipitation_surface",
    "u": "wind_u_10m",
    "v": "wind_v_10m",
    "cloud": "total_cloud_cover_atmosphere",
    "sw": "downward_short_wave_radiation_flux_surface",
    "snow": "categorical_snow_surface",
}
LEAD_BLOCK = 24  # Zeitschritte pro Lesevorgang (begrenzt den Speicherbedarf)


def open_dataset():
    import dynamical_catalog

    return dynamical_catalog.open(DATASET, chunks=None)


def latest_complete_init(ds) -> np.datetime64:
    """Jüngster Lauf, dessen letzter Zeitschritt (Tag 16) schon vorliegt."""
    probe = ds[VARIABLES["tmax"]]
    for k in range(1, 6):
        init = ds.init_time.values[-k]
        value = probe.sel(init_time=init).isel(lead_time=-1).sel(latitude=50.0, longitude=10.0, method="nearest").values
        if np.isfinite(value):
            return init
    raise RuntimeError("Kein vollständiger GFS-Lauf gefunden.")


def _nearest_index(axis: np.ndarray, values: np.ndarray) -> np.ndarray:
    order = np.argsort(axis)
    sorted_axis = axis[order]
    pos = np.clip(np.searchsorted(sorted_axis, values), 1, len(sorted_axis) - 1)
    left, right = sorted_axis[pos - 1], sorted_axis[pos]
    pos -= (values - left) < (right - values)
    return order[pos]


def load_points(lats: np.ndarray, lons: np.ndarray, log=print) -> tuple[datetime, np.ndarray, dict[str, np.ndarray]]:
    """Liest alle Variablen für die gegebenen Punkte: (init_time, lead_hours, {name: (L, P)})."""
    ds = open_dataset()
    init = latest_complete_init(ds)
    run = ds.sel(init_time=init)
    lead_hours = (run.lead_time.values / np.timedelta64(1, "h")).astype(np.float64)
    lat_axis = run.latitude.values.astype(np.float64)
    lon_axis = run.longitude.values.astype(np.float64)
    lon_norm = ((lons + 180.0) % 360.0) - 180.0
    ilat = _nearest_index(lat_axis, lats)
    ilon = _nearest_index(lon_axis, lon_norm)
    lat_lo, lat_hi = int(ilat.min()), int(ilat.max()) + 1  # nur der benötigte Breitenstreifen
    log(f"   GFS-Lauf {np.datetime_as_string(init, unit='h')}Z, {len(lead_hours)} Zeitschritte, {len(lats)} Punkte")

    out: dict[str, np.ndarray] = {}
    L = len(lead_hours)
    for key, name in VARIABLES.items():
        arr = run[name]
        lat_dim = arr.dims.index("latitude")
        values = np.full((L, len(lats)), np.nan, dtype=np.float32)
        for start in range(0, L, LEAD_BLOCK):
            stop = min(L, start + LEAD_BLOCK)
            block = arr.isel(lead_time=slice(start, stop), latitude=slice(lat_lo, lat_hi)).values
            if arr.dims.index("lead_time") != 0 or lat_dim != 1:
                block = np.moveaxis(block, [arr.dims.index("lead_time"), lat_dim], [0, 1])
            values[start:stop] = block[:, ilat - lat_lo, ilon]
        out[key] = values
        log(f"   {name} gelesen", )
    init_dt = datetime.fromtimestamp(init.astype("datetime64[s]").astype(int), tz=timezone.utc).replace(tzinfo=None)
    return init_dt, lead_hours, out


def daily_for_points(lats: np.ndarray, lons: np.ndarray, utc_offsets: np.ndarray, log=print) -> tuple[datetime, list[Daily | None]]:
    init, lead_hours, v = load_points(lats, lons, log)
    daily = aggregate_gfs(
        init, lead_hours, utc_offsets, v["tmax"], v["tmin"], v["prate"], v["u"], v["v"], v["cloud"], v["sw"], v["snow"]
    )
    return init, daily
