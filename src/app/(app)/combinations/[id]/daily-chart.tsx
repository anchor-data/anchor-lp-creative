import type { DailyPoint } from "@/server/services/combination-detail";
import { yen } from "@/lib/format";

/** Spend (bars) and CPA (line) per day. Plain SVG; no client JS needed. */
export function DailyChart({ points }: { points: DailyPoint[] }) {
  const W = 960, H = 220, PAD = { l: 64, r: 64, t: 12, b: 28 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const maxSpend = Math.max(1, ...points.map((p) => p.spend ?? 0));
  const cpas = points.map((p) => p.cpa).filter((v): v is number => v !== null);
  const maxCpa = Math.max(1, ...cpas);
  const step = iw / Math.max(1, points.length);
  const x = (i: number) => PAD.l + i * step + step / 2;
  const ySpend = (v: number) => PAD.t + ih - (v / maxSpend) * ih;
  const yCpa = (v: number) => PAD.t + ih - (v / maxCpa) * ih;
  const line = points.map((p, i) => (p.cpa === null ? null : `${x(i)},${yCpa(p.cpa)}`)).filter(Boolean).join(" ");
  const ticks = [0, Math.floor(points.length / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i && v >= 0);

  return (
    <div>
      <div className="flex gap-4 text-xs text-ink-3 mb-2">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-line-2" />配信金額（左軸）</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-red" />CPA（右軸）</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="配信金額とCPAの日別推移">
        {points.map((p, i) => (
          <rect key={p.date} x={x(i) - step * 0.35} width={step * 0.7} y={ySpend(p.spend ?? 0)} height={PAD.t + ih - ySpend(p.spend ?? 0)} fill="#b3b3b3">
            <title>{`${p.date} 配信金額 ${yen(p.spend)} / CPA ${yen(p.cpa)}`}</title>
          </rect>
        ))}
        <polyline points={line} fill="none" stroke="#ec0313" strokeWidth={2} />
        <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} stroke="#e0e0e0" />
        <text x={PAD.l - 8} y={PAD.t + 10} textAnchor="end" fontSize={11} fill="#444">{yen(maxSpend)}</text>
        <text x={W - PAD.r + 8} y={PAD.t + 10} fontSize={11} fill="#ec0313">{yen(maxCpa)}</text>
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#444">{points[i].date.slice(5).replace("-", "/")}</text>
        ))}
      </svg>
    </div>
  );
}
