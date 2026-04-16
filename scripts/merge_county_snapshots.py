#!/usr/bin/env python3
"""
merge_county_snapshots.py

Builds the runtime county snapshot dataset for the app:
- Prefer FY2025 AFIR data
- Fall back to FY2024 when FY2025 is missing
- Otherwise use the latest available older AFIR snapshot
- Preserve counties with no AFIR data at all as explicit no-data entries
- Merge county tax metadata for all 100 counties
"""

import json
from pathlib import Path

from merge_tax_rates import EXCEL_PATH, load_tax_data

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "src" / "data"
OUT_PATH = DATA_DIR / "counties.json"

REV_CATS = [
    "Property Taxes",
    "Other Taxes",
    "Sales Tax",
    "Sales & Services",
    "Intergovernmental",
    "Debt Proceeds",
    "Other Misc",
    "Total Revenue",
]

EXP_CATS = [
    "Education",
    "Debt Service",
    "Human Services",
    "General Government",
    "Public Safety",
    "Other",
    "Total Expenditures",
]


def load_json(path: Path):
    with open(path) as f:
        return json.load(f)


def load_year_snapshot(year: int):
    if year == 2025:
        fy2025_path = DATA_DIR / "counties-fy2025.json"
        if fy2025_path.exists():
            return load_json(fy2025_path)

        current = load_json(OUT_PATH)
        if current and "data_year" in current[0]:
            return [county for county in current if county.get("data_year") == 2025]
        return current

    return load_json(DATA_DIR / f"counties-fy{year}.json")


def empty_metrics(keys):
    return {key: None for key in keys}


def make_no_data_county(name: str, tax: dict | None):
    return {
        "name": name,
        "pop": None,
        "pg": None,
        "r": empty_metrics(REV_CATS),
        "e": empty_metrics(EXP_CATS),
        "pr": empty_metrics(REV_CATS),
        "pe": empty_metrics(EXP_CATS),
        "gr": empty_metrics(REV_CATS),
        "ge": empty_metrics(EXP_CATS),
        "fb": None,
        "tax": tax,
        "data_year": None,
        "is_fallback": True,
        "fallback_reason": "missing_all_afir_data",
    }


def with_metadata(county: dict, year: int, reason: str | None, tax: dict | None):
    merged = json.loads(json.dumps(county))
    merged["tax"] = tax
    merged["data_year"] = year
    merged["is_fallback"] = year != 2025
    merged["fallback_reason"] = reason
    return merged


def choose_snapshot(name: str, snapshots_by_year: dict[int, dict[str, dict]], tax: dict | None):
    if name in snapshots_by_year[2025]:
        return with_metadata(snapshots_by_year[2025][name], 2025, None, tax)
    if name in snapshots_by_year[2024]:
        return with_metadata(snapshots_by_year[2024][name], 2024, "missing_2025", tax)

    for year in range(2023, 2015, -1):
        if name in snapshots_by_year[year]:
            return with_metadata(snapshots_by_year[year][name], year, "missing_2025_and_2024", tax)

    return make_no_data_county(name, tax)


def main():
    tax_data = load_tax_data(EXCEL_PATH)
    canonical_names = sorted(tax_data.keys())

    snapshots_by_year = {}
    for year in range(2016, 2026):
        snapshots = load_year_snapshot(year)
        snapshots_by_year[year] = {county["name"]: county for county in snapshots}

    merged = [
        choose_snapshot(name, snapshots_by_year, tax_data.get(name))
        for name in canonical_names
    ]

    with open(OUT_PATH, "w") as f:
        json.dump(merged, f, indent=2)

    counts = {}
    for county in merged:
        key = county["data_year"] if county["data_year"] is not None else "none"
        counts[key] = counts.get(key, 0) + 1

    print(f"Wrote {len(merged)} counties to {OUT_PATH}")
    print("Snapshot year counts:", counts)


if __name__ == "__main__":
    main()
