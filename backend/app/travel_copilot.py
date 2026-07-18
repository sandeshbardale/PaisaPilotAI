"""
PaisaPilot Travel Copilot
Uses OpenStreetMap Overpass API (free, no key) for real nearby places.
Provides: nearby tourist spots, hotels, restaurants, hospitals, ATMs,
          petrol pumps, shopping malls, parking, transport stops.
Also provides: AI travel guide answers, activity planner, itinerary generator.
"""
from __future__ import annotations

import time
from typing import Optional
import httpx
import math


# ─── Overpass API helpers ─────────────────────────────────────────────────────

OVERPASS_URL        = "https://lz4.overpass-api.de/api/interpreter"   # fastest, confirmed working
OVERPASS_URL_BACKUP = "https://overpass-api.de/api/interpreter"          # standard fallback

_PLACE_CACHE: dict[str, list[dict]] = {}


def _overpass_query(lat: float, lon: float, radius_m: int, amenity_filter: str) -> list[dict]:
    """Run an Overpass QL query and return normalised place dicts."""
    cache_key = f"{lat:.4f},{lon:.4f},{radius_m},{amenity_filter}"
    if cache_key in _PLACE_CACHE:
        return _PLACE_CACHE[cache_key]

    # Build multi-value query — Overpass needs separate statements for each value
    statements = _build_overpass_statements(amenity_filter, radius_m, lat, lon)
    query = f"""[out:json][timeout:20];
({statements});
out center 25;"""

    result = _try_overpass(query)
    if result is None:
        # Try backup server
        result = _try_overpass(query, backup=True)
    if result is None:
        return []

    elements = result.get("elements", [])
    places = []
    for el in elements:
        tags = el.get("tags", {})
        name = (tags.get("name") or tags.get("name:en") or
                tags.get("operator") or tags.get("brand") or "")
        if not name:
            continue
        if el.get("type") == "node":
            elat, elon = el.get("lat", lat), el.get("lon", lon)
        else:
            center = el.get("center", {})
            elat = center.get("lat", lat)
            elon = center.get("lon", lon)

        dist_m = _haversine_m(lat, lon, elat, elon)
        places.append({
            "name": name[:80],
            "lat": elat,
            "lon": elon,
            "distance_m": round(dist_m),
            "distance_label": _fmt_dist(dist_m),
            "rating": tags.get("stars", tags.get("rating", "")),
            "cuisine": tags.get("cuisine", ""),
            "opening_hours": tags.get("opening_hours", ""),
            "phone": tags.get("phone", tags.get("contact:phone", "")),
            "website": tags.get("website", tags.get("contact:website", "")),
            "maps_url": f"https://www.google.com/maps?q={elat},{elon}",
            "tags": {k: v for k, v in tags.items() if k in (
                "amenity", "tourism", "shop", "leisure",
                "fee", "wheelchair", "wifi", "stars", "brand",
            )},
        })

    places.sort(key=lambda x: x["distance_m"])
    _PLACE_CACHE[cache_key] = places[:20]
    return _PLACE_CACHE[cache_key]


def _try_overpass(query: str, backup: bool = False) -> dict | None:
    url = OVERPASS_URL_BACKUP if backup else OVERPASS_URL
    headers = {"User-Agent": "PaisaPilot/2.0 (educational personal finance app)"}
    try:
        with httpx.Client(timeout=28.0) as client:
            resp = client.get(url, params={"data": query}, headers=headers)
        if resp.status_code == 200:
            time.sleep(0.2)
            return resp.json()
    except Exception:
        pass
    # POST fallback
    try:
        with httpx.Client(timeout=28.0) as client:
            resp = client.post(url, data={"data": query}, headers=headers)
        if resp.status_code == 200:
            time.sleep(0.2)
            return resp.json()
    except Exception:
        pass
    return None


