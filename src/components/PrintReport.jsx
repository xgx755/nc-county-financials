// PrintReport.jsx — White-background print layout for react-to-print
// Hidden from main UI via the wrapper style in nc-county-financials.jsx
// (position:absolute; left:-9999px — do NOT use display:none, breaks react-to-print)

import { forwardRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, ReferenceLine } from "recharts";
import { REV_CATS, EXP_CATS } from "../constants.js";
import { generateNarrative } from "../utils/narrative.js";

const NC_BLUE    = "#003087";
const CMP_COLOR  = "#7a4f00"; // amber-brown for compare county bars
const LGC_MIN    = 0.08;

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPC(n) {
  return n != null ? "$" + Math.round(n).toLocaleString() : "—";
}
function fmtPct(v) {
  return v != null ? (v * 100).toFixed(1) + "%" : "—";
}
function fmtTax(r) {
  return r != null ? "$" + r.toFixed(3) : "—";
}
function fmtPop(n) {
  return n != null ? n.toLocaleString() : "—";
}
function fmtDate() {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function getSnapshotLabel(county) {
  if (!county?.is_fallback) return null;
  return county.data_year != null ? `Using FY${county.data_year} fallback data` : "No AFIR snapshot data available";
}

// ── Compare-county narrative (print-only) ────────────────────────────────────

function buildCompareNarrative(compare) {
  const sentences = [];
  if (compare.fb?.pct != null) {
    const pct = compare.fb.pct;
    const pctStr = fmtPct(pct);
    if (pct < LGC_MIN) {
      sentences.push(`${compare.name} County's general fund balance of ${pctStr} falls below the NC LGC recommended minimum of 8%.`);
    } else if (pct <= 0.25) {
      sentences.push(`${compare.name} County's general fund balance of ${pctStr} meets the NC LGC minimum of 8%.`);
    } else {
      sentences.push(`${compare.name} County's general fund balance of ${pctStr} exceeds the NC LGC minimum of 8%.`);
    }
  }
  if (compare.pr?.["Total Revenue"] != null && compare.gr?.["Total Revenue"] != null) {
    const rev = compare.pr["Total Revenue"];
    const grpRev = compare.gr["Total Revenue"];
    const delta = Math.abs(((rev - grpRev) / grpRev) * 100).toFixed(1);
    const direction = rev > grpRev ? "above" : "below";
    sentences.push(
      `${compare.name}'s revenue per capita of ${fmtPC(rev)} is ${delta}% ${direction} the ${compare.pg} population group average of ${fmtPC(grpRev)}.`
    );
  }
  return sentences;
}

// ── Print-safe fund balance bar ───────────────────────────────────────────────

function PrintFundBalanceTrack({ label, fb, fillColor, domain }) {
  if (!fb?.pct) return null;
  const { pct, grp_pct } = fb;
  const toW = (v) => Math.min((v / domain) * 100, 100).toFixed(1) + "%";

  return (
    <div style={{ marginBottom: 18 }}>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 600, color: "#444", marginBottom: 10, fontFamily: "Arial, sans-serif" }}>
          {label}
        </div>
      )}
      {/* Pct label above */}
      <div style={{ position: "relative", height: 16, marginBottom: 2, fontSize: 11, fontWeight: 700, color: fillColor }}>
        <span style={{ position: "absolute", left: toW(pct), transform: "translateX(-50%)" }}>{fmtPct(pct)}</span>
      </div>
      {/* Track */}
      <div style={{ position: "relative", height: 12, background: "#e0e0e0", borderRadius: 6, overflow: "visible" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: toW(pct), background: fillColor, borderRadius: 6 }} />
        <div style={{ position: "absolute", left: toW(LGC_MIN), top: -3, width: 2, height: 18, background: "#555", borderRadius: 1 }} />
        {grp_pct != null && (
          <div style={{ position: "absolute", left: toW(grp_pct), top: -3, width: 2, height: 18, background: "#e6a800", borderRadius: 1 }} />
        )}
      </div>
      {/* Labels below */}
      <div style={{ position: "relative", height: 20, marginTop: 4, fontSize: 10, color: "#555", fontFamily: "Arial, sans-serif" }}>
        <span style={{ position: "absolute", left: toW(LGC_MIN), transform: "translateX(-50%)", whiteSpace: "nowrap" }}>LGC Min 8%</span>
        {grp_pct != null && (
          <span style={{ position: "absolute", left: toW(grp_pct), transform: "translateX(-50%)", whiteSpace: "nowrap", color: "#b87800" }}>
            Group Avg {fmtPct(grp_pct)}
          </span>
        )}
      </div>
    </div>
  );
}

