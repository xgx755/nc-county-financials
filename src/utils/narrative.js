// Shared narrative generator — used by both the interactive Data View and PrintReport.
// Returns named fields so callers can render each sentence independently.

import { REV_CATS, EXP_CATS } from "../constants.js";

const LGC_MIN = 0.08;

function fmtPC(n) {
  return n != null ? "$" + Math.round(n).toLocaleString() : "—";
}
function fmtPct(v) {
  return v != null ? (v * 100).toFixed(1) + "%" : "—";
}
function fmtTax(r) {
  return r != null ? "$" + r.toFixed(3) : "—";
}

// Finds the category with the largest absolute per-capita delta from its group average,
// then returns a sentence describing it.
// type: "revenue" | "spending"  → controls the verb used in the sentence
function computeOutlier(county, cats, actualKey, avgKey, type) {
  let maxAbsDelta = 0;
  let maxCat = null;
  let maxActual = null;
  let maxAvg = null;

  for (const cat of cats) {
    const actual = county[actualKey]?.[cat];
    const avg = county[avgKey]?.[cat];
    if (actual == null || avg == null || avg === 0) continue;
    const absDelta = Math.abs(actual - avg);
    if (absDelta > maxAbsDelta) {
      maxAbsDelta = absDelta;
      maxCat = cat;
      maxActual = actual;
      maxAvg = avg;
    }
  }

  if (!maxCat) return null;

  const delta = maxActual - maxAvg;
  const absDelta = Math.abs(delta);
  const pct = (Math.abs(delta / maxAvg) * 100).toFixed(1);
  const aboveBelow = delta >= 0 ? "above" : "below";
  const direction = delta >= 0 ? "more" : "less";
  const verb = type === "revenue" ? "collects" : "spends";

  return (
    `The largest ${type} difference from the ${county.pg} average is ${maxCat}: ` +
    `${county.name} ${verb} ${direction} $${Math.round(absDelta).toLocaleString()}/capita ` +
    `(${pct}% ${aboveBelow} the group average).`
  );
}

// Returns 5 named sentence strings (or null for each field when data is unavailable).
export function generateNarrative(county) {
  let fund_balance = null;
  let revenue = null;
  let tax_rate = null;

  if (county.fb?.pct != null) {
    const pct = county.fb.pct;
    const pctStr = fmtPct(pct);
    const grp = county.pg;
    if (pct < LGC_MIN) {
      fund_balance =
        `${county.name} County's general fund balance of ${pctStr} falls below the NC Local Government Commission's ` +
        `recommended minimum of 8%, which may require attention before the next budget cycle.`;
    } else if (pct <= 0.25) {
      fund_balance =
        `${county.name} County's general fund balance of ${pctStr} meets the NC LGC minimum of 8% and is within the ` +
        `moderate range for counties in the ${grp} population group.`;
    } else {
      fund_balance =
        `${county.name} County's general fund balance of ${pctStr} exceeds the NC LGC minimum of 8%, indicating a ` +
        `healthy financial reserve relative to net expenditures.`;
    }
  }

  if (county.pr?.["Total Revenue"] != null && county.gr?.["Total Revenue"] != null) {
    const rev = county.pr["Total Revenue"];
    const grpRev = county.gr["Total Revenue"];
    const delta = Math.abs(((rev - grpRev) / grpRev) * 100).toFixed(1);
    const direction = rev > grpRev ? "above" : "below";
    revenue =
      `${county.name}'s revenue per capita of ${fmtPC(rev)} is ${delta}% ${direction} the ` +
      `${county.pg} population group average of ${fmtPC(grpRev)}.`;
  }

  if (county.tax?.county_rate != null) {
    tax_rate =
      `${county.name}'s property tax rate of ${fmtTax(county.tax.county_rate)} per $100 assessed value ` +
      `(effective rate: ${fmtTax(county.tax.effective_rate)}) reflects its most recent reappraisal cycle.`;
  }

  const revenue_outlier = computeOutlier(county, REV_CATS, "pr", "gr", "revenue");
  const spending_outlier = computeOutlier(county, EXP_CATS, "pe", "ge", "spending");

  return { fund_balance, revenue, tax_rate, revenue_outlier, spending_outlier };
}