def _build_overpass_statements(amenity_filter: str, radius_m: int, lat: float, lon: float) -> str:
    """Convert our filter spec into valid Overpass QL node/way statements."""
    # amenity_filter examples:
    #   'amenity=restaurant'
    #   'amenity~"restaurant|cafe"'   <- we'll expand these
    #   '[tourism~"hotel|hostel"]'
    raw = amenity_filter.strip().lstrip("[").rstrip("]")

    # Detect if it contains | (multi-value regex)
    if "~" in raw and "|" in raw:
        # e.g.  amenity~"restaurant|fast_food|cafe"
        # Split into individual values
        key_part, values_part = raw.split("~", 1)
        key = key_part.strip().strip('"')
        values_raw = values_part.strip().strip('"')
        values = [v.strip() for v in values_raw.split("|")]
        lines = []
        for v in values:
            tag = f'["{key}"="{v}"]'
            lines.append(f'  node{tag}(around:{radius_m},{lat},{lon});')
            lines.append(f'  way{tag}(around:{radius_m},{lat},{lon});')
        return "\n".join(lines)
    else:
        # Single value: amenity="fuel"  or  shop=supermarket
        tag = f"[{raw}]"
        return (
            f'  node{tag}(around:{radius_m},{lat},{lon});\n'
            f'  way{tag}(around:{radius_m},{lat},{lon});'
        )


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _fmt_dist(m: float) -> str:
    if m < 1000:
        return f"{round(m)} m"
    return f"{round(m / 1000, 1)} km"


# ─── Category definitions ─────────────────────────────────────────────────────

CATEGORY_FILTERS = {
    "tourist_attractions": 'tourism~"attraction|viewpoint|monument|museum|theme_park|zoo|artwork|historic"',
    "hotels":              'tourism~"hotel|motel|hostel|guest_house|resort|apartment"',
    "restaurants":         'amenity~"restaurant|fast_food|cafe|food_court|bar|pub|biergarten"',
    "hospitals":           'amenity~"hospital|clinic|pharmacy|doctors|dentist|health_centre"',
    "atms":                'amenity~"atm|bank"',
    "petrol":              'amenity="fuel"',
    "shopping":            'shop~"supermarket|mall|department_store|clothes|electronics|market|convenience"',
    "parking":             'amenity="parking"',
    "transport":           'amenity~"bus_station|train_station|subway_entrance|ferry_terminal|taxi"',
    "activities":          'leisure~"park|sports_centre|swimming_pool|stadium|fitness_centre|water_park|playground"',
}

CATEGORY_LABELS = {
    "tourist_attractions": "Tourist Attractions",
    "hotels":              "Hotels & Stays",
    "restaurants":         "Restaurants & Cafes",
    "hospitals":           "Hospitals & Clinics",
    "atms":                "ATMs & Banks",
    "petrol":              "Petrol Pumps",
    "shopping":            "Shopping",
    "parking":             "Parking",
    "transport":           "Transport Hubs",
    "activities":          "Activities & Parks",
}

CATEGORY_ICONS = {
    "tourist_attractions": "🏛️",
    "hotels":              "🏨",
    "restaurants":         "🍽️",
    "hospitals":           "🏥",
    "atms":                "🏧",
    "petrol":              "⛽",
    "shopping":            "🛍️",
    "parking":             "🅿️",
    "transport":           "🚉",
    "activities":          "🎭",
}


# ─── Public API functions ─────────────────────────────────────────────────────

def get_nearby(
    lat: float,
    lon: float,
    category: str = "tourist_attractions",
    radius_m: int = 3000,
) -> dict:
    """Return nearby places for a given category."""
    cat = category.lower().strip()
    if cat not in CATEGORY_FILTERS:
        return {"error": f"Unknown category '{cat}'. Valid: {list(CATEGORY_FILTERS.keys())}"}

    places = _overpass_query(lat, lon, radius_m, CATEGORY_FILTERS[cat])
    return {
        "category": cat,
        "label": CATEGORY_LABELS[cat],
        "icon": CATEGORY_ICONS[cat],
        "lat": lat,
        "lon": lon,
        "radius_m": radius_m,
        "count": len(places),
        "places": places,
        "maps_area_url": f"https://www.google.com/maps/@{lat},{lon},14z",
    }


