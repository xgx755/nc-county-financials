import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";

// ─── Rank calculation ─────────────────────────────────────────────────────────

function computeRankTrajectory(history, countyName) {
  if (!history || !countyName) return [];
  const countyHistory = history[countyName];
  if (!countyHistory || countyHistory.length === 0) return [];

  const pg = countyHistory[countyHistory.length - 1]?.pg;
  if (!pg) return [];

  return countyHistory.map(entry => {
    if (entry.fb_pct == null) {
      return { year: entry.year, rank: null, peerCount: null, fb_pct: null };
    }

    const peers = Object.values(history)
      .flatMap(arr => arr.filter(y => y.year === entry.year && y.pg === pg && y.fb_pct != null));

    if (peers.length === 0) {
      return { year: entry.year, rank: 1, peerCount: 1, fb_pct: entry.fb_pct };
    }

    const sorted = [...peers].sort((a, b) => b.fb_pct - a.fb_pct);
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].fb_pct < sorted[i - 1].fb_pct) rank = i + 1;
      if (Math.abs(sorted[i].fb_pct - entry.fb_pct) < 0.0001) break;
    }

    return { year: entry.year, rank, peerCount: peers.length, fb_pct: entry.fb_pct };
  });
}

function computePeerAvgFbPct(history, pg, years) {
  if (!history || !pg) return [];
  return years.map(year => {
    const peers = Object.values(history)
      .flatMap(arr => arr.filter(y => y.year === year && y.pg === pg && y.fb_pct != null));
    if (peers.length === 0) return { year, avg: null };
    return { year, avg: peers.reduce((s, p) => s + p.fb_pct, 0) / peers.length };
  });
}

function computePeerAvgMetric(history, pg, years, metricKey) {
  if (!history || !pg) return [];
  return years.map(year => {
    const peers = Object.values(history)
      .flatMap(arr => arr.filter(y => y.year === year && y.pg === pg && y[metricKey] != null));
    if (peers.length === 0) return { year, avg: null };
    return { year, avg: peers.reduce((s, p) => s + p[metricKey], 0) / peers.length };
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtFbPct = v => v != null ? (v * 100).toFixed(1) + "%" : "—";
const fmtYear  = y => `FY${y}`;

// ─── Shared UI pieces ─────────────────────────────────────────────────────────

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 17, fontWeight: 700, color: "#E8EFF8", margin: 0, letterSpacing: "-0.2px",
      }}>
        {title}
      </h3>
      {sub && <div style={{ fontSize: 12, color: "#4A6480", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ children }) {
  return (
    <div
      className="card-hover"
      style={{
        background: "#152030",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.25)",
        padding: "20px 20px 14px",
        marginBottom: 28,
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{
      height: 160, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#4A6480", fontSize: 13,
    }}>
      {message}
    </div>
  );
}

const AXIS_STYLE = { fill: "#7A9AB8", fontSize: 11 };

// ─── Custom tooltips ──────────────────────────────────────────────────────────

function RankTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.rank == null) return null;
  return (
    <div style={{
      background: "#1A2840", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 6, padding: "8px 12px", fontSize: 12,
      boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "#60A5FA", fontWeight: 700 }}>FY{d.year}</div>
      <div style={{ color: "#E8EFF8" }}>Rank #{d.rank} of {d.peerCount}</div>
      {d.fb_pct != null && (
        <div style={{ color: "#7A9AB8", fontSize: 11 }}>Fund Balance: {fmtFbPct(d.fb_pct)}</div>
      )}
    </div>
  );
}

function MetricTooltip({ active, payload, label, isPercent, isCurrency }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1A2840", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 6, padding: "8px 12px", fontSize: 12,
      boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "#60A5FA", fontWeight: 700 }}>FY{label}</div>
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {isPercent
            ? `${p.value.toFixed(1)}%`
            : isCurrency
              ? `$${Math.round(p.value).toLocaleString()}`
              : p.value}
        </div>
      ))}
    </div>
  );
}

// ─── Range options ────────────────────────────────────────────────────────────

