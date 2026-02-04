import ReactECharts from "echarts-for-react";
import { colors, chartColors } from "@/lib/echartsTheme";
import {
  RegressionPDPData,
  ClassificationPDPData,
  isClassificationPDPData,
} from "@/lib/explainTypes";

interface PDPChartProps {
  data: RegressionPDPData | ClassificationPDPData;
  title?: string;
  showICE?: boolean;
}

export function PDPChart({ data, title, showICE = true }: PDPChartProps) {
  const feature = data.feature;
  const gridValues = data.gridValues;

  const isClassification = isClassificationPDPData(data);

  // Build series based on data type
  const series: object[] = [];

  if (isClassification) {
    // Classification: one line per class
    const classNames = Object.keys(data.pdpByClass);
    classNames.forEach((className, idx) => {
      const pdpValues = data.pdpByClass[className];
      const color = chartColors[idx % chartColors.length];
      series.push({
        name: className,
        type: "line",
        data: gridValues.map((x, i) => [x, pdpValues[i]]),
        smooth: true,
        lineStyle: {
          width: 2.5,
          color: color,
        },
        itemStyle: {
          color: color,
        },
        showSymbol: false,
        emphasis: {
          lineStyle: {
            width: 3.5,
          },
        },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}30` },
              { offset: 1, color: `${color}05` },
            ],
          },
        },
      });
    });
  } else {
    // Regression: PDP line with optional ICE lines
    const pdpValues = data.pdpValues;
    const iceLines = data.iceLines;

    // Add ICE lines first (behind PDP)
    if (showICE && iceLines && iceLines.length > 0) {
      iceLines.forEach((iceLine, idx) => {
        series.push({
          name: `ICE ${idx}`,
          type: "line",
          data: gridValues.map((x, i) => [x, iceLine[i]]),
          smooth: true,
          lineStyle: {
            width: 0.5,
            color: `${colors.textMuted}30`, // GitHub muted with opacity
          },
          showSymbol: false,
          silent: true,
          z: 1,
        });
      });
    }

    // Add main PDP line with gradient area
    series.push({
      name: "PDP",
      type: "line",
      data: gridValues.map((x, i) => [x, pdpValues[i]]),
      smooth: true,
      lineStyle: {
        width: 3,
        color: colors.accent,
      },
      itemStyle: {
        color: colors.accent,
      },
      showSymbol: false,
      z: 10,
      emphasis: {
        lineStyle: {
          width: 4,
        },
      },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${colors.accent}30` },
            { offset: 1, color: `${colors.accent}05` },
          ],
        },
      },
    });
  }

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
      trigger: "axis",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
        fontSize: 12,
      },
      extraCssText: "border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);",
      formatter: (params: { seriesName: string; data: number[]; color: string }[]) => {
        // Filter out ICE lines
        const mainParams = params.filter(
          (p) => !p.seriesName.startsWith("ICE")
        );
        if (mainParams.length === 0) return "";

        const x = mainParams[0].data[0];
        let html = `<strong>${feature}</strong>: ${x.toFixed(3)}<br/>`;

        mainParams.forEach((p) => {
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;"></span>`;
          html += `${dot}${p.seriesName}: <strong>${p.data[1].toFixed(4)}</strong><br/>`;
        });

        return html;
      },
    },
    legend: isClassification
      ? {
          top: title ? 28 : 8,
          textStyle: {
            color: colors.textSecondary,
            fontSize: 10,
          },
          itemWidth: 16,
          itemHeight: 8,
          itemGap: 16,
        }
      : undefined,
    grid: {
      left: "3%",
      right: "4%",
      bottom: "12%",
      top: isClassification ? 55 : title ? 45 : 25,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: feature,
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: 500,
      },
      axisLine: {
        lineStyle: { color: colors.border },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: colors.textMuted,
        fontSize: 10,
        formatter: (v: number) => {
          if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
          if (Math.abs(v) >= 1) return v.toFixed(1);
          return v.toFixed(2);
        },
      },
      splitLine: {
        lineStyle: {
          color: colors.border,
          opacity: 0.4,
          type: "dashed",
        },
      },
    },
    yAxis: {
      type: "value",
      name: isClassification ? "Probability" : "Prediction",
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 11,
        fontWeight: 500,
      },
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: colors.textMuted,
        fontSize: 10,
        formatter: (v: number) => v.toFixed(2),
      },
      splitLine: {
        lineStyle: {
          color: colors.border,
          opacity: 0.4,
          type: "dashed",
        },
      },
    },
    series,
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: "100%", width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
