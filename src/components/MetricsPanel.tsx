import { RiBarChartBoxLine } from "@remixicon/react";
import { usePipelineStore } from "@/stores/pipelineStore";
import { MetricsBarChart, ConfusionMatrixChart } from "./charts";

export function MetricsPanel() {
  const metrics = usePipelineStore((s) => s.metrics);

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <RiBarChartBoxLine className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">Run an Evaluator node to see metrics</p>
      </div>
    );
  }

  if (metrics.modelType === "classifier") {
    const labels = ["Accuracy", "Precision", "Recall", "F1"];
    const values = [
      metrics.accuracy ?? 0,
      metrics.precision ?? 0,
      metrics.recall ?? 0,
      metrics.f1 ?? 0,
    ];

    return (
      <div className="flex gap-4 h-full p-2">
        <div className="flex-1 min-w-0">
          <MetricsBarChart
            labels={labels}
            values={values}
            title="Classification Metrics"
          />
        </div>
        {metrics.confusionMatrix && (
          <div className="flex-1 min-w-0">
            <ConfusionMatrixChart
              matrix={metrics.confusionMatrix}
              title="Confusion Matrix"
            />
          </div>
        )}
      </div>
    );
  }

  if (metrics.modelType === "regressor") {
    const labels = ["R2", "MSE", "RMSE", "MAE"];
    const values = [
      metrics.r2 ?? 0,
      metrics.mse ?? 0,
      metrics.rmse ?? 0,
      metrics.mae ?? 0,
    ];

    return (
      <div className="flex gap-4 h-full p-2">
        <div className="flex-1 min-w-0">
          <MetricsBarChart
            labels={labels}
            values={values}
            title="Regression Metrics"
          />
        </div>
      </div>
    );
  }

  // Unknown model type - show empty state
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-muted">
      <RiBarChartBoxLine className="w-8 h-8 mb-2 opacity-50" />
      <p className="text-sm">Unknown model type: {metrics.modelType}</p>
    </div>
  );
}
