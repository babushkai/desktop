import ReactECharts from "echarts-for-react";
import { chartColors, colors } from "@/lib/echartsTheme";

interface MetricsBarChartProps {
  labels: string[];
  values: number[];
  title?: string;
}

export function MetricsBarChart({ labels, values, title }: MetricsBarChartProps) {
  const option = {
    backgroundColor: "transparent",
    title: title
      ? {
          text: title,
          left: "center",
          top: 0,
          textStyle: {
            color: colors.textPrimary,
            fontSize: 14,
            fontWeight: 500,
          },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      backgroundColor: colors.surface,
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
      },
      formatter: (params: { name: string; value: number }[]) => {
        const data = params[0];
        return `<strong>${data.name}</strong><br/>${data.value.toFixed(4)}`;
      },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      top: title ? 40 : 20,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: {
        lineStyle: {
          color: colors.textMuted,
        },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
        rotate: labels.length > 4 ? 30 : 0,
      },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: (value: { max: number }) => {
        // For metrics between 0-1 (like accuracy), cap at 1
        // For larger metrics (like MSE), auto scale
        return value.max <= 1 ? 1 : undefined;
      },
      axisLine: {
        lineStyle: {
          color: colors.textMuted,
        },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
        formatter: (value: number) => {
          if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
          if (value >= 1) return value.toFixed(1);
          return value.toFixed(2);
        },
      },
      splitLine: {
        lineStyle: {
          color: "rgba(255, 255, 255, 0.05)",
        },
      },
    },
    series: [
      {
        type: "bar",
        data: values.map((value, index) => ({
          value,
          itemStyle: {
            color: chartColors[index % chartColors.length],
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: "60%",
        label: {
          show: true,
          position: "top",
          color: colors.textSecondary,
          fontSize: 11,
          formatter: (params: { value: number }) => {
            const v = params.value;
            if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
            if (v >= 100) return v.toFixed(1);
            return v.toFixed(4);
          },
        },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: "100%", width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
