#!/usr/bin/env python3
"""
merge_history.py
Merges all per-year AFIR JSON files (counties-fy{YEAR}.json) plus the
canonical FY2025 counties.json into a single counties-history.json keyed
by county name.

Output schema per county:
  {
    "Durham": [
      { "year": 2022, "fb_pct": 0.195, "rev_pc": 2456.0, "exp_pc": 2234.0, "pg": "100,000 or Above" },
      ...
    ],
    ...
  }

Rules:
  - Array entries are sorted ascending by year.
  - If a county has no entry for a given year (didn't file), that year is omitted.
  - If a county filed but fund balance data is absent, fb_pct is null.
  - pg is set once per county using the most recent year's non-null pg value
    (stable peer group across all years).
  - Only counties that appear in the canonical runtime list (counties.json) are
    included in the output.

Usage:
    python3 scripts/merge_history.py

Output:
    src/data/counties-history.json
"""

import json
import sys
import warnings
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "src" / "data"
OUTPUT_PATH = DATA_DIR / "counties-history.json"

# FY2016–FY2024 come from per-year files; canonical county names come from counties.json
YEAR_FILES = {
    year: DATA_DIR / f"counties-fy{year}.json"
    for year in range(2016, 2025)
}
CANONICAL_FILE = DATA_DIR / "counties.json"  # FY2025


def load_year(path: Path, year: int) -> list[dict]:
    """Load a per-year JSON file and return normalized entries."""
    with open(path) as f:
        raw = json.load(f)
    entries = []
    for county in raw:
        name = county.get("name")
        if not name:
            continue
        fb = county.get("fb")
        fb_pct = fb.get("pct") if fb else None
        pr = county.get("pr") or {}
        pe = county.get("pe") or {}
        rev_pc = pr.get("Total Revenue")
        exp_pc = pe.get("Total Expenditures")
        pg = county.get("pg")
        entries.append({
            "name": name,
            "year": year,
            "fb_pct": fb_pct,
            "rev_pc": rev_pc,
            "exp_pc": exp_pc,
            "pg": pg,
        })
    return entries


def main():
    # Accumulate all data keyed by county name
    # county_data[name] = list of year entries (unsorted)
    county_data: dict[str, list] = defaultdict(list)

    print("Loading per-year files...")
    for year, path in sorted(YEAR_FILES.items()):
        if not path.exists():
            print(f"  WARNING: {path.name} not found — skipping FY{year}")
            continue
        entries = load_year(path, year)
        for e in entries:
            county_data[e["name"]].append({
                "year": e["year"],
                "fb_pct": e["fb_pct"],
                "rev_pc": e["rev_pc"],
                "exp_pc": e["exp_pc"],
                "pg": e["pg"],
            })
        print(f"  FY{year}: {len(entries)} counties")

    # Load FY2025 from canonical counties.json
    print(f"\nLoading FY2025 from {CANONICAL_FILE.name}...")
    if not CANONICAL_FILE.exists():
        print(f"ERROR: {CANONICAL_FILE} not found")
        sys.exit(1)

    with open(CANONICAL_FILE) as f:
        canonical = json.load(f)
    canonical_names = set()
    for county in canonical:
        name = county.get("name")
        if not name:
            continue
        canonical_names.add(name)
        fb = county.get("fb")
        fb_pct = fb.get("pct") if fb else None
        pr = county.get("pr") or {}
        pe = county.get("pe") or {}
        county_data[name].append({
            "year": 2025,
            "fb_pct": fb_pct,
            "rev_pc": pr.get("Total Revenue"),
            "exp_pc": pe.get("Total Expenditures"),
            "pg": county.get("pg"),
        })
    print(f"  FY2025: {len(canonical)} counties")

    # Assign stable pg: use the most recent non-null pg for each county
    print("\nAssigning stable population groups...")
    pg_changes = []
    pg_missing = []
    for name, entries in county_data.items():
        sorted_entries = sorted(entries, key=lambda e: e["year"])
        # Find the most recent non-null pg
        stable_pg = None
        for e in reversed(sorted_entries):
            if e.get("pg"):
                stable_pg = e["pg"]
                break
        if stable_pg is None:
            pg_missing.append(name)
        else:
            # Check for changes across years
            pgs = [e["pg"] for e in sorted_entries if e.get("pg")]
            if len(set(pgs)) > 1:
                pg_changes.append((name, pgs[0], pgs[-1]))
            # Overwrite pg on all entries with the stable value
            for e in sorted_entries:
                e["pg"] = stable_pg
        # Re-sort entries by year (ascending)
        county_data[name] = sorted(entries, key=lambda e: e["year"])

    # Validation warnings
    if pg_changes:
        for name, first_pg, last_pg in pg_changes:
            print(f"  WARNING: {name} pg changed: '{first_pg}' → '{last_pg}' (using '{last_pg}')")
    if pg_missing:
        for name in pg_missing:
            print(f"  WARNING: {name} has no pg in any year — will be excluded from peer ranking")
        if len(pg_missing) > 5:
            print(f"ERROR: {len(pg_missing)} counties missing pg — data integrity failure")
            sys.exit(1)

    # Build output: only include counties in the FY2025 canonical list
    # Historical filers not in FY2025 are omitted from top-level keys but
    # their data was used to compute stable pg above.
    output = {}
    for name in sorted(canonical_names):
        if name in county_data:
            output[name] = county_data[name]
        else:
            print(f"  WARNING: {name} in counties.json but has no historical data")

    # Write output
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    total_entries = sum(len(v) for v in output.values())
    print(f"\nWrote {OUTPUT_PATH.name}")
    print(f"  Counties: {len(output)}")
    print(f"  Total year entries: {total_entries}")
    print(f"  Avg years per county: {total_entries / len(output):.1f}")

    # Spot-check Durham
    if "Durham" in output:
        durham = output["Durham"]
        print(f"\nSpot-check Durham ({len(durham)} years):")
        for e in durham:
            fb = f"{e['fb_pct']:.3f}" if e["fb_pct"] is not None else "null"
            print(f"  FY{e['year']}: fb_pct={fb}  rev_pc={e['rev_pc']}  pg={e['pg']}")

    print("\nDone.")


if __name__ == "__main__":
    main()