def get_all_nearby(lat: float, lon: float, radius_m: int = 2000) -> dict:
    """Fetch multiple categories at once (tourist, hotels, restaurants, hospitals, atm)."""
    result = {}
    for cat in ["tourist_attractions", "hotels", "restaurants", "hospitals", "atms", "activities"]:
        places = _overpass_query(lat, lon, radius_m, CATEGORY_FILTERS[cat])
        result[cat] = {
            "label": CATEGORY_LABELS[cat],
            "icon": CATEGORY_ICONS[cat],
            "count": len(places),
            "places": places[:8],  # top 8 per category
        }
    return {
        "lat": lat,
        "lon": lon,
        "radius_m": radius_m,
        "categories": result,
        "maps_area_url": f"https://www.google.com/maps/@{lat},{lon},14z",
    }


# ─── Smart Hotel Recommendations ─────────────────────────────────────────────

HOTEL_BUDGET_TIERS = [
    {"label": "Budget / Hostel", "price_range": "₹500 – ₹1,500/night", "emoji": "🏠",
     "tips": ["Book on OYO, Zostel, MakeMyTrip", "Dorms from ₹300", "Check cleanliness reviews"]},
    {"label": "Mid-range Hotel", "price_range": "₹1,500 – ₹4,000/night", "emoji": "🏨",
     "tips": ["Book on MakeMyTrip, Goibibo", "Ask for free breakfast", "Check cancellation policy"]},
    {"label": "Luxury / Resort", "price_range": "₹4,000 – ₹15,000/night", "emoji": "🏝️",
     "tips": ["Book directly for best price", "Check for pool/spa", "Read amenities carefully"]},
]


