"""
PaisaPilot Route Intelligence
Uses free, no-API-key services:
  - Nominatim (OpenStreetMap) for geocoding
  - OSRM (Open Source Routing Machine) for road distances
  - Wikipedia / estimated data for train/flight distances
All HTTP calls are synchronous via httpx with short timeouts and fallbacks.
"""
from __future__ import annotations

import math
import time
from typing import Optional
import httpx

# ─── Nominatim geocoding ──────────────────────────────────────────────────────

_GEOCODE_CACHE: dict[str, tuple[float, float]] = {}

def geocode(place: str) -> Optional[tuple[float, float]]:
    """Return (lat, lon) for a place name using OpenStreetMap Nominatim."""
    key = place.lower().strip()
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]

    # Add "India" hint for short Indian city names
    query = place if "," in place else f"{place}, India"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "PaisaPilot-App/2.0 (educational)"},
            )
        data = resp.json()
        if data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            _GEOCODE_CACHE[key] = (lat, lon)
            time.sleep(0.3)  # Nominatim rate limit: 1 req/sec
            return (lat, lon)
    except Exception:
        pass
    return None


# ─── Haversine straight-line distance ────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ─── OSRM road distance ───────────────────────────────────────────────────────

def road_distance_km(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> Optional[float]:
    """Get real road distance from OSRM public API (no key needed)."""
    try:
        url = (
            f"https://router.project-osrm.org/route/v1/driving/"
            f"{lon1},{lat1};{lon2},{lat2}"
            f"?overview=false"
        )
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url)
        data = resp.json()
        if data.get("code") == "Ok" and data.get("routes"):
            return round(data["routes"][0]["distance"] / 1000, 1)
    except Exception:
        pass
    return None


# ─── Mode cost/time estimations ───────────────────────────────────────────────

# ₹ per km rates
RATE_CAR   = 12   # fuel + wear
RATE_BUS   = 1.2  # per km per person
RATE_TRAIN_SL  = 0.7
RATE_TRAIN_3AC = 1.6
RATE_TRAIN_2AC = 2.3
RATE_TRAIN_1AC = 4.5

# Speed km/h
SPEED_CAR   = 60
SPEED_BUS   = 45
SPEED_TRAIN = 70
SPEED_FLIGHT = 750

# Base airport charges + fuel surcharge estimate
FLIGHT_BASE = 1500
FLIGHT_PER_KM = 4.5
FLIGHT_MIN = 2200


def _flight_cost(km: float) -> dict:
    fare = max(FLIGHT_MIN, round(FLIGHT_BASE + km * FLIGHT_PER_KM, -2))
    time_hr = round(km / SPEED_FLIGHT + 2.0, 1)   # +2h check-in/out
    return {
        "mode": "Flight ✈️",
        "distance_km": km,
        "duration_hours": time_hr,
        "duration_label": _fmt_time(time_hr),
        "cost_estimate": fare,
        "cost_label": f"₹{fare:,} – ₹{round(fare * 1.5):,} (economy)",
        "details": "Includes check-in/boarding time. Book 30+ days early for best fares.",
        "book_at": "MakeMyTrip, Cleartrip, IndiGo.com, Goibibo",
    }


def _train_options(km: float) -> list[dict]:
    results = []
    classes = [
        ("Sleeper (SL)", RATE_TRAIN_SL, "Budget; good for <600 km overnight"),
        ("3rd AC (3A)", RATE_TRAIN_3AC, "Most popular; comfortable AC"),
        ("2nd AC (2A)", RATE_TRAIN_2AC, "More privacy; wider berth"),
        ("1st AC (1A)", RATE_TRAIN_1AC, "Premium; private cabin"),
    ]
    time_hr = round(km / SPEED_TRAIN, 1)
    for cls, rate, tip in classes:
        fare = round(max(150, km * rate), -1)
        results.append({
            "mode": f"Train 🚂 – {cls}",
            "distance_km": km,
            "duration_hours": time_hr,
            "duration_label": _fmt_time(time_hr),
            "cost_estimate": fare,
            "cost_label": f"₹{fare:,} approx",
            "details": tip,
            "book_at": "IRCTC (irctc.co.in)",
        })
    return results


