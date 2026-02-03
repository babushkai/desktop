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
      series.push({
        name: className,
        type: "line",
        data: gridValues.map((x, i) => [x, pdpValues[i]]),
        smooth: true,
        lineStyle: {
          width: 2,
          color: chartColors[idx % chartColors.length],
        },
        itemStyle: {
          color: chartColors[idx % chartColors.length],
        },
        showSymbol: false,
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
            color: "rgba(148, 163, 184, 0.2)", // text-secondary with opacity
          },
          showSymbol: false,
          silent: true,
          z: 1,
        });
      });
    }

    // Add main PDP line
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
    });
  }

  const option = {
    backgroundColor: "transparent",
    title: title
      ? {
          text: title,
          left: "center",
          top: 0,
          textStyle: {
            color: colors.textPrimary,
            fontSize: 13,
            fontWeight: 500,
          },
        }
      : undefined,
    tooltip: {
      trigger: "axis",
      backgroundColor: colors.surface,
      borderColor: "rgba(255, 255, 255, 0.1)",
      borderWidth: 1,
      textStyle: {
        color: colors.textPrimary,
      },
      formatter: (params: { seriesName: string; data: number[] }[]) => {
        // Filter out ICE lines
        const mainParams = params.filter(
          (p) => !p.seriesName.startsWith("ICE")
        );
        if (mainParams.length === 0) return "";

        const x = mainParams[0].data[0];
        let html = `<strong>${feature}</strong>: ${x.toFixed(3)}<br/>`;

        mainParams.forEach((p) => {
          html += `${p.seriesName}: ${p.data[1].toFixed(4)}<br/>`;
        });

        return html;
      },
    },
    legend: isClassification
      ? {
          top: title ? 25 : 5,
          textStyle: {
            color: colors.textSecondary,
            fontSize: 10,
          },
        }
      : undefined,
    grid: {
      left: "10%",
      right: "5%",
      bottom: "15%",
      top: isClassification ? 60 : title ? 40 : 20,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      name: feature,
      nameLocation: "middle",
      nameGap: 25,
      nameTextStyle: {
        color: colors.textSecondary,
        fontSize: 11,
      },
      axisLine: {
        lineStyle: { color: colors.textMuted },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 10,
        formatter: (v: number) => {
          if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
          if (Math.abs(v) >= 1) return v.toFixed(1);
          return v.toFixed(2);
        },
      },
      splitLine: {
        lineStyle: { color: "rgba(255, 255, 255, 0.05)" },
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
      },
      axisLine: {
        lineStyle: { color: colors.textMuted },
      },
      axisLabel: {
        color: colors.textSecondary,
        fontSize: 10,
        formatter: (v: number) => v.toFixed(2),
      },
      splitLine: {
        lineStyle: { color: "rgba(255, 255, 255, 0.05)" },
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
