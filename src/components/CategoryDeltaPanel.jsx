import {
  BarChart, Bar, XAxis, YAxis, ReferenceLine,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { REV_CATS, EXP_CATS } from "../constants.js";

const ABOVE_COLOR = "#5FA8D3";
const BELOW_COLOR = "#AE2012";
const CMP_COLOR   = "#EE9B00";

function CustomTooltip({ active, payload, label, county, compareCounty, type }) {
  if (!active || !payload?.length) return null;

  const actualKey = type === "revenue" ? "pr" : "pe";
  const avgKey    = type === "revenue" ? "gr" : "ge";

  return (
    <div style={{
      background: "#0d1f3c",
      border: "1px solid #1a3456",
      borderRadius: 6,
      padding: "8px 12px",
      fontSize: 12,
      color: "#c8d8e8",
      maxWidth: 260,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#e8f1f8" }}>{label}</div>
      {payload.map((p, i) => {
        const delta = p.value;
        if (delta == null) return null;
        const absD = Math.abs(delta);
        const src = p.dataKey === "compare" ? compareCounty : county;
        const avg = src?.[avgKey]?.[label];
        const pctStr = avg != null && avg !== 0
          ? ` (${(Math.abs(delta / avg) * 100).toFixed(1)}% ${delta >= 0 ? "above" : "below"} group avg)`
          : "";
        const name = p.dataKey === "compare" ? compareCounty?.name : county?.name;
        return (
          <div key={i} style={{ color: p.fill, lineHeight: 1.5 }}>
            {name}: {delta >= 0 ? "+" : "−"}${Math.round(absD).toLocaleString()}/capita{pctStr}
          </div>
        );
      })}
    </div>
  );
}

export default function CategoryDeltaPanel({ county, type, isMobile, compareCounty }) {
  const cats      = type === "revenue" ? REV_CATS : EXP_CATS;
  const actualKey = type === "revenue" ? "pr" : "pe";
  const avgKey    = type === "revenue" ? "gr" : "ge";

  const data = cats
    .filter(cat => county[actualKey]?.[cat] != null && county[avgKey]?.[cat] != null)
    .map(cat => {
      const primary = county[actualKey][cat] - county[avgKey][cat];
      const entry = { name: cat, primary };

      if (compareCounty) {
        const cmpActual = compareCounty[actualKey]?.[cat];
        const cmpAvg    = compareCounty[avgKey]?.[cat];
        entry.compare = (cmpActual != null && cmpAvg != null) ? cmpActual - cmpAvg : null;
      }

      return entry;
    });

  const chartHeight = isMobile ? 240 : 300;
  const yAxisWidth  = isMobile ? 96 : 140;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
      borderRadius: 12,
      border: "1px solid #1a3456",
      padding: isMobile ? "16px 12px" : "20px 24px",
      marginBottom: 24,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#c8d8e8",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}>
          Per-Capita vs. Population Group Average
        </div>
        <div style={{ fontSize: 11, color: "#4a6d8c", marginTop: 3 }}>
          Population Group: {county.pg}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 32, left: 0, bottom: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={v =>
                (v >= 0 ? "+" : "−") + "$" + Math.round(Math.abs(v)).toLocaleString()
              }
              tick={{ fontSize: 10, fill: "#4a6d8c" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: isMobile ? 10 : 12, fill: "#b0c4d8" }}
              tickFormatter={v =>
                isMobile && v.length > 16 ? v.slice(0, 14) + "…" : v
              }
              axisLine={false}
              tickLine={false}
            />
            <ReferenceLine x={0} stroke="#2a4d6e" strokeWidth={1.5} />
            <Tooltip
              content={
                <CustomTooltip
                  county={county}
                  compareCounty={compareCounty}
                  type={type}
                />
              }
            />
            <Bar dataKey="primary" isAnimationActive={false} radius={[0, 3, 3, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.primary >= 0 ? ABOVE_COLOR : BELOW_COLOR} />
              ))}
            </Bar>
            {compareCounty && (
              <Bar dataKey="compare" isAnimationActive={false} radius={[0, 3, 3, 0]} fill={CMP_COLOR} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {compareCounty && (
        <div style={{
          display: "flex", gap: 16, fontSize: 11, color: "#6b8aad",
          marginTop: 8, flexWrap: "wrap",
        }}>
          <span>
            <span style={{
              display: "inline-block", width: 10, height: 10, borderRadius: 2,
              background: ABOVE_COLOR, marginRight: 4, verticalAlign: "middle",
            }} />
            {county.name} (vs. {county.pg} avg)
          </span>
          <span>
            <span style={{
              display: "inline-block", width: 10, height: 10, borderRadius: 2,
              background: CMP_COLOR, marginRight: 4, verticalAlign: "middle",
            }} />
            {compareCounty.name} (vs. {compareCounty.pg} avg)
          </span>
        </div>
      )}
    </div>
  );
}
