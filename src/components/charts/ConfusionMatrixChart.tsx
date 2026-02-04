import ReactECharts from "echarts-for-react";
import { colors, heatmapColors } from "@/lib/echartsTheme";

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
          top: 4,
          textStyle: {
            color: colors.textPrimary,
            fontSize: 13,
            fontWeight: 600,
          },
        }
      : undefined,
    tooltip: {
      position: "top",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
        fontSize: 12,
      },
      extraCssText: "border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);",
      formatter: (params: { data: [number, number, number] }) => {
        const [x, y, value] = params.data;
        const actualY = matrix.length - 1 - y;
        return `<div style="padding: 2px 0;">
          <span style="color:${colors.textSecondary}">Predicted:</span> <strong>${x}</strong><br/>
          <span style="color:${colors.textSecondary}">Actual:</span> <strong>${actualY}</strong><br/>
          <span style="color:${colors.textSecondary}">Count:</span> <strong style="color:${colors.accent}">${value}</strong>
        </div>`;
      },
    },
    grid: {
      left: "15%",
      right: "12%",
      top: title ? 45 : 25,
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
        fontSize: 11,
        fontWeight: 500,
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ["transparent", "rgba(255, 255, 255, 0.02)"],
        },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: colors.border,
        },
      },
      axisTick: {
        show: false,
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
        fontSize: 11,
        fontWeight: 500,
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ["transparent", "rgba(255, 255, 255, 0.02)"],
        },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: {
          color: colors.border,
        },
      },
      axisTick: {
        show: false,
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
      itemWidth: 12,
      textStyle: {
        color: colors.textMuted,
        fontSize: 10,
      },
      inRange: {
        color: heatmapColors,
      },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          color: colors.textPrimary,
          fontSize: 13,
          fontWeight: 600,
          formatter: (params: { data: [number, number, number] }) => {
            return params.data[2].toString();
          },
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
        itemStyle: {
          borderColor: colors.background,
          borderWidth: 2,
          borderRadius: 4,
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
