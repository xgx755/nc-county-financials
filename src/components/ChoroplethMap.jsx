// Feature 3 — Choropleth Map Tab
//
// Bug fixes applied here:
// 1. INITIAL COLOR BUG — svgVersion counter (not boolean) ensures Effect 2 re-runs
//    after *every* SVG injection. React StrictMode double-invokes Effect 1, which
//    re-injects a fresh SVG (wiping inline styles) but the old boolean was already
//    true so Effect 2 never re-ran. A counter always increments → always re-paints.
//
// 2. CLICK-ZOOM BUG — container gets aspect-ratio: 2/1 so its height never changes.
//    SVG uses height:100% instead of height:auto. Zoom is a smooth animated viewBox
//    shift (28% in, with a horizontal offset to leave room for the sidebar).
//    The sidebar is a full-height panel (left or right based on county position)
//    instead of a bottom overlay. Clicking background or same county zooms back out.

import { useState, useEffect, useRef, useMemo } from "react";

const METRIC_OPTIONS = [
  { key: "pr.Total Revenue",      label: "Revenue / capita" },
  { key: "pe.Total Expenditures", label: "Spending / capita" },
  { key: "net_surplus",           label: "Net Surplus"       },
  { key: "fb.pct",                label: "Fund Balance %"    },
  { key: "tax.effective_rate",    label: "Tax Rate"          },
];

const POP_GROUPS = [
  { key: "all",              label: "All counties"      },
  { key: "Below 25,000",     label: "Below 25,000"      },
  { key: "25,000 to 49,999", label: "25,000 – 49,999"   },
  { key: "50,000 to 99,999", label: "50,000 – 99,999"   },
  { key: "100,000 or Above", label: "100,000 or above"  },
];

function getMetricValue(county, metricKey) {
  if (metricKey === "pr.Total Revenue")      return county.pr?.["Total Revenue"]      ?? null;
  if (metricKey === "pe.Total Expenditures") return county.pe?.["Total Expenditures"] ?? null;
  if (metricKey === "net_surplus")           return (county.pr?.["Total Revenue"] ?? 0) - (county.pe?.["Total Expenditures"] ?? 0);
  if (metricKey === "fb.pct")               return county.fb?.pct ?? null;
  if (metricKey === "tax.effective_rate")   return county.tax?.effective_rate ?? null;
  return null;
}

function fmtTooltipValue(value, metricKey) {
  if (value == null) return null;
  if (metricKey === "fb.pct") return (value * 100).toFixed(1) + "% fund balance";
  if (metricKey === "net_surplus") {
    const abs = Math.abs(Math.round(value));
    return (value >= 0 ? "+" : "−") + "$" + abs.toLocaleString() + " / capita";
  }
  if (metricKey === "tax.effective_rate") return "$" + value.toFixed(3) + " eff.";
  return "$" + Math.round(value).toLocaleString() + " / capita";
}

function fmtPC(n)    { return n != null ? "$" + Math.round(n).toLocaleString() : "—"; }
function fmtPop(n)   { return n != null ? n.toLocaleString() : "—"; }
function fmtFbPct(v) { return v != null ? (v * 100).toFixed(1) + "%" : "—"; }

const COLOR_STEPS   = ["#cce8f4", "#93cce0", "#5FA8D3", "#2d7aad", "#0d4a7a"];
const COLOR_MISSING = "#1a2a3a";
const COLOR_DIMMED  = "#0f1c2d";

function interpolateColor(t) {
  const n = COLOR_STEPS.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  const f = t * n - i;
  const c1 = COLOR_STEPS[i], c2 = COLOR_STEPS[i + 1];
  const ch = (c, h) => parseInt(h.slice(c, c + 2), 16);
  const mix = (a, b) => Math.round(a + (b - a) * f);
  return `rgb(${mix(ch(1,c1),ch(1,c2))},${mix(ch(3,c1),ch(3,c2))},${mix(ch(5,c1),ch(5,c2))})`;
}

const selectStyle = {
  background: "#0a1628",
  border: "1px solid #1a3456",
  borderRadius: 8,
  color: "#c8d8e8",
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 28px 7px 12px",
  cursor: "pointer",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234a6d8c'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  minWidth: 160,
};

