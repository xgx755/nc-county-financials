// Feature 1 — Fund Balance Gauge
// Displays a county's FBA % against LGC minimum (8%) and group/state averages.

const LGC_FBA_MIN = 0.08;

function fmtFbPct(val) {
  return (val * 100).toFixed(1) + "%";
}

// Map a value 0–1 across a domain of 0–maxVal for track positioning
// We show up to 1.5× the max of (pct, grp_pct) for comfortable padding
function trackDomain(county, compare) {
  const vals = [
    LGC_FBA_MIN,
    county.fb?.pct,
    county.fb?.grp_pct,
    county.fb?.state_pct,
    compare?.fb?.pct,
    compare?.fb?.grp_pct,
  ].filter((v) => v != null && v > 0);
  if (!vals.length) return 1;
  return Math.max(Math.min(Math.max(...vals) * 1.35, 1), LGC_FBA_MIN * 3);
}

function fillColor(pct) {
  if (pct < LGC_FBA_MIN) return "#AE2012";
  if (pct <= 0.25) return "#EE9B00";
  return "#62B6CB";
}

// Single gauge track for one county
function GaugeTrack({ fb, countyName, domain, thin = false }) {
  if (!fb || fb.pct == null) return null;

  const { pct, grp_pct, state_pct } = fb;
  const toX = (v) => `${Math.min((v / domain) * 100, 100)}%`;

  const trackH = thin ? 8 : 12;
  const markerR = thin ? 5 : 7;

  return (
    <div style={{ position: "relative", marginBottom: thin ? 6 : 18 }}>
      {/* State avg label — small, above track right side */}
      {!thin && state_pct != null && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: -16,
            fontSize: 10,
            color: "#4a6d8c",
          }}
        >
          State avg: {fmtFbPct(state_pct)}
        </div>
      )}

      {/* County % label above fill segment */}
      {!thin && (
        <div
          style={{
            position: "absolute",
            left: toX(pct),
            top: -16,
            transform: "translateX(-50%)",
            fontSize: 11,
            fontWeight: 700,
            color: fillColor(pct),
            whiteSpace: "nowrap",
          }}
        >
          {fmtFbPct(pct)}
        </div>
      )}

      {/* Track */}
      <div
        style={{
          position: "relative",
          height: trackH,
          background: "#1a2a3a",
          borderRadius: 6,
          overflow: "visible",
        }}
      >
        {/* County fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: toX(pct),
            background: fillColor(pct),
            borderRadius: 6,
            transition: "width 0.4s ease",
          }}
        />

        {/* LGC min tick */}
        <div
          style={{
            position: "absolute",
            left: toX(LGC_FBA_MIN),
            top: -3,
            width: 2,
            height: trackH + 6,
            background: "#ffffff88",
            borderRadius: 1,
          }}
        />

        {/* Group avg tick */}
        {grp_pct != null && (
          <div
            style={{
              position: "absolute",
              left: toX(grp_pct),
              top: -3,
              width: 2,
              height: trackH + 6,
              background: "#EE9B00",
              borderRadius: 1,
            }}
          />
        )}
      </div>

      {/* Labels below track */}
      <div
        style={{
          position: "relative",
          height: 20,
          marginTop: 4,
          fontSize: 10,
          color: "#8aa4bc",
        }}
      >
        {/* LGC min label */}
        <span
          style={{
            position: "absolute",
            left: toX(LGC_FBA_MIN),
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            color: "#aabbcc",
          }}
        >
          LGC Min 8%
        </span>

        {/* Group avg label */}
        {grp_pct != null && (
          <span
            style={{
              position: "absolute",
              left: toX(grp_pct),
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              color: "#EE9B00",
            }}
          >
            Group Avg {fmtFbPct(grp_pct)}
          </span>
        )}
      </div>

      {/* Thin track pct label */}
      {thin && (
        <div style={{ fontSize: 11, color: fillColor(pct), marginTop: 4 }}>
          {countyName}: {fmtFbPct(pct)}
        </div>
      )}
    </div>
  );
}

export default function FundBalanceGauge({ county, compare }) {
  const hasFb = county.fb && county.fb.pct != null;
  const domain = trackDomain(county, compare);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0d1f3c 0%, #132744 100%)",
        borderRadius: 12,
        padding: "20px 24px",
        border: "1px solid #1a3456",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: "#6b8aad",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        Fund Balance
      </div>

      {hasFb && (
        <div style={{
          fontSize: 26,
          fontWeight: 700,
          color: fillColor(county.fb.pct),
          fontFamily: "'Playfair Display', serif",
          lineHeight: 1.1,
          marginBottom: 16,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}>
          {fmtFbPct(county.fb.pct)}
          {county.fb.grp_pct != null && (
            <span style={{ fontSize: 12, fontWeight: 400, color: "#5a7d9a", fontFamily: "'DM Sans', sans-serif" }}>
              Group avg {fmtFbPct(county.fb.grp_pct)}
            </span>
          )}
        </div>
      )}

      {!hasFb ? (
        /* Null state */
        <div
          style={{
            background: "#1a2a3a",
            borderLeft: "3px solid #EE9B00",
            padding: 16,
            borderRadius: 4,
          }}
        >
          <span style={{ color: "#EE9B00", marginRight: 8 }}>⚠</span>
          <strong style={{ color: "#c8d8e8" }}>
            Fund balance data not available
          </strong>
          <p style={{ color: "#8aa4bc", margin: "6px 0 0", fontSize: 13 }}>
            {county.name} County did not file an audit that was included in
            this AFIR dataset. Fund balance figures cannot be reported for this
            county.
          </p>
        </div>
      ) : (
        <>
          <GaugeTrack
            fb={county.fb}
            countyName={county.name}
            domain={domain}
            thin={false}
          />

          {compare && compare.fb && compare.fb.pct != null && (
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#EE9B00",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {compare.name} (compare)
              </div>
              <GaugeTrack
                fb={compare.fb}
                countyName={compare.name}
                domain={domain}
                thin={true}
              />
            </div>
          )}

          {compare && (!compare.fb || compare.fb.pct == null) && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#8aa4bc",
                background: "#1a2a3a",
                borderLeft: "3px solid #EE9B00",
                padding: "8px 12px",
                borderRadius: 4,
              }}
            >
              <span style={{ color: "#EE9B00", marginRight: 6 }}>⚠</span>
              Fund balance data not available for {compare.name} County.
            </div>
          )}
        </>
      )}
    </div>
  );
}
