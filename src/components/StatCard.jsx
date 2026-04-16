function Sparkline({ trend }) {
  if (!trend || trend.length < 2) return null;

  const values = trend.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 60;
  const h = 20;
  const n = values.length;

  const points = values
    .map((v, i) => {
      const x = (i / (n - 1)) * w;
      const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block", marginTop: 6 }}>
      <polyline
        points={points}
        fill="none"
        stroke="#5FA8D3"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StatCard({ label, value, sub, accent, isMobile, trend }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
      borderRadius: 12,
      padding: isMobile ? "14px 16px" : "20px 24px",
      border: "1px solid #1a3456",
      flex: 1,
      minWidth: isMobile ? "calc(50% - 6px)" : 160,
      boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#6b8aad", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: isMobile ? 20 : 26,
        fontWeight: 700,
        color: accent ?? "#e8f1f8",
        fontFamily: "'Playfair Display', serif",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#5a7d9a", marginTop: 4 }}>{sub}</div>
      )}
      {trend && <Sparkline trend={trend} />}
    </div>
  );
}