// Smooth eased viewBox animation — interpolates from current viewBox to target.
// Pure DOM, zero React state, so it never triggers a re-render.
function animateViewBox(svg, targetVBStr, duration = 300) {
  const current = (svg.getAttribute("viewBox") ?? "0 0 960 480").split(" ").map(Number);
  const target  = targetVBStr.split(" ").map(Number);
  const t0      = performance.now();
  function ease(t) { return t < 0.5 ? 2*t*t : -1 + (4-2*t)*t; } // easeInOutQuad
  function tick(now) {
    const p = Math.min((now - t0) / duration, 1);
    const e = ease(p);
    svg.setAttribute("viewBox", current.map((v, i) => v + (target[i]-v)*e).join(" "));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export default function ChoroplethMap({ data, selectedCounty, onCountyClick }) {
  // BUG 1 FIX: counter not boolean.
  // StrictMode invokes Effect 1 twice: the second run re-injects a fresh SVG
  // (clearing all inline fills) but setSvgLoaded(true) was idempotent → Effect 2
  // never re-ran → map stayed uncolored. With a counter every injection is unique.
  const [svgVersion,   setSvgVersion]   = useState(0);
  const [mapMetric,    setMapMetric]    = useState("pr.Total Revenue");
  const [compareGroup, setCompareGroup] = useState("all");
  const [panelCounty,  setPanelCounty]  = useState(null);
  const [panelSide,    setPanelSide]    = useState("right"); // which edge the sidebar sits on

  const containerRef   = useRef(null);
  const outerRef       = useRef(null);
  const tooltipRef     = useRef(null);
  const svgRef         = useRef(null);
  const origViewBoxRef = useRef(null);

  const dataByName = useMemo(() =>
    Object.fromEntries(data.map(d => [d.name, d])), [data]);

  const { domain, nameToColor } = useMemo(() => {
    const groupData = compareGroup === "all"
      ? data
      : data.filter(d => d.pg === compareGroup);
    const vals = groupData
      .map(d => ({ name: d.name, v: getMetricValue(d, mapMetric) }))
      .filter(x => x.v != null);
    if (!vals.length) return { domain: [0, 1], nameToColor: {} };
    const min   = Math.min(...vals.map(x => x.v));
    const max   = Math.max(...vals.map(x => x.v));
    const range = max - min || 1;
    const nameToColor = {};
    for (const { name, v } of vals) nameToColor[name] = interpolateColor((v - min) / range);
    return { domain: [min, max], nameToColor };
  }, [data, mapMetric, compareGroup]);

  // ── Effect 1: Fetch SVG, inject into DOM ────────────────────────────────
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "nc-counties.svg")
      .then(r => r.text())
      .then(markup => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = markup;
        const svg = containerRef.current.querySelector("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          // height:100% (not auto) — keeps SVG filling the fixed-ratio container
          // so viewBox zooms never change the container's rendered dimensions.
          svg.style.cssText = "width:100%;height:100%;display:block;";
          origViewBoxRef.current = svg.getAttribute("viewBox") ?? "0 0 960 480";
          svgRef.current = svg;
        }
        setSvgVersion(v => v + 1); // always increment → always triggers Effect 2
      })
      .catch(console.error);
  }, []);

  // ── Effect 2: Paint colors + wire event delegation ───────────────────────
  useEffect(() => {
    if (svgVersion === 0 || !containerRef.current) return;
    const svg = containerRef.current.querySelector("svg");
    if (!svg) return;

    // ── Color all paths ──────────────────────────────────────────────────
    svg.querySelectorAll("path").forEach(path => {
      const countyName  = (path.getAttribute("id") || "").replace(/_/g, " ");
      const county      = dataByName[countyName];
      const isPanel     = panelCounty?.name === countyName;
      const isSelected  = selectedCounty === countyName;
      const inGroup     = compareGroup === "all" || county?.pg === compareGroup;

      if (!county) {
        path.style.fill        = COLOR_MISSING;
        path.style.stroke      = "#0a1628";
        path.style.strokeWidth = "0.5";
        path.style.opacity     = "1";
        path.style.cursor      = "default";
        return;
      }
      if (!inGroup) {
        path.style.fill        = COLOR_DIMMED;
        path.style.stroke      = "#0a1628";
        path.style.strokeWidth = "0.5";
        path.style.opacity     = "0.55";
        path.style.cursor      = "default";
        return;
      }
      path.style.opacity     = "1";
      path.style.fill        = mapMetric === "fb.pct" && county.fb?.pct == null
        ? COLOR_MISSING
        : (nameToColor[countyName] || COLOR_MISSING);
      path.style.stroke      = isPanel ? "#ffffff" : isSelected ? "#93cce0" : "#0a1628";
      path.style.strokeWidth = isPanel ? "2.5"     : isSelected ? "1.5"     : "0.5";
      path.style.cursor      = "pointer";
    });

    const ac = new AbortController();
    const { signal } = ac;

    // ── Tooltip ──────────────────────────────────────────────────────────
    svg.addEventListener("mouseover", (e) => {
      const path = e.target.closest("path");
      if (!path) return;
      const countyName = (path.getAttribute("id") || "").replace(/_/g, " ");
      const county     = dataByName[countyName];
      const inGroup    = compareGroup === "all" || county?.pg === compareGroup;
      if (!inGroup) return;
      path.style.opacity = "0.72";
      const val = county ? getMetricValue(county, mapMetric) : null;
      const tt  = tooltipRef.current;
      if (!tt) return;
      const extraLine = mapMetric === "tax.effective_rate" && county?.tax
        ? `<br/><span style="color:#6b8aad;font-size:11px">nominal: $${county.tax.county_rate.toFixed(3)}</span>`
        : "";
      tt.innerHTML = county
        ? `<strong style="color:#e8f1f8">${countyName}</strong>`
          + `<span style="color:#8aa4bc"> — ${fmtTooltipValue(val, mapMetric) ?? "N/A"}</span>`
          + extraLine
        : `<strong style="color:#e8f1f8">${countyName}</strong>`
          + `<span style="color:#4a6d8c"> — Not in AFIR dataset</span>`;
      tt.style.display = "block";
    }, { signal });

    svg.addEventListener("mousemove", (e) => {
      const tt    = tooltipRef.current;
      const outer = outerRef.current;
      if (!tt || !outer) return;
      const rect = outer.getBoundingClientRect();
      let x = e.clientX - rect.left + 14;
      let y = e.clientY - rect.top  - 10;
      if (x + 220 > rect.width) x = e.clientX - rect.left - 220;
      if (y < 4)                y = e.clientY - rect.top  + 22;
      tt.style.left = x + "px";
      tt.style.top  = y + "px";
    }, { signal });

    svg.addEventListener("mouseout", (e) => {
      const path = e.target.closest("path");
      if (path) {
        const countyName = (path.getAttribute("id") || "").replace(/_/g, " ");
        const county     = dataByName[countyName];
        const inGroup    = compareGroup === "all" || county?.pg === compareGroup;
        path.style.opacity = inGroup ? "1" : "0.55";
      }
      const tt = tooltipRef.current;
      if (tt) tt.style.display = "none";
    }, { signal });

    // ── Click: zoom + sidebar ────────────────────────────────────────────
    svg.addEventListener("click", (e) => {
      // Clicking the sidebar overlay stops propagation to SVG, so this only
      // fires for genuine map-area clicks.
      const path = e.target.closest("path");

      // Background click (or uncolored county) → zoom out
      if (!path) {
        if (panelCounty && origViewBoxRef.current && svgRef.current) {
          animateViewBox(svgRef.current, origViewBoxRef.current);
          setPanelCounty(null);
        }
        return;
      }

      const countyName = (path.getAttribute("id") || "").replace(/_/g, " ");
      const county     = dataByName[countyName];
      const inGroup    = compareGroup === "all" || county?.pg === compareGroup;

      if (!county || !inGroup) {
        if (panelCounty && origViewBoxRef.current && svgRef.current) {
          animateViewBox(svgRef.current, origViewBoxRef.current);
          setPanelCounty(null);
        }
        return;
      }

      // Same county clicked again → toggle (zoom out)
      if (panelCounty?.name === countyName) {
        animateViewBox(svgRef.current, origViewBoxRef.current);
        setPanelCounty(null);
        return;
      }

      // New county → subtle zoom + position sidebar ────────────────────
      if (!origViewBoxRef.current || !svgRef.current) return;
      const [ox, oy, ow, oh] = origViewBoxRef.current.split(" ").map(Number);
      const bbox = path.getBBox();
      const cx   = bbox.x + bbox.width  / 2;
      const cy   = bbox.y + bbox.height / 2;

      // 25% zoom-in — very subtle (75% of map still visible)
      const zW = ow * 0.75;
      const zH = oh * 0.75;

      // County in the right half of the map → sidebar on the LEFT side
      // County in the left  half             → sidebar on the RIGHT side
      const isRightCounty = cx > ow / 2;
      const side = isRightCounty ? "left" : "right";

      // Offset the viewBox horizontally so the county sits clear of the sidebar.
      // P_x = where (as a fraction of zW) the county centre should land.
      const P_x  = isRightCounty ? 0.62 : 0.38;
      const rawX = cx - zW * P_x;
      const rawY = cy - zH * 0.5;

      // Soft-clamp: small overshoot allowed to avoid awkward dead-space at edges
      const vbX = Math.max(ox - 40, Math.min(ox + ow - zW + 40, rawX));
      const vbY = Math.max(oy - 20, Math.min(oy + oh - zH + 20, rawY));

      animateViewBox(svgRef.current, `${vbX} ${vbY} ${zW} ${zH}`);
      setPanelCounty(county);
      setPanelSide(side);
    }, { signal });

    return () => ac.abort();
  }, [svgVersion, nameToColor, panelCounty, selectedCounty, mapMetric, compareGroup, dataByName]);

  // Legend formatter
  const fmtLegend = (v) => {
    if (v == null) return "";
    if (mapMetric === "fb.pct")             return (v * 100).toFixed(1) + "%";
    if (mapMetric === "net_surplus")        return (v >= 0 ? "+" : "") + "$" + Math.round(v).toLocaleString();
    if (mapMetric === "tax.effective_rate") return "$" + v.toFixed(3);
    return "$" + Math.round(v).toLocaleString();
  };

  // Shared close/zoom-out action
  const closePanel = () => {
    if (svgRef.current && origViewBoxRef.current)
      animateViewBox(svgRef.current, origViewBoxRef.current, 300);
    setPanelCounty(null);
  };

  return (
    <div>
      {/* ── Controls row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#4a6d8c", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, whiteSpace: "nowrap" }}>
            Color by
          </span>
          <div style={{ position: "relative" }}>
            <select value={mapMetric} onChange={e => setMapMetric(e.target.value)} style={selectStyle}>
              {METRIC_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: "#1a3456" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#4a6d8c", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, whiteSpace: "nowrap" }}>
            Compare group
          </span>
          <div style={{ position: "relative" }}>
            <select
              value={compareGroup}
              onChange={e => {
                if (svgRef.current && origViewBoxRef.current)
                  animateViewBox(svgRef.current, origViewBoxRef.current, 250);
                setCompareGroup(e.target.value);
                setPanelCounty(null);
              }}
              style={selectStyle}
            >
              {POP_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Map container ────────────────────────────────────────────────────
           aspect-ratio: 2/1 locks the container to landscape — viewBox changes
           only re-frame the SVG, they no longer resize the container.           ── */}
      <div
        ref={outerRef}
        style={{
          position: "relative",
          background: "#060e1a",
          borderRadius: 12,
          border: "1px solid #1a3456",
          overflow: "hidden",
          aspectRatio: "2 / 1",
        }}
      >
        {svgVersion === 0 && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#4a6d8c", fontSize: 13,
          }}>
            Loading map…
          </div>
        )}

        {/* SVG injected here by Effect 1 */}
        <div ref={containerRef} style={{ position: "absolute", inset: 0, lineHeight: 0 }} />

        {/* Tooltip */}
        <div
          ref={tooltipRef}
          style={{
            display: "none", position: "absolute",
            background: "#0d1e2e", border: "1px solid #2a3a4a",
            borderRadius: 6, padding: "6px 10px",
            fontSize: 12, color: "#c8d8e8",
            pointerEvents: "none", whiteSpace: "nowrap", zIndex: 10,
          }}
        />

        {/* ── Sidebar panel ─────────────────────────────────────────────────
             Full-height panel that slides in from the left or right edge.
             The SVG viewBox is already offset to keep the county clear of it.    ── */}
        {panelCounty && (() => {
          const d = dataByName[panelCounty.name];
          if (!d) return null;
          const fbPct   = d.fb?.pct;
          const fbColor = fbPct == null ? "#4a6d8c" : fbPct < 0.08 ? "#AE2012" : fbPct <= 0.25 ? "#EE9B00" : "#62B6CB";
          const rows = [
            { label: "Population",   value: fmtPop(d.pop),                                  color: "#e8f1f8" },
            { label: "Revenue",      value: fmtPC(d.pr["Total Revenue"]) + " / pp",          color: "#e8f1f8" },
            { label: "Expenditures", value: fmtPC(d.pe["Total Expenditures"]) + " / pp",     color: "#e8f1f8" },
            { label: "Tax Rate",     value: d.tax ? `$${d.tax.county_rate.toFixed(3)}` : "—", color: "#e8f1f8" },
            { label: "Fund Balance", value: fmtFbPct(fbPct),                                 color: fbColor   },
          ];
          const isRight = panelSide === "right";
          return (
            <div
              className={`map-sidebar-${panelSide}`}
              onClick={e => e.stopPropagation()} // prevent SVG click-through
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                [panelSide]: 0,
                width: 230,
                zIndex: 20,
                background: isRight
                  ? "linear-gradient(to left,  rgba(6,14,26,0.97) 82%, rgba(6,14,26,0.55))"
                  : "linear-gradient(to right, rgba(6,14,26,0.97) 82%, rgba(6,14,26,0.55))",
                backdropFilter: "blur(6px)",
                borderLeft:  isRight ? "1px solid rgba(42,74,106,0.55)" : "none",
                borderRight: isRight ? "none" : "1px solid rgba(42,74,106,0.55)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "20px 16px",
                boxSizing: "border-box",
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#e8f1f8", fontFamily: "'Playfair Display', serif", lineHeight: 1.2 }}>
                    {d.name}
                  </div>
                  <div style={{ fontSize: 10, color: "#4a6d8c", marginTop: 3 }}>{d.pg ?? "No AFIR snapshot"}</div>
                </div>
                <button
                  onClick={closePanel}
                  title="Close"
                  style={{
                    background: "none", border: "1px solid #1a3456",
                    borderRadius: 5, color: "#4a6d8c", cursor: "pointer",
                    padding: "3px 7px", fontSize: 11, lineHeight: 1, flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a7ca5"; e.currentTarget.style.color = "#c8d8e8"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#1a3456"; e.currentTarget.style.color = "#4a6d8c"; }}
                >
                  ✕
                </button>
              </div>

              {/* Stat rows */}
              <div style={{ borderTop: "1px solid #1a3456", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.map(({ label, value, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#4a6d8c" }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, textAlign: "right" }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Full data button */}
              <button
                onClick={() => {
                  closePanel();
                  setTimeout(() => onCountyClick(d.name), 320);
                }}
                style={{
                  marginTop: 16,
                  background: "none", border: "1px solid #2a4a6a",
                  borderRadius: 6, color: "#5FA8D3", cursor: "pointer",
                  padding: "7px 10px", fontSize: 11, fontWeight: 600,
                  whiteSpace: "nowrap", width: "100%",
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#5FA8D3"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#2a4a6a"}
              >
                View full data →
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, marginBottom: 8, flexWrap: "wrap" }}>
        {compareGroup !== "all" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: COLOR_DIMMED, border: "1px solid #1a2a3a", opacity: 0.55 }} />
            <span style={{ fontSize: 10, color: "#4a6d8c" }}>Outside group</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 120, height: 12, borderRadius: 4,
            background: `linear-gradient(to right, ${COLOR_STEPS[0]}, ${COLOR_STEPS[COLOR_STEPS.length - 1]})`,
          }} />
          <span style={{ fontSize: 10, color: "#8aa4bc" }}>
            {fmtLegend(domain[0])} — {fmtLegend(domain[1])}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: COLOR_MISSING, border: "1px solid #2a3a4a" }} />
          <span style={{ fontSize: 10, color: "#8aa4bc" }}>Not in AFIR dataset</span>
        </div>
        {mapMetric === "fb.pct" && (
          <span style={{ fontSize: 10, color: "#8aa4bc", fontStyle: "italic" }}>
            † Fund balance unavailable for Bladen &amp; Greene counties
          </span>
        )}
        {mapMetric === "tax.effective_rate" && (
          <span style={{ fontSize: 10, color: "#8aa4bc", fontStyle: "italic" }}>
            † Effective rates adjust for reappraisal cycle differences · Source: NC Dept. of Revenue 2025–26
          </span>
        )}
      </div>
    </div>
  );
}
