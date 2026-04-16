import { useState, useMemo, useEffect, useRef, lazy, Suspense, useCallback, Fragment } from "react";
import { useReactToPrint } from "react-to-print";
import DATA from "./data/counties.json";
import HISTORY from "./data/counties-history.json";
import StatCard from "./components/StatCard";
import FundBalanceGauge from "./components/FundBalanceGauge";
import PeerRankBar from "./components/PeerRankBar";
import AboutModal from "./components/AboutModal";
import PrintReport from "./components/PrintReport";
import { REV_CATS, EXP_CATS } from "./constants.js";
import { generateNarrative } from "./utils/narrative.js";

// ChartPanel, ChoroplethMap, TrendsPanel, and CategoryDeltaPanel are lazy-loaded (Recharts chunks)
const ChartPanel         = lazy(() => import("./components/ChartPanel"));
const ChoroplethMap      = lazy(() => import("./components/ChoroplethMap"));
const TrendsPanel        = lazy(() => import("./components/TrendsPanel"));
const CategoryDeltaPanel = lazy(() => import("./components/CategoryDeltaPanel"));

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY_FISCAL_YEAR = 2025;

const NAME_TO_IDX = Object.fromEntries(DATA.map((d, i) => [d.name, i]));

const TABLE_COLS = [
  { key: "name",    label: "County",               sort: (d) => d.name,                      numeric: false },
  { key: "pop",     label: "Population",           sort: (d) => d.pop ?? -1,                 numeric: true  },
  { key: "group",   label: "Group",                sort: (d) => d.pg ?? "",                  numeric: false },
  { key: "rev_pc",  label: "Revenue / Capita",     sort: (d) => d.pr["Total Revenue"] ?? -1,       numeric: true  },
  { key: "exp_pc",  label: "Expenditure / Capita", sort: (d) => d.pe["Total Expenditures"] ?? -1,  numeric: true  },
  { key: "grp_rev", label: "Group Avg Rev",        sort: (d) => d.gr["Total Revenue"] ?? -1,       numeric: true  },
  { key: "grp_exp", label: "Group Avg Exp",        sort: (d) => d.ge["Total Expenditures"] ?? -1,  numeric: true  },
  { key: "fb_pct",  label: "Fund Balance %",       sort: (d) => d.fb?.pct ?? -1,             numeric: true  },
  { key: "tax_rate", label: "Tax Rate",          sort: (d) => d.tax?.county_rate ?? -1,    numeric: true  },
];

// ─── Responsive hook ──────────────────────────────────────────────────────────

function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt    = (n) => {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};
const fmtPop   = (n) => n != null ? n.toLocaleString() : "—";
const fmtPC    = (n) => n != null ? `$${Math.round(n).toLocaleString()}` : "—";
const fmtFbPct    = (v) => v != null ? (v * 100).toFixed(1) + "%" : "—";
const fmtTaxRate      = (r) => r != null ? `$${r.toFixed(3)}` : "—";
const fmtTaxRateShort = (r) => r != null ? `$${r.toFixed(3)}` : "—";

function getDataYearLabel(county) {
  return county?.data_year != null ? `FY${county.data_year}` : "No AFIR data";
}

function getFallbackLabel(county) {
  if (!county?.is_fallback) return null;
  if (county.data_year != null) return `Using ${getDataYearLabel(county)} data`;
  return "No AFIR data available";
}

