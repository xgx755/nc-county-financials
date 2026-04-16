#!/usr/bin/env python3
"""
merge_tax_rates.py
Reads 2025-2026_Tax_Rates_&_Effective_Tax_Rates.xlsx, extracts county-only rows,
and merges tax fields into src/data/counties.json.
"""

import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

ROOT        = Path(__file__).parent.parent
EXCEL_PATH  = ROOT / "2025-2026_Tax_Rates_&_Effective_Tax_Rates.xlsx"
JSON_PATH   = ROOT / "src/data/counties.json"
SHEET_NAME  = "Tax Rates & Effective Tax Rates"

# Column indices (0-based) — confirmed from file inspection
COL_COUNTY      = 0
COL_MUNI        = 1
COL_SALES_RATIO = 3
COL_APPRAISAL   = 4
COL_COUNTY_RATE = 5
COL_EFF_RATE    = 8

# Name overrides: Excel title-case → AFIR casing
NAME_OVERRIDES = {
    "Mcdowell": "McDowell",
}


def normalize_name(raw: str) -> str:
    name = raw.strip().title()
    return NAME_OVERRIDES.get(name, name)


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def load_tax_data(xlsx_path: Path) -> dict:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb[SHEET_NAME]
    rows = list(ws.iter_rows(values_only=True))

    tax_data = {}
    # Row 0 = title, Row 1 = headers, Row 2+ = data
    for row in rows[2:]:
        if not any(row):
            continue
        county_raw = row[COL_COUNTY]
        muni_raw   = row[COL_MUNI]
        if county_raw is None or muni_raw is None:
            continue
        if str(muni_raw).strip().lower() != "county only":
            continue

        county_name = normalize_name(str(county_raw))
        tax_data[county_name] = {
            "county_rate":    to_float(row[COL_COUNTY_RATE]),
            "effective_rate": to_float(row[COL_EFF_RATE]),
            "appraisal_year": to_int(row[COL_APPRAISAL]),
            "sales_ratio":    to_float(row[COL_SALES_RATIO]),
        }

    print(f"Extracted {len(tax_data)} county-only rows from '{SHEET_NAME}'.")
    return tax_data


def merge(json_path: Path, tax_data: dict):
    with open(json_path) as f:
        counties = json.load(f)

    matched   = 0
    unmatched = []

    for county in counties:
        name = county["name"]
        if name in tax_data:
            county["tax"] = tax_data[name]
            matched += 1
        else:
            county["tax"] = None
            unmatched.append(name)

    if unmatched:
        print(f"WARNING: No tax data for {len(unmatched)} counties: {unmatched}")
    else:
        print(f"All {matched} counties matched successfully.")

    with open(json_path, "w") as f:
        json.dump(counties, f, indent=2)

    print(f"Updated {json_path}")


if __name__ == "__main__":
    print("=== merge_tax_rates.py ===")
    tax_data = load_tax_data(EXCEL_PATH)
    merge(JSON_PATH, tax_data)
    print("Done.")