const RANGES = [
  { label: "4-Year (FY2022–2025)", value: [2022, 2025] },
  { label: "10-Year (FY2016–2025)", value: [2016, 2025] },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrendsPanel({ county, history, isMobile }) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [startYear, endYear] = RANGES[rangeIdx].value;

  const countyHistory = useMemo(() => history?.[county.name] ?? [], [history, county.name]);
  const pg = countyHistory[countyHistory.length - 1]?.pg ?? null;

  const filteredHistory = useMemo(
    () => countyHistory.filter(e => e.year >= startYear && e.year <= endYear),
    [countyHistory, startYear, endYear]
  );

  const years = filteredHistory.map(e => e.year);

  const fullRankTrajectory = useMemo(
    () => computeRankTrajectory(history, county.name),
    [history, county.name]
  );

  const rankTrajectory = useMemo(
    () => fullRankTrajectory.filter(r => r.year >= startYear && r.year <= endYear),
    [fullRankTrajectory, startYear, endYear]
  );

  const peerAvgFb  = useMemo(() => computePeerAvgFbPct(history, pg, years), [history, pg, years]);
  const peerAvgRev = useMemo(() => computePeerAvgMetric(history, pg, years, "rev_pc"), [history, pg, years]);
  const peerAvgExp = useMemo(() => computePeerAvgMetric(history, pg, years, "exp_pc"), [history, pg, years]);

  if (countyHistory.length === 0) {
    const countiesWithData = history ? Object.keys(history).filter(k => history[k]?.length > 0).length : 0;
    return (
      <div style={{ padding: "40px 24px", textAlign: "center", color: "#4A6480" }}>
        <div style={{ fontSize: 15, color: "#7A9AB8", marginBottom: 8 }}>
          No multi-year history for {county.name}.
        </div>
        <div style={{ fontSize: 13 }}>
          {countiesWithData > 0
            ? `Trend data is available for ${countiesWithData} counties — try searching above.`
            : "Trend data is loaded from multi-year AFIR filings and may not be available for all counties."}
        </div>
      </div>
    );
  }

  if (filteredHistory.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "#4A6480" }}>
        No data for {county.name} in this range.
      </div>
    );
  }

  const validRanks  = rankTrajectory.filter(r => r.rank !== null);
  const maxRankSeen = validRanks.length > 0 ? Math.max(...validRanks.map(r => r.peerCount)) : 14;
  const currentEntry = validRanks.at(-1);
  const peerCount    = currentEntry?.peerCount ?? null;
  const currentRank  = currentEntry?.rank ?? null;
  const topQuartile  = peerCount ? Math.ceil(peerCount / 4) : null;

  const rankChartData = rankTrajectory.map(r => ({
    year: r.year, rank: r.rank, peerCount: r.peerCount, fb_pct: r.fb_pct,
  }));

  const fbChartData = filteredHistory.map((e, i) => ({
    year: e.year,
    [county.name]: e.fb_pct != null ? parseFloat((e.fb_pct * 100).toFixed(2)) : null,
    "Peer group avg": peerAvgFb[i]?.avg != null
      ? parseFloat((peerAvgFb[i].avg * 100).toFixed(2)) : null,
  }));

  const revChartData = filteredHistory.map((e, i) => ({
    year: e.year,
    [county.name]: e.rev_pc != null ? Math.round(e.rev_pc) : null,
    "Peer group avg": peerAvgRev[i]?.avg != null ? Math.round(peerAvgRev[i].avg) : null,
  }));

  const expChartData = filteredHistory.map((e, i) => ({
    year: e.year,
    [county.name]: e.exp_pc != null ? Math.round(e.exp_pc) : null,
    "Peer group avg": peerAvgExp[i]?.avg != null ? Math.round(peerAvgExp[i].avg) : null,
  }));

  const chartHeight = isMobile ? 190 : 230;

  return (
    <div>
      {/* Year range toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {RANGES.map((r, i) => (
          <button
            key={i}
            onClick={() => setRangeIdx(i)}
            style={{
              padding: "7px 14px", borderRadius: 8, fontSize: 12,
              fontWeight: 600, cursor: "pointer", letterSpacing: 0.3,
              border: "1px solid " + (rangeIdx === i ? "#60A5FA" : "rgba(255,255,255,0.12)"),
              background: rangeIdx === i ? "rgba(96,165,250,0.1)" : "transparent",
              color: rangeIdx === i ? "#60A5FA" : "#7A9AB8",
              transition: "all 0.15s ease",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* ── 1. Fund Balance Rank Trajectory ─────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          title="Fund Balance Rank in Peer Group"
          sub={
            currentRank != null && peerCount != null
              ? `${county.name} — #${currentRank} of ${peerCount} in ${pg} counties · rank 1 = strongest`
              : `${county.name} — fund balance rank unavailable for most recent year`
          }
        />
        {validRanks.length === 0 ? (
          <EmptyState message="No fund balance rank data available for this range." />
        ) : (
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
            <LineChart data={rankChartData} margin={{ top: 8, right: 16, bottom: 4, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="year" tickFormatter={fmtYear}
                tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false}
              />
              <YAxis
                reversed
                domain={[maxRankSeen + 1, 1]}
                tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false}
                tickFormatter={v => `#${v}`}
                allowDecimals={false} width={34}
              />
              {topQuartile && (
                <ReferenceArea
                  y1={1} y2={topQuartile}
                  fill="rgba(96,165,250,0.08)" fillOpacity={1}
                  label={{ value: "Top quartile", position: "insideTopRight", fill: "#60A5FA", fontSize: 10 }}
                />
              )}
              <Tooltip content={<RankTooltip />} />
              <Line
                type="monotone" dataKey="rank"
                stroke="#60A5FA" strokeWidth={2.5}
                dot={{ fill: "#60A5FA", r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
        <div style={{ fontSize: 11, color: "#4A6480", marginTop: 6 }}>
          Ranked among {pg} counties that filed AFIR each year. Lower rank = stronger fund balance.
        </div>
      </ChartCard>

      {/* ── 2. Fund Balance % ────────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          title="Fund Balance %"
          sub="General fund balance as % of net expenditures · LGC recommends ≥ 8%"
        />
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={fbChartData} margin={{ top: 8, right: 16, bottom: 4, left: -4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="year" tickFormatter={fmtYear} tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
            <YAxis tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} tickFormatter={v => `${v}%`} width={40} />
            <ReferenceLine
              y={8} stroke="#F87171" strokeDasharray="4 2"
              label={{ value: "LGC 8%", position: "insideBottomLeft", fill: "#F87171", fontSize: 10 }}
            />
            <Tooltip content={<MetricTooltip isPercent />} />
            <Line type="monotone" dataKey={county.name} stroke="#60A5FA" strokeWidth={2.5} dot={{ fill: "#60A5FA", r: 3 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Peer group avg" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: "#60A5FA" }}>— {county.name}</span>
          <span style={{ color: "#4A6480" }}>- - Peer group avg</span>
        </div>
      </ChartCard>

      {/* ── 3. Revenue per Capita ────────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          title="Revenue per Capita"
          sub={`${county.name} vs. ${pg ?? "peer group"} average`}
        />
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={revChartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="year" tickFormatter={fmtYear} tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
            <YAxis tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}K`} width={46} />
            <Tooltip content={<MetricTooltip isCurrency />} />
            <Line type="monotone" dataKey={county.name} stroke="#60A5FA" strokeWidth={2.5} dot={{ fill: "#60A5FA", r: 3 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Peer group avg" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: "#60A5FA" }}>— {county.name}</span>
          <span style={{ color: "#4A6480" }}>- - Peer group avg</span>
        </div>
      </ChartCard>

      {/* ── 4. Expenditure per Capita ────────────────────────────────────── */}
      <ChartCard>
        <SectionHeader
          title="Expenditure per Capita"
          sub={`${county.name} vs. ${pg ?? "peer group"} average`}
        />
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart data={expChartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="year" tickFormatter={fmtYear} tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
            <YAxis tick={AXIS_STYLE} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(1)}K`} width={46} />
            <Tooltip content={<MetricTooltip isCurrency />} />
            <Line type="monotone" dataKey={county.name} stroke="#FBBF24" strokeWidth={2.5} dot={{ fill: "#FBBF24", r: 3 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Peer group avg" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: "#FBBF24" }}>— {county.name}</span>
          <span style={{ color: "#4A6480" }}>- - Peer group avg</span>
        </div>
      </ChartCard>
    </div>
  );
}