def _bus_option(km: float) -> dict:
    fare = round(max(150, km * RATE_BUS), -1)
    time_hr = round(km / SPEED_BUS, 1)
    return {
        "mode": "Bus 🚌",
        "distance_km": km,
        "duration_hours": time_hr,
        "duration_label": _fmt_time(time_hr),
        "cost_estimate": fare,
        "cost_label": f"₹{fare:,} – ₹{round(fare * 1.8):,} (sleeper/AC)",
        "details": "Economical. AC sleeper buses available on popular routes.",
        "book_at": "RedBus, AbhiBus, KSRTC/MSRTC official sites",
    }


def _car_option(km: float) -> dict:
    fuel_cost = round(km * RATE_CAR, -1)
    time_hr = round(km / SPEED_CAR, 1)
    return {
        "mode": "Car / Cab 🚗",
        "distance_km": km,
        "duration_hours": time_hr,
        "duration_label": _fmt_time(time_hr),
        "cost_estimate": fuel_cost,
        "cost_label": f"₹{fuel_cost:,} (fuel) + toll ~₹{round(km * 1.5):,}",
        "details": "Door-to-door convenience. Best for <300 km trips.",
        "book_at": "Self-drive / Ola Outstation / Zoom Car",
    }


def _fmt_time(hours: float) -> str:
    h = int(hours)
    m = round((hours - h) * 60)
    if h == 0:
        return f"{m} min"
    if m == 0:
        return f"{h} hr"
    return f"{h} hr {m} min"


# ─── Main route function ──────────────────────────────────────────────────────

def find_routes(origin: str, destination: str) -> dict:
    """
    Geocode both places, get real road distance from OSRM,
    estimate costs for all transport modes.
    """
    origin_coords = geocode(origin)
    dest_coords = geocode(destination)

    if not origin_coords:
        return {"error": f"Could not find location: '{origin}'. Try a more specific name."}
    if not dest_coords:
        return {"error": f"Could not find location: '{destination}'. Try a more specific name."}

    lat1, lon1 = origin_coords
    lat2, lon2 = dest_coords

    # Straight-line distance
    straight_km = round(haversine_km(lat1, lon1, lat2, lon2), 1)

    # Real road distance from OSRM
    road_km = road_distance_km(lat1, lon1, lat2, lon2)

    # If OSRM fails, approximate road = straight × 1.35
    if road_km is None:
        road_km = round(straight_km * 1.35, 1)
        road_source = "estimated"
    else:
        road_source = "real (OSRM)"

    # Build all transport options
    modes: list[dict] = []

    # Car/cab always available
    modes.append(_car_option(road_km))

    # Bus — always available
    modes.append(_bus_option(road_km))

    # Train — available for distances > 50 km
    if straight_km > 50:
        modes.extend(_train_options(straight_km))  # trains go straight-line approx

    # Flight — for distances > 300 km
    if straight_km > 300:
        modes.append(_flight_cost(straight_km))

    # Sort by cost
    modes.sort(key=lambda x: x["cost_estimate"])

    # Recommendation
    cheapest = modes[0]["mode"]
    fastest = min(modes, key=lambda x: x["duration_hours"])["mode"]

    google_maps_url = (
        f"https://www.google.com/maps/dir/{lat1},{lon1}/{lat2},{lon2}"
    )
    google_maps_label = f"{origin} → {destination}"

    return {
        "origin": origin.title(),
        "destination": destination.title(),
        "origin_coords": {"lat": lat1, "lon": lon1},
        "destination_coords": {"lat": lat2, "lon": lon2},
        "straight_line_km": straight_km,
        "road_distance_km": road_km,
        "road_source": road_source,
        "transport_options": modes,
        "recommendation": {
            "cheapest": cheapest,
            "fastest": fastest,
            "best_value": modes[min(1, len(modes) - 1)]["mode"],
        },
        "google_maps_url": google_maps_url,
        "google_maps_label": google_maps_label,
    }