function hasFinancialSnapshot(county) {
  return county?.data_year != null && county?.pr?.["Total Revenue"] != null && county?.pe?.["Total Expenditures"] != null;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function escapeCSV(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCSV(rows) {
  const headers = [
    "Data Year", "Fallback",
    "County", "Population", "Population Group",
    "Revenue / Capita", "Expenditure / Capita", "Net Surplus/Deficit / Capita",
    "Group Avg Revenue / Capita", "Group Avg Expenditure / Capita",
    "Fund Balance %", "Group Avg FBA %", "Tax Rate ($/100)",
  ];
  const lines = [
    headers.join(","),
    ...rows.map(d => [
      escapeCSV(d.data_year ?? ""),
      escapeCSV(d.is_fallback ? (d.fallback_reason ?? "yes") : ""),
      escapeCSV(d.name),
      escapeCSV(d.pop),
      escapeCSV(d.pg),
      escapeCSV(d.pr["Total Revenue"] != null ? Math.round(d.pr["Total Revenue"]) : ""),
      escapeCSV(d.pe["Total Expenditures"] != null ? Math.round(d.pe["Total Expenditures"]) : ""),
      escapeCSV(d.pr["Total Revenue"] != null && d.pe["Total Expenditures"] != null ? Math.round(d.pr["Total Revenue"] - d.pe["Total Expenditures"]) : ""),
      escapeCSV(d.gr["Total Revenue"] != null ? Math.round(d.gr["Total Revenue"]) : ""),
      escapeCSV(d.ge["Total Expenditures"] != null ? Math.round(d.ge["Total Expenditures"]) : ""),
      escapeCSV(d.fb?.pct != null ? (d.fb.pct * 100).toFixed(1) : ""),
      escapeCSV(d.fb?.grp_pct != null ? (d.fb.grp_pct * 100).toFixed(1) : ""),
      escapeCSV(d.tax?.county_rate?.toFixed(3) ?? ""),
    ].join(","))
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = "nc-county-financials-snapshot.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Small internal components ────────────────────────────────────────────────

const SortIcon = ({ active, dir }) => (
  <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 9 }}>
    {active && dir === "asc" ? "▲" : "▼"}
  </span>
);

function DropdownItem({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: "none", border: "none", cursor: "pointer",
        padding: "9px 16px", color: "#c8d8e8", fontSize: 13,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#132744"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
    >
      <span style={{ marginRight: 10 }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {sub && (
        <div style={{ fontSize: 10, color: "#4a6d8c", marginTop: 2, paddingLeft: 22 }}>{sub}</div>
      )}
    </button>
  );
}

// Shared panel that places 1–2 PeerRankBar columns side by side
function PeerRankingsPanel({ columns, group, isMobile }) {
  const cols = columns.filter(Boolean);
  if (cols.length === 0) return null;
  return (
    <div style={{
      background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
      borderRadius: 12,
      padding: "16px 20px",
      border: "1px solid #1a3456",
      marginBottom: 24,
    }}>
      <div style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5,
        color: "#6b8aad", marginBottom: 14, fontWeight: 600,
      }}>
        Peer Rankings{group ? ` · ${group}` : ""}
      </div>
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 0,
      }}>
        {cols.map((col, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div style={isMobile
                ? { height: 1, background: "#1a3456", margin: "14px 0" }
                : { width: 1, background: "#1a3456", margin: "0 18px", flexShrink: 0 }
              } />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>{col}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const ChartSkeleton = ({ isMobile }) => (
  <div style={{
    height: isMobile ? 240 : 340,
    borderRadius: 12, border: "1px solid #1a3456",
    background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#4a6d8c", fontSize: 13, marginBottom: 32,
  }}>
    Loading…
  </div>
);

function SourceBadge({ county, tone = "primary" }) {
  const label = getFallbackLabel(county);
  if (!label) return null;
  const colors = tone === "compare"
    ? { border: "#7a4f00", bg: "#24170a", text: "#EE9B00" }
    : { border: "#3a7ca5", bg: "#0d1f3c", text: "#5FA8D3" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        padding: "5px 8px",
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function NoDataNotice({ county, compare }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
        borderRadius: 12,
        border: "1px solid #1a3456",
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b8aad", marginBottom: 10, fontWeight: 600 }}>
        Snapshot Availability
      </div>
      <div style={{ background: "#1a2a3a", borderLeft: "3px solid #EE9B00", padding: 16, borderRadius: 4 }}>
        <strong style={{ color: "#c8d8e8" }}>AFIR snapshot data is not available for {county.name} County.</strong>
        <p style={{ color: "#8aa4bc", margin: "8px 0 0", fontSize: 13 }}>
          This county does not have a usable AFIR record in the local FY2016–FY2025 snapshot files, so the data view cannot show revenue, expenditure, or fund balance metrics.
        </p>
        {county.tax && (
          <p style={{ color: "#8aa4bc", margin: "8px 0 0", fontSize: 13 }}>
            Current tax data is still available: {fmtTaxRate(county.tax.county_rate)} county rate and {fmtTaxRate(county.tax.effective_rate)} effective rate.
          </p>
        )}
        {compare && (
          <p style={{ color: "#8aa4bc", margin: "8px 0 0", fontSize: 13 }}>
            Remove the compare county or pick a county with AFIR data to restore side-by-side charts.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tab bar (3 tabs) ─────────────────────────────────────────────────────────

function TabBar({ activeTab, setActiveTab, isMobile }) {
  const tabs = [["data", "Data View"], ["map", "Map View"], ["list", "List View"], ["trends", "Trends"]];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          aria-pressed={activeTab === key}
          style={{
            padding: isMobile ? "8px 12px" : "9px 20px",
            borderRadius: 8,
            border: "1px solid " + (activeTab === key ? "#3a7ca5" : "#1a3456"),
            background: activeTab === key ? "#132744" : "transparent",
            color: activeTab === key ? "#5FA8D3" : "#4a6d8c",
            cursor: "pointer", fontSize: isMobile ? 11 : 12,
            fontWeight: 600, textTransform: "uppercase", letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NCCountyFinancials() {
  const windowWidth = useWindowWidth();
  const isMobile    = windowWidth < 768;
  const isTablet    = windowWidth >= 768 && windowWidth < 1024;

  const [selectedIdx, setSelectedIdx] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const n = p.get("county");
    return n && NAME_TO_IDX[n] != null ? NAME_TO_IDX[n] : 0;
  });
  const [compareIdx, setCompareIdx] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const county = p.get("county");
    const n = p.get("compare");
    return n && NAME_TO_IDX[n] != null && n !== county ? NAME_TO_IDX[n] : -1;
  });
  const [searchTerm,  setSearchTerm]  = useState("");
  const [sortKey,     setSortKey]     = useState("rev_pc");
  const [sortDir,     setSortDir]     = useState("desc");
  const [activeTab,   setActiveTab]   = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    return t && ["data", "map", "list", "trends"].includes(t) ? t : "data";
  });
  const [modalOpen,      setModalOpen]      = useState(false);
  const [shareCopied,    setShareCopied]    = useState(false);
  const [shareDropOpen,  setShareDropOpen]  = useState(false);

  const headerRef   = useRef(null);
  const infoRef     = useRef(null);
  const printRef    = useRef(null);
  const shareDropRef = useRef(null);

  const county  = DATA[selectedIdx];
  const compare = compareIdx >= 0 && compareIdx !== selectedIdx ? DATA[compareIdx] : null;

  // ── react-to-print ────────────────────────────────────────────────────────
  const handlePrint = useReactToPrint({ contentRef: printRef });

  // ── Close share dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!shareDropOpen) return;
    const handler = (e) => {
      if (shareDropRef.current && !shareDropRef.current.contains(e.target)) {
        setShareDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareDropOpen]);

  // ── URL param sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedIdx >= 0) params.set("county", DATA[selectedIdx].name);
    if (compareIdx >= 0 && compareIdx !== selectedIdx) params.set("compare", DATA[compareIdx].name);
    if (activeTab !== "data") params.set("tab", activeTab);
    history.replaceState(null, "", "?" + params.toString());
  }, [selectedIdx, compareIdx, activeTab]);

  // ── Share handlers ────────────────────────────────────────────────────────
  const handleCopyLink = () => {
    setShareDropOpen(false);
    if (navigator.share) {
      navigator.share({
        title: `NC County Financial Explorer — ${county.name}`,
        url: window.location.href,
      }).catch(err => console.error("Share failed:", err));
    } else {
      navigator.clipboard.writeText(window.location.href)
        .then(() => {
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2000);
        })
        .catch(() => prompt("Copy this link:", window.location.href));
    }
  };

  const handleDownloadCSV = () => {
    if (activeTab === "list") {
      downloadCSV(sortedData);
    } else {
      downloadCSV(compare ? [county, compare] : [county]);
    }
    setShareDropOpen(false);
  };

  const filtered = useMemo(() =>
    DATA.map((d, i) => ({ ...d, idx: i }))
        .filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [searchTerm]
  );

  const countyHasData = hasFinancialSnapshot(county);
  const compareHasData = compare ? hasFinancialSnapshot(compare) : false;

  const revPieData = useMemo(() =>
    REV_CATS.filter(c => county.r[c] > 0).map(c => ({ name: c, value: county.r[c] })),
    [county]
  );
  const expPieData = useMemo(() =>
    EXP_CATS.map(c => ({ name: c, value: county.e[c] })),
    [county]
  );
  const pcCompareRevData = useMemo(() =>
    REV_CATS.map(c => ({
      name: c.length > 14 ? c.slice(0, 12) + "…" : c,
      County: county.pr[c],
      "Group Avg": county.gr[c],
      ...(compare ? { [compare.name]: compare.pr[c] } : {}),
    })),
    [county, compare]
  );
  const pcCompareExpData = useMemo(() =>
    EXP_CATS.map(c => ({
      name: c.length > 14 ? c.slice(0, 12) + "…" : c,
      County: county.pe[c],
      "Group Avg": county.ge[c],
      ...(compare ? { [compare.name]: compare.pe[c] } : {}),
    })),
    [county, compare]
  );

  const compareOptions = useMemo(() =>
    DATA.map((d, i) => ({ name: d.name, i })).filter(({ i }) => i !== selectedIdx),
    [selectedIdx]
  );

  const sortedData = useMemo(() => {
    const col = TABLE_COLS.find(c => c.key === sortKey) ?? TABLE_COLS[3];
    return [...DATA].sort((a, b) => {
      const av = col.sort(a), bv = col.sort(b);
      if (!col.numeric) return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const selectCounty = (idx) => {
    setSelectedIdx(idx);
    setSearchTerm("");
    setTimeout(() => headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleMapCountyClick = useCallback((name) => {
    const idx = NAME_TO_IDX[name];
    if (idx != null) {
      setSelectedIdx(idx);
      setActiveTab("data");
      setTimeout(() => headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, []);

  const handleModalClose = () => {
    setModalOpen(false);
    setTimeout(() => infoRef.current?.focus(), 50);
  };

  const balance   = countyHasData ? county.r["Total Revenue"] - county.e["Total Expenditures"] : null;
  const isSurplus = balance != null ? balance >= 0 : null;
  const px        = isMobile ? "16px" : isTablet ? "24px" : "32px";

  // ── History sparklines ───────────────────────────────────────────────────────
  const countyHistory = HISTORY[county.name] ?? [];
  const last4         = countyHistory.slice(-4);
  const revTrend      = last4.length >= 2 ? last4.map(d => [d.year, d.rev_pc]) : null;
  const fbTrend       = last4.length >= 2 ? last4.map(d => [d.year, d.fb_pct * 100]) : null;

  // ── Fiscal independence (own-source revenue %) ───────────────────────────────
  const ownSourcePct = useMemo(() => {
    const props = county.r?.["Property Taxes"];
    const other  = county.r?.["Other Taxes"];
    const sales  = county.r?.["Sales Tax"];
    const total  = county.r?.["Total Revenue"];
    if (props == null || other == null || sales == null || !total) return null;
    return ((props + other + sales) / total * 100).toFixed(1);
  }, [selectedIdx]);

  const groupOwnSourcePct = useMemo(() => {
    const props = county.gr?.["Property Taxes"];
    const other  = county.gr?.["Other Taxes"];
    const sales  = county.gr?.["Sales Tax"];
    const total  = county.gr?.["Total Revenue"];
    if (props == null || other == null || sales == null || !total) return null;
    return ((props + other + sales) / total * 100).toFixed(1);
  }, [selectedIdx]);

  // ── Narrative (interactive panel) ────────────────────────────────────────────
  const [narrativeOpen, setNarrativeOpen] = useState(false);
  const narrative = useMemo(
    () => countyHasData ? generateNarrative(county) : null,
    [selectedIdx]
  );

  // In map view, hide the data-only controls
  const isMapView  = activeTab === "map";
  const isDataView = activeTab === "data";

  return (
    <div style={{ minHeight: "100vh", background: "#060e1a", color: "#c8d8e8", fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Header (contains title, tabs, actions) ── */}
      <div
        ref={headerRef}
        style={{
          background: "linear-gradient(180deg, #0a1628 0%, #060e1a 100%)",
          borderBottom: "1px solid #12253d",
          padding: isMobile ? `14px ${px} 0` : `28px ${px} 0`,
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: isMobile ? 14 : 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#3a7ca5", fontWeight: 600 }}>North Carolina</span>
                <span style={{ fontSize: 11, color: "#2a4a6b" }}>|</span>
                <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#2a4a6b" }}>FY2025 snapshot with county fallbacks</span>
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: isMobile ? 22 : 32, fontWeight: 900, color: "#e8f1f8", margin: 0, letterSpacing: -0.5 }}>
                County Financial Explorer
              </h1>
              {!isMobile && (
                <p style={{ fontSize: 13, color: "#4a6d8c", marginTop: 6, maxWidth: 600 }}>
                  {DATA.length} counties — FY2025 AFIR data where available, with earlier AFIR fallbacks for non-filers.
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, paddingTop: 4 }}>

              {/* Share & Export dropdown */}
              <div ref={shareDropRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setShareDropOpen(o => !o)}
                  style={{
                    background: "none", border: "1px solid #1a3456",
                    borderRadius: 8, color: "#4a6d8c", cursor: "pointer",
                    padding: "7px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 5,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#3a7ca5"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1a3456"}
                >
                  {isMobile ? "Share" : "Share & Export"}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
                </button>

                {/* "Copied!" toast — shown outside dropdown after copy */}
                {shareCopied && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    background: "#132744", border: "1px solid #2a3a4a",
                    borderRadius: 6, padding: "4px 10px", fontSize: 11,
                    color: "#62B6CB", whiteSpace: "nowrap", zIndex: 30,
                  }}>
                    Link copied!
                  </div>
                )}

                {/* Dropdown menu */}
                {shareDropOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", right: 0,
                    background: "#0d1f3c", border: "1px solid #1a3456",
                    borderRadius: 10, padding: "6px 0",
                    minWidth: 210, zIndex: 50,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}>
                    {/* Copy link */}
                    <DropdownItem
                      icon="🔗"
                      label="Copy link"
                      sub={window.location.href.length > 50 ? window.location.href.slice(0, 50) + "…" : window.location.href}
                      onClick={handleCopyLink}
                    />
                    {/* Print / Save as PDF */}
                    <DropdownItem
                      icon="🖨"
                      label="Print / Save as PDF"
                      sub="Choose 'Save as PDF' in the print dialog"
                      onClick={() => { setShareDropOpen(false); handlePrint(); }}
                    />
                    {/* Download CSV */}
                    <DropdownItem
                      icon="⬇"
                      label="Download CSV"
                      sub={activeTab === "list" ? `All ${DATA.length} counties` : `${county.name} — all metrics`}
                      onClick={handleDownloadCSV}
                    />
                  </div>
                )}
              </div>

              <button
                ref={infoRef}
                onClick={() => setModalOpen(true)}
                aria-label="About this data"
                style={{
                  background: "none", border: "1px solid #1a3456",
                  borderRadius: "50%", color: "#4a6d8c", cursor: "pointer",
                  width: 34, height: 34, fontSize: 16, display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#3a7ca5"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#1a3456"}
              >
                ⓘ
              </button>
            </div>
          </div>

          {/* Tab bar — flush with bottom of header */}
          <TabBar activeTab={activeTab} setActiveTab={setActiveTab} isMobile={isMobile} />
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: `20px ${px}` }}>

        {/* ── Selector row — hidden in map view ── */}
        {!isMapView && (
          <div style={{
            display: "flex", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 24 : 36,
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
            flexWrap: isMobile ? "nowrap" : "wrap",
          }}>
            <div style={{ flex: isMobile ? "none" : "1 1 240px" }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#4a6d8c", display: "block", marginBottom: 6 }}>
                Select County
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search counties…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onBlur={() => setTimeout(() => setSearchTerm(""), 150)}
                  aria-label="Search for a county"
                  aria-autocomplete="list"
                  aria-expanded={searchTerm.length > 0 && filtered.length > 0}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "10px 14px",
                    background: "#0d1f3c", border: "1px solid #1a3456",
                    borderRadius: 8, color: "#e0e8f0", fontSize: 14, outline: "none",
                  }}
                />
                {searchTerm && filtered.length > 0 && (
                  <div
                    role="listbox"
                    aria-label="County suggestions"
                    style={{
                      position: "absolute", top: "100%", left: 0, right: 0,
                      background: "#0d1f3c", border: "1px solid #1a3456",
                      borderTop: "none", borderRadius: "0 0 8px 8px",
                      maxHeight: 200, overflowY: "auto", zIndex: 10,
                    }}
                  >
                    {filtered.map(d => (
                      <div
                        key={d.idx}
                        role="option"
                        aria-selected={d.idx === selectedIdx}
                        onMouseDown={e => { e.preventDefault(); selectCounty(d.idx); }}
                        style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #0f2640", color: d.idx === selectedIdx ? "#5FA8D3" : "#c8d8e8" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#132744"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {d.name} <span style={{ color: "#4a6d8c", fontSize: 11 }}>({fmtPop(d.pop)})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Compare With — data view only */}
            {isDataView && (
              <div style={{ flex: isMobile ? "none" : "1 1 240px" }}>
                <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: "#4a6d8c", display: "block", marginBottom: 6 }}>
                  Compare With
                </label>
                <select
                  value={compareIdx}
                  onChange={e => setCompareIdx(Number(e.target.value))}
                  aria-label="Compare with another county"
                  style={{
                    width: "100%", padding: "10px 14px",
                    background: "#0d1f3c", border: "1px solid #1a3456",
                    borderRadius: 8, color: "#e0e8f0", fontSize: 14, outline: "none",
                  }}
                >
                  <option value={-1}>None</option>
                  {compareOptions.map(({ name, i }) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
            )}

          </div>
        )}

        {/* ══ DATA TAB ══════════════════════════════════════════════════════════ */}
        {activeTab === "data" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: isMobile ? 26 : 40, fontWeight: 900, color: "#e8f1f8", margin: 0 }}>
                  {county.name}
                  <span style={{ fontSize: isMobile ? 13 : 16, fontWeight: 400, color: "#4a6d8c", marginLeft: 8, fontFamily: "'DM Sans', sans-serif" }}>County</span>
                </h2>
                {compare && <span style={{ fontSize: 14, color: "#EE9B00", fontWeight: 600 }}>vs {compare.name}</span>}
                <SourceBadge county={county} />
                {compare && <SourceBadge county={compare} tone="compare" />}
              </div>
              {(county.pop != null || county.pg) && (
                <div style={{ fontSize: 13, color: "#4a6d8c", marginTop: 5 }}>
                  {[county.pop != null ? `Pop. ${fmtPop(county.pop)}` : null, county.pg].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            {countyHasData ? (
              <>
                {/* ── Hero row: Net Balance (fixed) + Fund Balance (fluid) ── */}
                <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 auto", width: isMobile ? "100%" : 240, display: "flex", flexDirection: "column" }}>
                    <StatCard
                      isMobile={isMobile}
                      label="Net Balance"
                      value={balance != null ? `${isSurplus ? "+" : "−"}${fmt(Math.abs(balance))}` : "—"}
                      sub={balance != null ? (isSurplus ? "Surplus" : "Deficit") : undefined}
                      accent={isSurplus == null ? undefined : isSurplus ? "#62B6CB" : "#AE2012"}
                    />
                  </div>
                  <div style={{ flex: "1 1 0", minWidth: isMobile ? "100%" : 320 }}>
                    <FundBalanceGauge county={county} compare={compare} />
                  </div>
                </div>

                {/* ── Secondary row: Revenue, Expenditures, Tax Rate, Own-Source ── */}
                <div style={{ display: "flex", gap: isMobile ? 10 : 12, marginBottom: 32, flexWrap: "wrap" }}>
                  <StatCard isMobile={isMobile} label="Total Revenue"      value={fmt(county.r["Total Revenue"])}      sub={`${fmtPC(county.pr["Total Revenue"])} / capita`} trend={revTrend} />
                  <StatCard isMobile={isMobile} label="Total Expenditures" value={fmt(county.e["Total Expenditures"])} sub={`${fmtPC(county.pe["Total Expenditures"])} / capita`} />
                  <StatCard
                    isMobile={isMobile}
                    label="Tax Rate (\$/100)"
                    value={fmtTaxRate(county.tax?.county_rate)}
                    sub={county.tax?.effective_rate != null
                      ? `eff. $${county.tax.effective_rate.toFixed(3)}`
                      : undefined}
                  />
                  <StatCard
                    isMobile={isMobile}
                    label="Own-Source Revenue"
                    value={ownSourcePct != null ? `${ownSourcePct}%` : "—"}
                    sub={groupOwnSourcePct != null ? `vs. ${groupOwnSourcePct}% group avg` : undefined}
                  />
                </div>

                {/* Narrative summary panel */}
                {narrative && (
                  <details
                    open={narrativeOpen}
                    onToggle={e => setNarrativeOpen(e.currentTarget.open)}
                    style={{
                      background: "#0a1929",
                      border: "1px solid #1a3456",
                      borderRadius: 6,
                      padding: "12px 16px",
                      marginBottom: 20,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14,
                      color: "#b0c4d8",
                      lineHeight: 1.6,
                    }}
                  >
                    <summary style={{
                      cursor: "pointer",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: 1.5,
                      color: "#4a6d8c",
                      fontWeight: 600,
                      userSelect: "none",
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}>
                      <span style={{ fontSize: 9 }}>{narrativeOpen ? "▼" : "▶"}</span>
                      Financial Summary
                    </summary>
                    <div style={{ marginTop: 10 }}>
                      {narrative.fund_balance && (
                        <p style={{ margin: "0 0 8px" }}>{narrative.fund_balance}</p>
                      )}
                      {narrative.revenue && (
                        <p style={{ margin: "0 0 8px" }}>{narrative.revenue}</p>
                      )}
                      {narrative.tax_rate && (
                        <p style={{ margin: "0 0 8px" }}>{narrative.tax_rate}</p>
                      )}
                      {narrative.revenue_outlier && (
                        <p style={{ margin: "0 0 8px" }}>{narrative.revenue_outlier}</p>
                      )}
                      {narrative.spending_outlier && (
                        <p style={{ margin: "0" }}>{narrative.spending_outlier}</p>
                      )}
                    </div>
                  </details>
                )}

                {/* ── Revenue section ── */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#5FA8D3", whiteSpace: "nowrap" }}>Revenue</span>
                  <div style={{ flex: 1, height: 1, background: "#1a3456" }} />
                </div>
                <Suspense fallback={<ChartSkeleton isMobile={isMobile} />}>
                  <ChartPanel
                    isMobile={isMobile}
                    title="Revenue Composition"
                    pieData={revPieData}
                    barData={pcCompareRevData}
                    cats={REV_CATS}
                    countyName={county.name}
                    compareCounty={compareHasData ? compare : null}
                    barColor="#5FA8D3"
                    compareColor="#EE9B00"
                  />
                  <CategoryDeltaPanel
                    county={county}
                    type="revenue"
                    isMobile={isMobile}
                    compareCounty={compareHasData ? compare : null}
                  />
                  <PeerRankingsPanel group={county.pg} isMobile={isMobile} columns={[
                    <PeerRankBar
                      DATA={DATA.filter(hasFinancialSnapshot)}
                      county={county}
                      compare={compareHasData ? compare : null}
                      metricKey="pr.Total Revenue"
                      standalone={false}
                    />,
                    county.tax != null ? (
                      <PeerRankBar
                        DATA={DATA}
                        county={county}
                        compare={compare}
                        metricKey="tax.effective_rate"
                        standalone={false}
                      />
                    ) : null,
                  ]} />
                </Suspense>

                {/* ── Expenditures section ── */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, marginTop: 32 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#EE9B00", whiteSpace: "nowrap" }}>Expenditures</span>
                  <div style={{ flex: 1, height: 1, background: "#1a3456" }} />
                </div>
                <Suspense fallback={<ChartSkeleton isMobile={isMobile} />}>
                  <ChartPanel
                    isMobile={isMobile}
                    title="Expenditure Allocation"
                    pieData={expPieData}
                    barData={pcCompareExpData}
                    cats={EXP_CATS}
                    countyName={county.name}
                    compareCounty={compareHasData ? compare : null}
                    barColor="#EE9B00"
                    compareColor="#5FA8D3"
                  />
                  <CategoryDeltaPanel
                    county={county}
                    type="spending"
                    isMobile={isMobile}
                    compareCounty={compareHasData ? compare : null}
                  />
                  <PeerRankingsPanel group={county.pg} isMobile={isMobile} columns={[
                    <PeerRankBar
                      DATA={DATA.filter(hasFinancialSnapshot)}
                      county={county}
                      compare={compareHasData ? compare : null}
                      metricKey="pe.Total Expenditures"
                      standalone={false}
                    />,
                    <PeerRankBar
                      DATA={DATA.filter(hasFinancialSnapshot)}
                      county={county}
                      compare={compareHasData ? compare : null}
                      metricKey="fb.pct"
                      standalone={false}
                    />,
                  ]} />
                </Suspense>
              </>
            ) : (
              <NoDataNotice county={county} compare={compare} />
            )}
          </>
        )}

        {/* ══ MAP TAB ═══════════════════════════════════════════════════════════ */}
        {activeTab === "map" && (
          <Suspense fallback={<ChartSkeleton isMobile={isMobile} />}>
            <ChoroplethMap
              data={DATA}
              selectedCounty={county.name}
              onCountyClick={handleMapCountyClick}
            />
          </Suspense>
        )}

        {/* ══ LIST TAB ══════════════════════════════════════════════════════════ */}
        {activeTab === "list" && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: isMobile ? 18 : 22, color: "#e8f1f8", margin: 0, fontWeight: 700 }}>
                All Counties
              </h3>
              <button
                onClick={() => downloadCSV(sortedData)}
                style={{
                  padding: "7px 14px", borderRadius: 8,
                  border: "1px solid #1a3456", background: "transparent",
                  color: "#4a6d8c", cursor: "pointer", fontSize: 12,
                  fontWeight: 600, letterSpacing: 0.5,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a7ca5"; e.currentTarget.style.color = "#5FA8D3"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a3456"; e.currentTarget.style.color = "#4a6d8c"; }}
              >
                ↓ CSV
              </button>
            </div>
            <div style={{ background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)", borderRadius: 12, border: "1px solid #1a3456", overflow: "hidden" }}>
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 12 : 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a3456" }}>
                      {TABLE_COLS.map(col => (
                        <th
                          key={col.key}
                          scope="col"
                          onClick={() => handleSort(col.key)}
                          style={{
                            padding: isMobile ? "10px 10px" : "12px 16px",
                            textAlign: "left", fontSize: 10,
                            textTransform: "uppercase", letterSpacing: 1,
                            color: sortKey === col.key ? "#5FA8D3" : "#4a6d8c",
                            fontWeight: 600, whiteSpace: "nowrap",
                            cursor: "pointer", userSelect: "none",
                          }}
                        >
                          {col.label}
                          <SortIcon active={sortKey === col.key} dir={sortDir} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map(d => {
                      const idx        = NAME_TO_IDX[d.name];
                      const isSelected = d.name === county.name;
                      const isCompare  = compare && d.name === compare.name;
                      return (
                        <tr
                          key={d.name}
                          onClick={() => { selectCounty(idx); setActiveTab("data"); }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Select ${d.name} County`}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectCounty(idx); setActiveTab("data"); } }}
                          style={{
                            borderBottom: "1px solid #0f2640",
                            background: isSelected ? "#132744" : isCompare ? "#1a2810" : "transparent",
                            cursor: "pointer", transition: "background 0.15s",
                          }}
                          onMouseEnter={e => { if (!isSelected && !isCompare) e.currentTarget.style.background = "#0f1e35"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "#132744" : isCompare ? "#1a2810" : "transparent"; }}
                        >
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", fontWeight: isSelected ? 700 : 400, color: isSelected ? "#5FA8D3" : isCompare ? "#EE9B00" : "#c8d8e8", whiteSpace: "nowrap" }}>{d.name}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: "#8aa4bc", whiteSpace: "nowrap" }}>{fmtPop(d.pop)}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: "#6b8aad", fontSize: 11, whiteSpace: "nowrap" }}>{d.pg}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", fontWeight: 600, color: "#e8f1f8", whiteSpace: "nowrap" }}>{fmtPC(d.pr["Total Revenue"])}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: "#c8d8e8", whiteSpace: "nowrap" }}>{fmtPC(d.pe["Total Expenditures"])}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: "#4a6d8c", whiteSpace: "nowrap" }}>{fmtPC(d.gr["Total Revenue"])}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: "#4a6d8c", whiteSpace: "nowrap" }}>{fmtPC(d.ge["Total Expenditures"])}</td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: d.fb?.pct != null ? (d.fb.pct < 0.08 ? "#AE2012" : d.fb.pct <= 0.25 ? "#EE9B00" : "#62B6CB") : "#2a4a6b", whiteSpace: "nowrap" }}>
                            {fmtFbPct(d.fb?.pct)}
                          </td>
                          <td style={{ padding: isMobile ? "8px 10px" : "10px 16px", color: "#c8d8e8", whiteSpace: "nowrap" }}>
                            {fmtTaxRateShort(d.tax?.county_rate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {isMobile && (
              <p style={{ fontSize: 11, color: "#2a4a6b", marginTop: 8, textAlign: "center" }}>
                ← Scroll horizontally to see all columns
              </p>
            )}
          </div>
        )}

        {/* ══ TRENDS TAB ════════════════════════════════════════════════════════ */}
        {activeTab === "trends" && (
          <Suspense fallback={<ChartSkeleton isMobile={isMobile} />}>
            <TrendsPanel county={county} history={HISTORY} isMobile={isMobile} />
          </Suspense>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "20px 0 32px", borderTop: "1px solid #12253d", fontSize: 11, color: "#2a4a6b", marginTop: 16 }}>
          Source: NC Department of State Treasurer — Annual Financial Information Reports (AFIR) · Snapshot uses FY2025 where available, then earlier AFIR fallback years by county.
        </div>

      </div>

      {/* About Modal */}
      {modalOpen && <AboutModal onClose={handleModalClose} />}

      {/* Hidden print report — must be in DOM for react-to-print; do NOT use display:none */}
      <div style={{ position: "absolute", left: "-9999px", visibility: "hidden" }}>
        <PrintReport ref={printRef} county={county} compare={compare} DATA={DATA} history={HISTORY} />
      </div>
    </div>
  );
}
