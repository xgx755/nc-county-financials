import { useMemo } from "react";

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtMetricValue(value, metricKey) {
  if (value == null) return "N/A";
  if (metricKey === "fb.pct") return (value * 100).toFixed(1) + "%";
  if (metricKey === "tax.effective_rate") return "$" + value.toFixed(3);
  return "$" + Math.round(value).toLocaleString();
}

function getMetricValue(county, metricKey) {
  if (metricKey === "pr.Total Revenue")      return county.pr?.["Total Revenue"]      ?? null;
  if (metricKey === "pe.Total Expenditures") return county.pe?.["Total Expenditures"] ?? null;
  if (metricKey === "fb.pct")                return county.fb?.pct ?? null;
  if (metricKey === "tax.effective_rate")    return county.tax?.effective_rate ?? null;
  return null;
}

function metricLabel(metricKey) {
  if (metricKey === "pr.Total Revenue")      return "Revenue / capita";
  if (metricKey === "pe.Total Expenditures") return "Expenditure / capita";
  if (metricKey === "fb.pct")                return "Fund Balance %";
  if (metricKey === "tax.effective_rate")    return "Effective tax rate";
  return metricKey;
}

const SHOW_ALL_THRESHOLD = 9;
const EDGE_ROWS          = 2;
const NEIGHBOR_WINDOW    = 2;

// standalone=true  → renders its own card (legacy / print use)
// standalone=false → renders bare column content for use inside PeerRankingsPanel
export default function PeerRankBar({ DATA, county, compare, metricKey, standalone = true }) {
  const primaryNull = metricKey === "fb.pct" && county.fb == null;

  const peers = useMemo(
    () => DATA.filter(c => c.pg === county.pg),
    [DATA, county.pg]
  );
  const validPeers = useMemo(
    () => peers.filter(c => getMetricValue(c, metricKey) != null),
    [peers, metricKey]
  );

  if (peers.length < 2 || primaryNull) return null;

  // Sort descending: rank 1 = highest value
  const sorted = useMemo(
    () => [...validPeers].sort((a, b) => getMetricValue(b, metricKey) - getMetricValue(a, metricKey)),
    [validPeers, metricKey]
  );
  const total = sorted.length;

  const myIdx     = sorted.findIndex(c => c.name === county.name);
  const myRank    = myIdx + 1;
  const myVal     = getMetricValue(county, metricKey);
  const isTie     = validPeers.filter(c => getMetricValue(c, metricKey) === myVal).length > 1;
  const rankLabel = `${isTie ? "T-" : ""}${ordinal(myRank)} of ${total}`;

  const sameGroup  = compare && compare.pg === county.pg;
  const compareIdx = sameGroup ? sorted.findIndex(c => c.name === compare.name) : -1;

  const displayRows = useMemo(() => {
    if (total <= SHOW_ALL_THRESHOLD) {
      return sorted.map((c, i) => ({ county: c, rank: i + 1 }));
    }

    const show = new Set();
    for (let i = 0; i < Math.min(EDGE_ROWS, total); i++) show.add(i);
    for (let i = Math.max(0, total - EDGE_ROWS); i < total; i++) show.add(i);
    for (let i = Math.max(0, myIdx - NEIGHBOR_WINDOW); i <= Math.min(total - 1, myIdx + NEIGHBOR_WINDOW); i++) show.add(i);
    if (compareIdx >= 0) {
      for (let i = Math.max(0, compareIdx - 1); i <= Math.min(total - 1, compareIdx + 1); i++) show.add(i);
    }

    const indices = [...show].sort((a, b) => a - b);
    const result = [];
    for (let j = 0; j < indices.length; j++) {
      if (j > 0 && indices[j] !== indices[j - 1] + 1) {
        result.push({ ellipsis: true, key: `gap-${j}` });
      }
      result.push({ county: sorted[indices[j]], rank: indices[j] + 1 });
    }
    return result;
  }, [sorted, total, myIdx, compareIdx]);

  const content = (
    <>
      {/* Column header: metric label + rank */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 10, flexWrap: "wrap", gap: 4,
      }}>
        <span style={{ fontSize: 11, color: "#6b8aad", textTransform: "uppercase", letterSpacing: 1 }}>
          {metricLabel(metricKey)}
          {standalone && ` — ${county.pg}`}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#5FA8D3" }}>
          {rankLabel}
        </span>
      </div>

      {/* Ranked list */}
      <div>
        {displayRows.map((row, i) => {
          if (row.ellipsis) {
            return (
              <div key={row.key} style={{
                fontSize: 11, color: "#2a4a6b",
                padding: "2px 0 2px 30px",
                letterSpacing: 1,
              }}>
                ···
              </div>
            );
          }

          const isSelected = row.county.name === county.name;
          const isCompare  = sameGroup && compare && row.county.name === compare.name;
          const accent     = isSelected ? "#5FA8D3" : isCompare ? "#EE9B00" : null;
          const val        = getMetricValue(row.county, metricKey);

          return (
            <div key={row.county.name} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 6px",
              borderRadius: 5,
              marginBottom: 1,
              background: isSelected
                ? "rgba(95,168,211,0.07)"
                : isCompare
                ? "rgba(238,155,0,0.07)"
                : "transparent",
              borderLeft: accent ? `2px solid ${accent}` : "2px solid transparent",
            }}>
              <span style={{
                width: 18,
                fontSize: 10,
                color: accent ?? "#2a4a6b",
                textAlign: "right",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}>
                {row.rank}
              </span>
              <span style={{
                flex: 1,
                fontSize: 12,
                color: accent ?? "#6b8aad",
                fontWeight: isSelected || isCompare ? 700 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {row.county.name}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: isSelected || isCompare ? 700 : 400,
                color: accent ?? "#4a6d8c",
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}>
                {fmtMetricValue(val, metricKey)}
              </span>
            </div>
          );
        })}
      </div>

      {compare && !sameGroup && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#4a6d8c", fontStyle: "italic" }}>
          {compare.name} ({compare.pg}) — different group, not ranked here.
        </div>
      )}
    </>
  );

  if (!standalone) return content;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
      borderRadius: 12,
      padding: "16px 24px",
      border: "1px solid #1a3456",
      marginBottom: 24,
    }}>
      {content}
    </div>
  );
}
