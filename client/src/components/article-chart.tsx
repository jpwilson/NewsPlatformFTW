import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Rendered from ```chart fenced blocks (see docs/article-format.md).
export interface ChartSpec {
  type: "bar" | "line" | "area" | "pie";
  title?: string;
  labels: string[];
  series: Array<{ name: string; data: number[] }>;
  source?: string;
}

const CHART_COLORS = [
  "#3b82f6", // brand blue
  "#22c55e",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#eab308",
  "#ef4444",
];

const GRID_STROKE = "rgba(128,128,128,0.25)";
const TICK_STYLE = { fill: "#8c8c8c", fontSize: 12 };

export function ArticleChart({ spec }: { spec: ChartSpec }) {
  const { type, title, labels = [], series = [], source } = spec || ({} as ChartSpec);
  if (!type || !Array.isArray(series) || series.length === 0 || !Array.isArray(labels)) {
    return null;
  }

  const data = labels.map((label, i) => {
    const row: Record<string, string | number | null> = { name: label };
    for (const s of series) row[s.name] = s.data?.[i] ?? null;
    return row;
  });

  const tooltipStyle = {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--foreground))",
    fontSize: 13,
  };

  let chart: React.ReactNode = null;

  if (type === "pie") {
    const pieData = labels.map((label, i) => ({
      name: label,
      value: series[0].data?.[i] ?? 0,
    }));
    chart = (
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius="80%"
          innerRadius="45%"
          paddingAngle={2}
          isAnimationActive
        >
          {pieData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    );
  } else if (type === "line" || type === "area") {
    const Wrapper = type === "line" ? LineChart : AreaChart;
    chart = (
      <Wrapper data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) =>
          type === "line" ? (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              isAnimationActive
            />
          ) : (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.18}
              strokeWidth={2.5}
              isAnimationActive
            />
          )
        )}
      </Wrapper>
    );
  } else {
    chart = (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(128,128,128,0.08)" }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar
            key={s.name}
            dataKey={s.name}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
            isAnimationActive
          />
        ))}
      </BarChart>
    );
  }

  return (
    <div className="article-chart-inner">
      {title && <div className="chart-title">{title}</div>}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart as any}
        </ResponsiveContainer>
      </div>
      {source && <div className="chart-source">Source: {source}</div>}
    </div>
  );
}