function PrintFundBalance({ county, compare }) {
  const primaryColor = (pct) => pct == null ? "#888" : pct < LGC_MIN ? "#AE2012" : pct <= 0.25 ? "#e6a800" : "#1a6f8a";

  const allVals = [
    LGC_MIN,
    county.fb?.pct, county.fb?.grp_pct, county.fb?.state_pct,
    compare?.fb?.pct, compare?.fb?.grp_pct,
  ].filter(v => v != null && v > 0);
  const domain = Math.max(Math.min(Math.max(...allVals) * 1.35, 1), LGC_MIN * 3);

  if (!county.fb?.pct) {
    return (
      <div style={{ padding: "10px 14px", border: "1px solid #ccc", borderLeft: "3px solid #e6a800", borderRadius: 4, marginBottom: 16, fontFamily: "Arial, sans-serif" }}>
        <strong>Fund balance data not available</strong> — {county.name} County did not file an audit included in this AFIR dataset.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#555", fontWeight: 600, marginBottom: 14, fontFamily: "Arial, sans-serif" }}>
        Fund Balance
      </div>
      <PrintFundBalanceTrack
        label={compare ? county.name : null}
        fb={county.fb}
        fillColor={primaryColor(county.fb?.pct)}
        domain={domain}
      />
      {compare && (
        compare.fb?.pct != null
          ? <PrintFundBalanceTrack
              label={compare.name}
              fb={compare.fb}
              fillColor={primaryColor(compare.fb?.pct)}
              domain={domain}
            />
          : <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", marginBottom: 8, fontFamily: "Arial, sans-serif" }}>
              Fund balance data not available for {compare.name} County.
            </div>
      )}
      {/* State avg note at bottom when single county */}
      {!compare && county.fb?.state_pct != null && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4, fontFamily: "Arial, sans-serif" }}>
          State average: {fmtPct(county.fb.state_pct)}
        </div>
      )}
    </div>
  );
}

// ── Print-safe charts ─────────────────────────────────────────────────────────

