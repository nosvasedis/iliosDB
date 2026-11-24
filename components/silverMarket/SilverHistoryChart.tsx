import { useId, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SilverMarketHistory } from '../../lib/silverMarketContract';
import { formatDecimal } from '../../utils/numberFormat';

const ATHENS = 'Europe/Athens';
const dateFormat = new Intl.DateTimeFormat('el-GR', { timeZone: ATHENS, day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('el-GR', { timeZone: ATHENS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const intervalMs = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };

export function formatMarketTime(time: string | number, daily = false) {
  const date = typeof time === 'string' ? new Date(time) : new Date(Number(time));
  return daily ? dateFormat.format(date) : `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

export default function SilverHistoryChart({ series, compact }: { series: SilverMarketHistory; compact: boolean }) {
  const gradientId = useId();
  const intraday = series.range === '24h';
  const tickFormat = intraday ? timeFormat : dateFormat;
  const { data, domain, ticks, low, high } = useMemo(() => {
    const gap = 2 * intervalMs[series.interval];
    const data: Array<{ time: number; price: number | null }> = [];
    let low = Infinity;
    let high = -Infinity;
    for (const point of series.points) {
      const time = Date.parse(point.quotedAt);
      const previous = data[data.length - 1];
      if (previous && time - previous.time > gap) data.push({ time: previous.time + intervalMs[series.interval], price: null });
      data.push({ time, price: point.priceEurPerGram });
      low = Math.min(low, point.priceEurPerGram);
      high = Math.max(high, point.priceEurPerGram);
    }
    const padding = Math.max((high - low) * 0.12, 0.002);
    const domain: [number, number] = [Math.max(0, low - padding), high + padding];
    const start = data[0].time;
    const end = data[data.length - 1].time;
    const ticksByLabel = new Map<string, number>();
    for (let i = 0; i < 5; i += 1) {
      const time = start + (end - start) * i / 4;
      const label = tickFormat.format(time);
      if (!ticksByLabel.has(label)) ticksByLabel.set(label, time);
    }
    return { data, domain, ticks: [...ticksByLabel.values()], low, high };
  }, [series, tickFormat]);

  return (
    <div className={compact ? 'h-14 min-w-0' : 'h-48 min-w-0 sm:h-64 [&_.recharts-surface:focus]:outline-hidden [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-teal-700'} aria-hidden={compact || undefined}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          accessibilityLayer={!compact}
          title={compact ? undefined : `Ιστορικό ασημιού σε ευρώ ανά γραμμάριο. Από ${formatDecimal(low, 3)} έως ${formatDecimal(high, 3)}. Χρησιμοποιήστε τα βέλη για τα σημεία.`}
          margin={compact ? { top: 5, right: 3, bottom: 0, left: 3 } : { top: 10, right: 12, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {!compact && <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />}
          <XAxis
            dataKey="time" type="number" domain={['dataMin', 'dataMax']} scale="time"
            hide={compact} tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 10 }}
            tickFormatter={(value: number) => tickFormat.format(value)}
            ticks={ticks} minTickGap={15}
          />
          <YAxis
            type="number" domain={domain} hide={compact} width={44} tickCount={4} allowDataOverflow
            tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 10 }}
            tickFormatter={(value: number) => formatDecimal(value, 3)}
          />
          {!compact && (
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: '#94a3b8', strokeDasharray: '4 3' }}
              content={({ active, payload }) => {
                const price = payload[0]?.value;
                const time = payload[0]?.payload?.time;
                if (!active || typeof price !== 'number' || typeof time !== 'number') return null;
                return (
                  <div role="status" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <p className="text-slate-600">{formatMarketTime(time, series.interval === '1d')}</p>
                    <p className="font-bold tabular-nums text-slate-900">{formatDecimal(price, 3)} €/g</p>
                  </div>
                );
              }}
            />
          )}
          <Area
            type="linear" dataKey="price" stroke="#0f766e" strokeWidth={2}
            fill={`url(#${gradientId})`} baseValue={domain[0]} connectNulls={false}
            dot={false} activeDot={compact ? false : { r: 4, stroke: '#fff', strokeWidth: 2, fill: '#0f766e' }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
