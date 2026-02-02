import ReactECharts from "echarts-for-react";
import { colors } from "@/lib/echartsTheme";

interface ConfusionMatrixChartProps {
  matrix: number[][];
  title?: string;
}

export function ConfusionMatrixChart({ matrix, title }: ConfusionMatrixChartProps) {
  // Generate class labels (0, 1, 2, etc.)
  const classLabels = matrix.map((_, i) => `Class ${i}`);

  // Convert matrix to echarts heatmap format: [x, y, value]
  const data: [number, number, number][] = [];
  let maxValue = 0;

  matrix.forEach((row, i) => {
    row.forEach((value, j) => {
      data.push([j, matrix.length - 1 - i, value]); // Flip Y axis for proper orientation
      maxValue = Math.max(maxValue, value);
    });
  });

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
      position: "top",
      backgroundColor: colors.surface,
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
      },
      formatter: (params: { data: [number, number, number] }) => {
        const [x, y, value] = params.data;
        const actualY = matrix.length - 1 - y;
        return `Predicted: ${x}<br/>Actual: ${actualY}<br/>Count: <strong>${value}</strong>`;
      },
    },
    grid: {
      left: "15%",
      right: "10%",
      top: title ? 50 : 30,
      bottom: "15%",
    },
    xAxis: {
      type: "category",
      data: classLabels,
      name: "Predicted",
      nameLocation: "middle",
      nameGap: 30,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 12,
      },
      splitArea: {
        show: true,
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: colors.textMuted,
        },
      },
    },
    yAxis: {
      type: "category",
      data: [...classLabels].reverse(), // Reverse for proper orientation
      name: "Actual",
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 12,
      },
      splitArea: {
        show: true,
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: colors.textMuted,
        },
      },
    },
    visualMap: {
      min: 0,
      max: maxValue,
      calculable: true,
      orient: "vertical",
      right: "2%",
      top: "center",
      itemHeight: 100,
      textStyle: {
        color: colors.textSecondary,
        fontSize: 10,
      },
      inRange: {
        color: [colors.elevated, colors.accent, colors.success],
      },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          color: colors.textPrimary,
          fontSize: 12,
          fontWeight: "bold",
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.5)",
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