function PrintBarChart({ data, hasCompare, compareName }) {
  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ddd" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: "#333" }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 9, fill: "#333" }} tickFormatter={v => "$" + Math.round(v).toLocaleString()} width={72} />
          <Bar dataKey="County" fill={NC_BLUE} isAnimationActive={false} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Group Avg" fill="#aaa" isAnimationActive={false} radius={[2, 2, 0, 0]} />
          {hasCompare && (
            <Bar dataKey={compareName} fill={CMP_COLOR} isAnimationActive={false} radius={[2, 2, 0, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Comparison stat table ─────────────────────────────────────────────────────

function CompareTable({ county, compare }) {
  const rows = [
    {
      label: "Revenue / Capita",
      a: county.pr?.["Total Revenue"] != null ? fmtPC(county.pr["Total Revenue"]) : "—",
      b: compare.pr?.["Total Revenue"] != null ? fmtPC(compare.pr["Total Revenue"]) : "—",
    },
    {
      label: "Expenditure / Capita",
      a: county.pe?.["Total Expenditures"] != null ? fmtPC(county.pe["Total Expenditures"]) : "—",
      b: compare.pe?.["Total Expenditures"] != null ? fmtPC(compare.pe["Total Expenditures"]) : "—",
    },
    {
      label: "Net Surplus / Capita",
      a: county.pr?.["Total Revenue"] != null && county.pe?.["Total Expenditures"] != null
        ? (county.pr["Total Revenue"] - county.pe["Total Expenditures"] >= 0 ? "+" : "") + fmtPC(county.pr["Total Revenue"] - county.pe["Total Expenditures"])
        : "—",
      b: compare.pr?.["Total Revenue"] != null && compare.pe?.["Total Expenditures"] != null
        ? (compare.pr["Total Revenue"] - compare.pe["Total Expenditures"] >= 0 ? "+" : "") + fmtPC(compare.pr["Total Revenue"] - compare.pe["Total Expenditures"])
        : "—",
    },
    {
      label: "Fund Balance %",
      a: fmtPct(county.fb?.pct),
      b: fmtPct(compare.fb?.pct),
    },
    {
      label: "Property Tax Rate",
      a: fmtTax(county.tax?.county_rate),
      b: fmtTax(compare.tax?.county_rate),
    },
    {
      label: "Effective Tax Rate",
      a: fmtTax(county.tax?.effective_rate),
      b: fmtTax(compare.tax?.effective_rate),
    },
    {
      label: "Population",
      a: fmtPop(county.pop),
      b: fmtPop(compare.pop),
    },
    {
      label: "Population Group",
      a: county.pg,
      b: compare.pg,
    },
  ];

  const tdBase = { padding: "7px 12px", fontSize: 12, borderBottom: "1px solid #eee", fontFamily: "Arial, sans-serif" };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
      <thead>
        <tr style={{ background: "#f0f4f8" }}>
          <th style={{ ...tdBase, textAlign: "left", fontWeight: 600, color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Metric</th>
          <th style={{ ...tdBase, textAlign: "right", fontWeight: 700, color: NC_BLUE }}>{county.name}</th>
          <th style={{ ...tdBase, textAlign: "right", fontWeight: 700, color: CMP_COLOR }}>{compare.name}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, a, b }) => (
          <tr key={label}>
            <td style={{ ...tdBase, color: "#444" }}>{label}</td>
            <td style={{ ...tdBase, textAlign: "right", fontWeight: 600, color: "#111" }}>{a}</td>
            <td style={{ ...tdBase, textAlign: "right", fontWeight: 600, color: "#111" }}>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Stat card (print, single county mode) ────────────────────────────────────

function PrintStatCard({ label, value, subLabel }) {
  return (
    <div style={{
      border: "1px solid #ccc",
      borderTop: `3px solid ${NC_BLUE}`,
      borderRadius: 4,
      padding: "10px 14px",
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#555", marginBottom: 6, fontWeight: 600, fontFamily: "Arial, sans-serif" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111", fontFamily: "Georgia, serif" }}>
        {value}
      </div>
      {subLabel && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4, fontFamily: "Arial, sans-serif" }}>
          {subLabel}
        </div>
      )}
    </div>
  );
}

// ── Trend section helpers ─────────────────────────────────────────────────────

function computePrintRankTrajectory(history, countyName) {
  if (!history || !countyName) return [];
  const countyHistory = history[countyName];
  if (!countyHistory || countyHistory.length === 0) return [];
  const pg = countyHistory[countyHistory.length - 1]?.pg;
  if (!pg) return [];
  return countyHistory.map(entry => {
    if (entry.fb_pct == null) return { year: entry.year, rank: null, peerCount: null, fb_pct: null };
    const peers = Object.values(history)
      .flatMap(arr => arr.filter(y => y.year === entry.year && y.pg === pg && y.fb_pct != null));
    if (peers.length === 0) return { year: entry.year, rank: 1, peerCount: 1, fb_pct: entry.fb_pct };
    const sorted = [...peers].sort((a, b) => b.fb_pct - a.fb_pct);
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].fb_pct < sorted[i - 1].fb_pct) rank = i + 1;
      if (Math.abs(sorted[i].fb_pct - entry.fb_pct) < 0.0001) break;
    }
    return { year: entry.year, rank, peerCount: peers.length, fb_pct: entry.fb_pct };
  }).filter(r => r.year >= 2022);
}

function TrendsSummary({ county, history }) {
  const trajectory = computePrintRankTrajectory(history, county.name);
  if (trajectory.length === 0) return null;

  const valid = trajectory.filter(r => r.rank !== null);
  if (valid.length < 2) return null;

  const start = valid[0];
  const end   = valid[valid.length - 1];
  const delta = end.rank - start.rank;
  const direction = delta < 0 ? "improved" : delta > 0 ? "declined" : "no change";
  const absDelta  = Math.abs(delta);

  const summary = delta === 0
    ? `FY${start.year} #${start.rank} → FY${end.year} #${end.rank} (no change)`
    : `FY${start.year} #${start.rank} → FY${end.year} #${end.rank} (${direction} ${absDelta} spot${absDelta !== 1 ? "s" : ""})`;

  const footnote = (start.year !== 2022 || end.year !== 2025)
    ? `* FY${start.year}–FY${end.year} shown (some years unavailable)`
    : null;

  const pg = history[county.name]?.at(-1)?.pg;
  const maxRank = Math.max(...valid.map(r => r.peerCount ?? 14));
  const chartData = trajectory.map(r => ({ year: r.year, rank: r.rank }));
  const axisStyle = { fill: "#555", fontSize: 9 };

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #ddd" }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: NC_BLUE,
        fontFamily: "Georgia, serif", marginBottom: 10,
        textTransform: "uppercase", letterSpacing: 0.5,
      }}>
        Multi-Year Trends (FY2022–FY2025)
      </div>
      <div style={{ fontSize: 11, color: "#444", marginBottom: 10 }}>
        <strong>Fund balance rank in peer group:</strong> {summary}
        {footnote && <span style={{ color: "#888" }}> {footnote}</span>}
        {pg && <span style={{ color: "#888" }}> · {pg} counties</span>}
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: -10 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="#e0e0e0" vertical={false} />
          <XAxis dataKey="year" tickFormatter={y => `FY${y}`} tick={axisStyle} axisLine={false} tickLine={false} />
          <YAxis
            reversed domain={[maxRank + 1, 1]}
            tick={axisStyle} axisLine={false} tickLine={false}
            tickFormatter={v => `#${v}`} allowDecimals={false} width={28}
          />
          <Line
            type="monotone" dataKey="rank"
            stroke={NC_BLUE} strokeWidth={2}
            dot={{ fill: NC_BLUE, r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main print report ─────────────────────────────────────────────────────────

const PrintReport = forwardRef(function PrintReport({ county, compare, DATA, history }, ref) {
  if (!county) return null;

  const hasCompare = compare != null;

  const revData = REV_CATS
    .filter(c => (county.pr?.[c] ?? 0) > 0 || (county.gr?.[c] ?? 0) > 0 || (compare?.pr?.[c] ?? 0) > 0)
    .map(c => ({
      name: c.length > 16 ? c.slice(0, 14) + "…" : c,
      County: county.pr?.[c] ?? 0,
      "Group Avg": county.gr?.[c] ?? 0,
      ...(hasCompare ? { [compare.name]: compare.pr?.[c] ?? 0 } : {}),
    }));

  const expData = EXP_CATS.map(c => ({
    name: c.length > 16 ? c.slice(0, 14) + "…" : c,
    County: county.pe?.[c] ?? 0,
    "Group Avg": county.ge?.[c] ?? 0,
    ...(hasCompare ? { [compare.name]: compare.pe?.[c] ?? 0 } : {}),
  }));

  const { fund_balance, revenue, tax_rate, revenue_outlier, spending_outlier } = generateNarrative(county);
  const compareNarrativeSentences = compare ? buildCompareNarrative(compare) : [];
  const hasNarrative = fund_balance || revenue || tax_rate || revenue_outlier || spending_outlier || compareNarrativeSentences.length > 0;

  const revPC     = county.pr?.["Total Revenue"];
  const expPC     = county.pe?.["Total Expenditures"];
  const surplusPC = revPC != null && expPC != null ? revPC - expPC : null;

  const titleText = hasCompare
    ? `${county.name} vs. ${compare.name} — County Financial Comparison`
    : `${county.name} County Financial Report`;

  const countySnapshotLabel = getSnapshotLabel(county);
  const compareSnapshotLabel = getSnapshotLabel(compare);

  return (
    <div
      ref={ref}
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        background: "#fff",
        color: "#111",
        padding: "36px 48px",
        maxWidth: 900,
        margin: "0 auto",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `4px solid ${NC_BLUE}`, paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: NC_BLUE, fontWeight: 600, marginBottom: 6, fontFamily: "Arial, sans-serif" }}>
          North Carolina · County Snapshot Report
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: hasCompare ? 22 : 26, fontWeight: 700, color: "#111", margin: "0 0 4px" }}>
          {titleText}
        </h1>
        <div style={{ fontSize: 11, color: "#666", fontFamily: "Arial, sans-serif" }}>
          {hasCompare
            ? <>
                <span style={{ color: NC_BLUE, fontWeight: 600 }}>{county.name}:</span> Pop. Group {county.pg ?? "—"} · {fmtPop(county.pop)}
                &nbsp;&nbsp;
                <span style={{ color: CMP_COLOR, fontWeight: 600 }}>{compare.name}:</span> Pop. Group {compare.pg ?? "—"} · {fmtPop(compare.pop)}
                &nbsp;|&nbsp; Generated: {fmtDate()}
              </>
            : <>Population Group: {county.pg ?? "—"} &nbsp;|&nbsp; Population: {fmtPop(county.pop)} &nbsp;|&nbsp; Generated: {fmtDate()}</>
          }
        </div>
        {(countySnapshotLabel || compareSnapshotLabel) && (
          <div style={{ fontSize: 11, color: "#666", fontFamily: "Arial, sans-serif", marginTop: 6 }}>
            {countySnapshotLabel && <div>{county.name}: {countySnapshotLabel}</div>}
            {compareSnapshotLabel && <div>{compare.name}: {compareSnapshotLabel}</div>}
          </div>
        )}
      </div>

      {/* ── Metrics: comparison table OR stat cards ─────────────────────────── */}
      {hasCompare
        ? <CompareTable county={county} compare={compare} />
        : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <PrintStatCard
              label="Revenue / Capita"
              value={revPC != null ? fmtPC(revPC) : "—"}
              subLabel={county.gr?.["Total Revenue"] != null ? `Group avg: ${fmtPC(county.gr["Total Revenue"])}` : undefined}
            />
            <PrintStatCard
              label="Expenditure / Capita"
              value={expPC != null ? fmtPC(expPC) : "—"}
              subLabel={county.ge?.["Total Expenditures"] != null ? `Group avg: ${fmtPC(county.ge["Total Expenditures"])}` : undefined}
            />
            <PrintStatCard
              label="Net Surplus / Capita"
              value={surplusPC != null ? (surplusPC >= 0 ? "+" : "") + fmtPC(surplusPC) : "—"}
            />
            <PrintStatCard
              label="Fund Balance"
              value={fmtPct(county.fb?.pct)}
              subLabel={county.fb?.grp_pct != null ? `Group avg: ${fmtPct(county.fb.grp_pct)}` : undefined}
            />
            <PrintStatCard
              label="Property Tax Rate"
              value={fmtTax(county.tax?.county_rate)}
              subLabel={county.tax?.effective_rate != null ? `Effective: ${fmtTax(county.tax.effective_rate)}` : undefined}
            />
          </div>
        )
      }

      {/* ── Fund balance gauge (print version) ─────────────────────────────── */}
      <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
        <PrintFundBalance county={county} compare={compare} />
      </div>

      {/* ── Narrative ──────────────────────────────────────────────────────── */}
      {hasNarrative && (
        <div style={{
          breakInside: "avoid",
          pageBreakInside: "avoid",
          background: "#f5f7fa",
          border: "1px solid #dde4ed",
          borderLeft: `4px solid ${NC_BLUE}`,
          borderRadius: 4,
          padding: "12px 16px",
          marginBottom: 28,
          fontSize: 13,
          color: "#222",
          lineHeight: 1.6,
        }}>
          {fund_balance && <p style={{ margin: "0 0 8px" }}>{fund_balance}</p>}
          {revenue && <p style={{ margin: "0 0 8px" }}>{revenue}</p>}
          {tax_rate && <p style={{ margin: "0 0 8px" }}>{tax_rate}</p>}
          {revenue_outlier && <p style={{ margin: "0 0 8px" }}>{revenue_outlier}</p>}
          {spending_outlier && <p style={{ margin: compareNarrativeSentences.length > 0 ? "0 0 8px" : "0" }}>{spending_outlier}</p>}
          {compareNarrativeSentences.map((s, i) => (
            <p key={i} style={{ margin: i < compareNarrativeSentences.length - 1 ? "0 0 8px" : "0" }}>{s}</p>
          ))}
        </div>
      )}

      {/* ── Revenue breakdown ───────────────────────────────────────────────── */}
      <div style={{ breakInside: "avoid", pageBreakInside: "avoid", marginBottom: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: NC_BLUE, borderBottom: "1px solid #dde4ed", paddingBottom: 6, marginBottom: 14, fontFamily: "Arial, sans-serif", textTransform: "uppercase", letterSpacing: 1 }}>
          Revenue per Capita vs. Group Average
        </h2>
        <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 8, fontFamily: "Arial, sans-serif", flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: NC_BLUE, marginRight: 4, verticalAlign: "middle" }} />{county.name}</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#aaa", marginRight: 4, verticalAlign: "middle" }} />Group Average</span>
          {hasCompare && <span><span style={{ display: "inline-block", width: 10, height: 10, background: CMP_COLOR, marginRight: 4, verticalAlign: "middle" }} />{compare.name}</span>}
        </div>
        <PrintBarChart data={revData} hasCompare={hasCompare} compareName={compare?.name} />
      </div>

      {/* ── Expenditure breakdown ────────────────────────────────────────────── */}
      <div style={{ breakInside: "avoid", pageBreakInside: "avoid", marginBottom: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: NC_BLUE, borderBottom: "1px solid #dde4ed", paddingBottom: 6, marginBottom: 14, fontFamily: "Arial, sans-serif", textTransform: "uppercase", letterSpacing: 1 }}>
          Expenditure per Capita vs. Group Average
        </h2>
        <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 8, fontFamily: "Arial, sans-serif", flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: NC_BLUE, marginRight: 4, verticalAlign: "middle" }} />{county.name}</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#aaa", marginRight: 4, verticalAlign: "middle" }} />Group Average</span>
          {hasCompare && <span><span style={{ display: "inline-block", width: 10, height: 10, background: CMP_COLOR, marginRight: 4, verticalAlign: "middle" }} />{compare.name}</span>}
        </div>
        <PrintBarChart data={expData} hasCompare={hasCompare} compareName={compare?.name} />
      </div>

      {history && <TrendsSummary county={county} history={history} />}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: "1px solid #ccc",
        paddingTop: 12,
        marginTop: 8,
        fontSize: 10,
        color: "#888",
        fontFamily: "Arial, sans-serif",
      }}>
        Data source: NC Annual Financial Information Report (AFIR) · NC Department of State Treasurer · Snapshot uses FY2025 where available with county-level fallback years ·{" "}
        <span style={{ fontFamily: "monospace" }}>xgx755.github.io/nc-county-financials</span>
      </div>
    </div>
  );
});

export default PrintReport;