def smart_hotel_reco(
    lat: float,
    lon: float,
    budget_per_night: float,
    guests: int = 2,
    nights: int = 2,
) -> dict:
    """Combine real OSM hotels with budget-based tier recommendations."""
    nearby_hotels = _overpass_query(lat, lon, 5000, CATEGORY_FILTERS["hotels"])

    # Pick tier
    if budget_per_night < 1500:
        tier = HOTEL_BUDGET_TIERS[0]
    elif budget_per_night < 4000:
        tier = HOTEL_BUDGET_TIERS[1]
    else:
        tier = HOTEL_BUDGET_TIERS[2]

    total_hotel_budget = budget_per_night * nights * max(1, guests // 2)

    booking_links = [
        {"platform": "OYO", "url": f"https://www.oyorooms.com/search/?location={lat},{lon}"},
        {"platform": "MakeMyTrip", "url": f"https://www.makemytrip.com/hotels/hotel-listing/?checkin=&checkout=&city="},
        {"platform": "Zostel", "url": "https://www.zostel.com/"},
        {"platform": "Goibibo", "url": f"https://www.goibibo.com/hotels/"},
        {"platform": "Airbnb", "url": f"https://www.airbnb.com/s/homes?refinement_paths%5B%5D=%2Fhomes"},
    ]

    return {
        "budget_per_night": budget_per_night,
        "guests": guests,
        "nights": nights,
        "total_hotel_cost": total_hotel_budget,
        "tier": tier,
        "nearby_hotels": nearby_hotels[:10],
        "hotel_count": len(nearby_hotels),
        "booking_links": booking_links,
        "tips": [
            f"For ₹{budget_per_night:,.0f}/night, look for {tier['label']} properties.",
            "Book 7-14 days early for 20-30% discount.",
            "Weekday stays are typically 15% cheaper.",
            "Always check free cancellation options.",
            f"Total hotel budget for {nights} night(s): ₹{total_hotel_budget:,.0f}",
        ],
    }


# ─── Activity Planner ─────────────────────────────────────────────────────────

ACTIVITIES_DB: dict[str, dict] = {
    "trekking": {"cost_range": "₹500–₹3,000", "duration": "Half/Full day", "best_for": "Adventure", "emoji": "🥾"},
    "boating": {"cost_range": "₹200–₹1,500", "duration": "1-3 hours", "best_for": "Family/Couples", "emoji": "⛵"},
    "scuba_diving": {"cost_range": "₹3,000–₹8,000", "duration": "2-4 hours", "best_for": "Adventure", "emoji": "🤿"},
    "parasailing": {"cost_range": "₹1,500–₹3,500", "duration": "15-30 min", "best_for": "Thrill seekers", "emoji": "🪂"},
    "shopping": {"cost_range": "₹500–₹10,000+", "duration": "2-4 hours", "best_for": "Everyone", "emoji": "🛍️"},
    "museums": {"cost_range": "₹50–₹500", "duration": "2-3 hours", "best_for": "Culture/Family", "emoji": "🏛️"},
    "wildlife_safari": {"cost_range": "₹1,000–₹5,000", "duration": "Half day", "best_for": "Nature/Family", "emoji": "🦁"},
    "camping": {"cost_range": "₹800–₹3,000", "duration": "Overnight", "best_for": "Adventure/Groups", "emoji": "🏕️"},
    "cycling": {"cost_range": "₹200–₹800", "duration": "2-4 hours", "best_for": "Solo/Fitness", "emoji": "🚴"},
    "photography_tour": {"cost_range": "₹300–₹2,000", "duration": "2-4 hours", "best_for": "Solo/Photography", "emoji": "📸"},
    "cooking_class": {"cost_range": "₹500–₹2,500", "duration": "3-4 hours", "best_for": "Food lovers", "emoji": "👨‍🍳"},
    "yoga_meditation": {"cost_range": "₹200–₹1,000", "duration": "1-2 hours", "best_for": "Wellness", "emoji": "🧘"},
}

INTEREST_ACTIVITY_MAP: dict[str, list[str]] = {
    "Family":        ["boating", "museums", "wildlife_safari", "cycling", "shopping"],
    "Solo":          ["trekking", "photography_tour", "yoga_meditation", "cycling", "museums"],
    "Couple":        ["boating", "photography_tour", "cooking_class", "camping", "shopping"],
    "Friends":       ["trekking", "camping", "scuba_diving", "parasailing", "shopping"],
    "Adventure":     ["trekking", "scuba_diving", "parasailing", "camping", "wildlife_safari"],
    "Photography":   ["photography_tour", "trekking", "wildlife_safari", "museums", "cycling"],
    "Food Lover":    ["cooking_class", "shopping", "photography_tour", "cycling"],
}


def plan_activities(
    lat: float,
    lon: float,
    budget: float,
    interest: str = "Family",
    days: int = 3,
) -> dict:
    """Recommend activities based on interest + budget, fetch real venues from OSM."""
    chosen_keys = INTEREST_ACTIVITY_MAP.get(interest, INTEREST_ACTIVITY_MAP["Family"])
    activities = []
    spent = 0.0

    for key in chosen_keys:
        a = ACTIVITIES_DB.get(key, {})
        if not a:
            continue
        # Parse min cost from range string
        range_str = a.get("cost_range", "₹500–₹2,000")
        try:
            min_cost = float(range_str.replace("₹", "").replace(",", "").replace("+", "").split("–")[0].strip())
        except Exception:
            min_cost = 500
        if spent + min_cost <= budget:
            activities.append({
                "name": key.replace("_", " ").title(),
                "emoji": a.get("emoji", "🎭"),
                "cost_range": a.get("cost_range"),
                "duration": a.get("duration"),
                "best_for": a.get("best_for"),
                "estimated_cost": round(min_cost),
            })
            spent += min_cost

    # Real nearby activity venues from OSM
    nearby_venues = _overpass_query(lat, lon, 5000, CATEGORY_FILTERS["activities"])

    # Day-wise schedule
    day_plan = []
    for d in range(1, min(days + 1, 8)):
        day_acts = activities[(d - 1) % max(len(activities), 1): (d - 1) % max(len(activities), 1) + 2]
        day_plan.append({
            "day": d,
            "activities": [a["name"] for a in day_acts] if day_acts else ["Explore local area", "Rest"],
            "estimated_cost": sum(a["estimated_cost"] for a in day_acts),
        })

    return {
        "interest": interest,
        "budget": budget,
        "days": days,
        "recommended_activities": activities,
        "total_estimated_cost": round(spent),
        "budget_remaining": round(budget - spent),
        "day_wise_plan": day_plan,
        "nearby_venues": nearby_venues[:8],
        "tips": [
            "Book adventure activities 1-2 days in advance.",
            "Carry cash for local experiences — not all accept cards.",
            f"For {interest} trips, early morning starts beat the crowds.",
            "Ask locals for off-the-beaten-path recommendations.",
        ],
    }


# ─── AI Travel Guide (ChatGPT-like) ──────────────────────────────────────────

TRAVEL_INTENT_MAP = {
    "tourist": ["tourist", "attraction", "visit", "see", "sightseeing", "places", "spot", "monument", "famous", "hidden"],
    "hotel": ["hotel", "stay", "hostel", "room", "accommodation", "lodge", "resort", "homestay"],
    "food": ["food", "eat", "restaurant", "cafe", "street food", "cuisine", "dish", "meal", "hungry"],
    "activity": ["activity", "trek", "adventure", "scuba", "parasail", "boat", "swim", "dive", "camp", "safari"],
    "itinerary": ["plan", "itinerary", "schedule", "day", "trip plan", "suggest", "complete"],
    "budget": ["budget", "cheap", "affordable", "save", "money", "cost", "expensive"],
    "transport": ["how to reach", "route", "train", "flight", "bus", "cab", "transport", "travel from"],
    "photo": ["photo", "photography", "sunset", "view", "scenic", "instagram", "click"],
    "family": ["family", "kids", "children", "parents", "senior"],
    "romantic": ["couple", "romantic", "honeymoon", "anniversary"],
}


def ai_travel_guide(
    question: str,
    lat: Optional[float],
    lon: Optional[float],
    destination: str = "",
    budget: float = 10000,
    days: int = 3,
    interest: str = "Family",
) -> dict:
    """Intelligent travel guide that answers any travel question."""
    q = question.lower()
    detected_intents = []
    for intent, keywords in TRAVEL_INTENT_MAP.items():
        if any(kw in q for kw in keywords):
            detected_intents.append(intent)

    nearby_data: dict = {}
    answer_parts = []
    suggestions = []

    dest_label = destination or "your destination"

    # ─ Tourist attractions
    if "tourist" in detected_intents or "itinerary" in detected_intents or not detected_intents:
        if lat and lon:
            places = _overpass_query(lat, lon, 5000, CATEGORY_FILTERS["tourist_attractions"])
            if places:
                nearby_data["tourist_attractions"] = places[:6]
                top_names = [p["name"] for p in places[:4]]
                answer_parts.append(
                    f"**Top attractions near {dest_label}:** {', '.join(top_names)}. "
                    f"There are {len(places)} places within 5 km."
                )
            else:
                answer_parts.append(f"I found some interesting areas near {dest_label} to explore.")

    # ─ Hotels
    if "hotel" in detected_intents:
        if lat and lon:
            hotels = _overpass_query(lat, lon, 5000, CATEGORY_FILTERS["hotels"])
            nearby_data["hotels"] = hotels[:6]
            if "budget" in detected_intents or budget < 2000:
                answer_parts.append(
                    f"For budget under ₹{budget:,.0f}/night near {dest_label}, "
                    f"I found {len(hotels)} hotel options. OYO and Zostel are great for budget stays. "
                    "Always check reviews before booking."
                )
            else:
                answer_parts.append(
                    f"I found {len(hotels)} hotels near {dest_label}. "
                    "Book on MakeMyTrip or Goibibo for best prices with free cancellation."
                )
            suggestions.extend(["View hotels map", "Filter by price", "Compare on MakeMyTrip"])

    # ─ Food
    if "food" in detected_intents:
        if lat and lon:
            restaurants = _overpass_query(lat, lon, 2000, CATEGORY_FILTERS["restaurants"])
            nearby_data["restaurants"] = restaurants[:6]
            if restaurants:
                food_names = [r["name"] for r in restaurants[:3]]
                answer_parts.append(
                    f"**Best food spots near you:** {', '.join(food_names)}. "
                    f"Found {len(restaurants)} restaurants within 2 km."
                )
            else:
                answer_parts.append(f"Try local street food in {dest_label} for the most authentic experience.")
            suggestions.extend(["Find veg restaurants", "Street food spots", "Cafes nearby"])

    # ─ Activities
    if "activity" in detected_intents:
        act_result = plan_activities(lat or 0, lon or 0, budget, interest, days)
        nearby_data["activities"] = act_result.get("nearby_venues", [])[:5]
        act_names = [a["name"] for a in act_result["recommended_activities"][:3]]
        if act_names:
            answer_parts.append(
                f"**Top activities for {interest} travelers:** {', '.join(act_names)}. "
                f"Estimated activity cost: ₹{act_result['total_estimated_cost']:,.0f} for {days} days."
            )

    # ─ Photography
    if "photo" in detected_intents:
        if lat and lon:
            viewpoints = _overpass_query(lat, lon, 8000, '[tourism~"viewpoint|artwork"]')
            nearby_data["photography_spots"] = viewpoints[:5]
            if viewpoints:
                answer_parts.append(
                    f"**Best photography spots:** {', '.join(v['name'] for v in viewpoints[:3])}. "
                    "Best light: golden hour (6-7 AM and 5-7 PM)."
                )
            else:
                answer_parts.append("Explore rooftops, ghats, and local markets for great photography.")

    # ─ Itinerary
    if "itinerary" in detected_intents:
        answer_parts.append(
            f"**{days}-day itinerary for {dest_label} (₹{budget:,.0f} budget):**\n"
            + "\n".join(
                f"Day {d+1}: Explore local area, visit attractions, try local food."
                for d in range(min(days, 5))
            )
        )
        suggestions.extend(["Detailed day plan", "Budget breakdown", "What to pack"])

    # ─ Budget tips
    if "budget" in detected_intents:
        answer_parts.append(
            f"**Budget tips for ₹{budget:,.0f}:** "
            "Travel by train/bus to save 60% vs flights. "
            "Stay at hostels (₹300-800/night). "
            "Eat at local dhabas (₹50-150/meal). "
            "Use public transport (₹10-50/trip)."
        )

    # ─ Family/Romantic
    if "family" in detected_intents:
        answer_parts.append(
            f"**Family-friendly tips for {dest_label}:** "
            "Choose hotels with kids amenities. "
            "Visit theme parks, zoos, and beaches. "
            "Carry snacks and first-aid kit. "
            "Book activities suitable for all ages."
        )
    if "romantic" in detected_intents:
        answer_parts.append(
            f"**Romantic ideas for {dest_label}:** "
            "Book a private villa or resort. "
            "Sunset cruise or rooftop dinner. "
            "Photography session at scenic viewpoints. "
            "Couple's spa and wellness packages."
        )

    # ─ Default fallback
    if not answer_parts:
        answer_parts.append(
            f"I can help you plan your trip to **{dest_label}**! "
            "Ask me about: tourist attractions, hotels, restaurants, activities, budget tips, "
            "photography spots, or generate a complete itinerary."
        )
        suggestions = [
            "Show tourist attractions",
            "Find hotels under ₹2000",
            "Best restaurants nearby",
            "Plan 3-day itinerary",
            "Budget-friendly activities",
            "Photography spots",
        ]

    if not suggestions:
        suggestions = [
            "Find more attractions",
            "Hotels in this area",
            "Food nearby",
            "Activity recommendations",
        ]

    full_answer = "\n\n".join(answer_parts)

    return {
        "question": question,
        "answer": full_answer,
        "destination": dest_label,
        "nearby_data": nearby_data,
        "suggestions": suggestions[:6],
        "detected_intents": detected_intents,
    }
