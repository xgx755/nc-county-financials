#!/usr/bin/env python3
"""
convert_afir.py
Extracts county financial data from a NC AFIR Excel file and writes
a counties-fy{YEAR}.json matching the schema of src/data/counties.json.

Usage:
    python3 scripts/convert_afir.py <path/to/afir.xlsx>

Output:
    src/data/counties-fy{YEAR}.json

Row mapping (0-indexed, identical across FY2016-FY2025):
  8   County names ("Alamance County", ...)
  9   Population
  10  Population Group
  12-19  Revenues by Source (raw $)
  20-26  Expenditures by Function (raw $)
  35-42  Per Capita Revenues by Source
  43-49  Per Capita Expenditures by Function
  58-65  Group Avg Per Capita Revenues
  66-72  Group Avg Per Capita Expenditures
  90  FBA in dollars
  91  FBA as % of GF Net Expenditures (unit)
  92  FBA group average %
  93  FBA state average %

County data columns start at col index 8 (all 100 NC counties in alpha order).
Only counties with usable AFIR data for that year are emitted into the per-year
snapshot file; the runtime 100-county dataset is assembled later by
merge_county_snapshots.py.
"""

import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

ROOT = Path(__file__).parent.parent

# ── Row indices (0-based) ─────────────────────────────────────────────────────

ROW_NAME     = 8
ROW_POP      = 9
ROW_PG       = 10

REV_ROWS = {
    "Property Taxes":    12,
    "Other Taxes":       13,
    "Sales Tax":         14,
    "Sales & Services":  15,
    "Intergovernmental": 16,
    "Debt Proceeds":     17,
    "Other Misc":        18,
    "Total Revenue":     19,
}

EXP_ROWS = {
    "Education":          20,
    "Debt Service":       21,
    "Human Services":     22,
    "General Government": 23,
    "Public Safety":      24,
    "Other":              25,
    "Total Expenditures": 26,
}

PR_ROWS = {
    "Property Taxes":    35,
    "Other Taxes":       36,
    "Sales Tax":         37,
    "Sales & Services":  38,
    "Intergovernmental": 39,
    "Debt Proceeds":     40,
    "Other Misc":        41,
    "Total Revenue":     42,
}

PE_ROWS = {
    "Education":          43,
    "Debt Service":       44,
    "Human Services":     45,
    "General Government": 46,
    "Public Safety":      47,
    "Other":              48,
    "Total Expenditures": 49,
}

GR_ROWS = {
    "Property Taxes":    58,
    "Other Taxes":       59,
    "Sales Tax":         60,
    "Sales & Services":  61,
    "Intergovernmental": 62,
    "Debt Proceeds":     63,
    "Other Misc":        64,
    "Total Revenue":     65,
}

GE_ROWS = {
    "Education":          66,
    "Debt Service":       67,
    "Human Services":     68,
    "General Government": 69,
    "Public Safety":      70,
    "Other":              71,
    "Total Expenditures": 72,
}

FB_ROWS = {
    "dollars":   90,
    "pct":       91,
    "grp_pct":   92,
    "state_pct": 93,
}

COL_OFFSET = 8  # first county is at col index 8

# ── Name normalization ────────────────────────────────────────────────────────

NAME_OVERRIDES = {
    "Mcdowell": "McDowell",
}

def normalize_name(raw):
    name = str(raw).replace(" County", "").strip().title()
    return NAME_OVERRIDES.get(name, name)


# ── Value helpers ─────────────────────────────────────────────────────────────

def to_float(v):
    try:
        f = float(v)
        return None if f == 0.0 and v is None else f
    except (TypeError, ValueError):
        return None

def to_float_allow_zero(v):
    """Like to_float but keeps explicit 0.0 values (valid for some revenue categories)."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def extract_section(rows, row_map, ci, allow_zero=False):
    conv = to_float_allow_zero if allow_zero else to_float
    return {k: conv(rows[ri][ci]) for k, ri in row_map.items() if ci < len(rows[ri])}


def has_data(rows, ci):
    """Return True if the county column has a non-zero Total Revenue value."""
    rev_total = rows[REV_ROWS["Total Revenue"]][ci] if ci < len(rows[REV_ROWS["Total Revenue"]]) else None
    try:
        return float(rev_total) > 0
    except (TypeError, ValueError):
        return False


# ── Fiscal year from header ───────────────────────────────────────────────────

def extract_fiscal_year(rows):
    # Row 5 (0-indexed row 4): "As of 6/30/YYYY"
    cell = rows[4][1] if len(rows[4]) > 1 else None
    if cell and "6/30/" in str(cell):
        year = str(cell).split("6/30/")[-1].strip()[:4]
        return int(year)
    raise ValueError(f"Cannot parse fiscal year from header cell: {cell!r}")


# ── Main extraction ───────────────────────────────────────────────────────────

def extract(xlsx_path: Path) -> tuple[int, list]:
    print(f"Reading {xlsx_path.name}…")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()

    fy = extract_fiscal_year(rows)
    print(f"  Fiscal year: FY{fy}")

    name_row = rows[ROW_NAME]
    counties = []

    for ci in range(COL_OFFSET, len(name_row)):
        raw_name = name_row[ci]
        if not raw_name:
            continue
        name = normalize_name(raw_name)

        if not has_data(rows, ci):
            continue  # county didn't file AFIR this year

        pop = to_int(rows[ROW_POP][ci]) if ci < len(rows[ROW_POP]) else None
        pg  = rows[ROW_PG][ci] if ci < len(rows[ROW_PG]) else None
        if pg is not None:
            pg = str(pg).strip()

        r  = extract_section(rows, REV_ROWS, ci, allow_zero=True)
        e  = extract_section(rows, EXP_ROWS, ci, allow_zero=True)
        pr = extract_section(rows, PR_ROWS,  ci, allow_zero=True)
        pe = extract_section(rows, PE_ROWS,  ci, allow_zero=True)
        gr = extract_section(rows, GR_ROWS,  ci, allow_zero=True)
        ge = extract_section(rows, GE_ROWS,  ci, allow_zero=True)

        # Fund balance: None if dollar value is absent
        fb_dollars = to_float(rows[FB_ROWS["dollars"]][ci]) if ci < len(rows[FB_ROWS["dollars"]]) else None
        if fb_dollars is not None and fb_dollars > 0:
            fb = {
                "dollars":   int(fb_dollars),
                "pct":       to_float(rows[FB_ROWS["pct"]][ci]),
                "grp_pct":   to_float(rows[FB_ROWS["grp_pct"]][ci]),
                "state_pct": to_float(rows[FB_ROWS["state_pct"]][ci]),
            }
        else:
            fb = None

        counties.append({
            "name": name,
            "pop":  pop,
            "pg":   pg,
            "r":    r,
            "e":    e,
            "pr":   pr,
            "pe":   pe,
            "gr":   gr,
            "ge":   ge,
            "fb":   fb,
        })

    counties.sort(key=lambda c: c["name"])
    return fy, counties


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/convert_afir.py <path/to/afir.xlsx>")
        sys.exit(1)

    xlsx_path = Path(sys.argv[1])
    if not xlsx_path.exists():
        print(f"ERROR: File not found: {xlsx_path}")
        sys.exit(1)

    fy, counties = extract(xlsx_path)

    out_path = ROOT / "src" / "data" / f"counties-fy{fy}.json"
    with open(out_path, "w") as f:
        json.dump(counties, f, indent=2)

    print(f"  Extracted {len(counties)} counties → {out_path}")
    print("Done.")
