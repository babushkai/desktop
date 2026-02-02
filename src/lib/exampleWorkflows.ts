import { Node, Edge } from "@xyflow/react";
import { NodeData } from "@/stores/pipelineStore";

export interface ExampleWorkflow {
  name: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

export function createClassificationWorkflow(dataPath: string): ExampleWorkflow {
  return {
    name: "Iris Classification Example",
    nodes: [
      {
        id: "ex-dl-1",
        type: "dataLoader",
        position: { x: 100, y: 200 },
        data: { label: "Data Loader", filePath: dataPath },
      },
      {
        id: "ex-tr-1",
        type: "trainer",
        position: { x: 350, y: 200 },
        data: {
          label: "Trainer",
          modelType: "random_forest_classifier",
          targetColumn: "species",
          testSplit: 0.2,
        },
      },
      {
        id: "ex-ev-1",
        type: "evaluator",
        position: { x: 600, y: 200 },
        data: { label: "Evaluator" },
      },
    ],
    edges: [
      { id: "ex-e1", source: "ex-dl-1", target: "ex-tr-1" },
      { id: "ex-e2", source: "ex-tr-1", target: "ex-ev-1" },
    ],
  };
}

export function createRegressionWorkflow(dataPath: string): ExampleWorkflow {
  return {
    name: "California Housing Example",
    nodes: [
      {
        id: "ex-dl-1",
        type: "dataLoader",
        position: { x: 100, y: 200 },
        data: { label: "Data Loader", filePath: dataPath },
      },
      {
        id: "ex-tr-1",
        type: "trainer",
        position: { x: 350, y: 200 },
        data: {
          label: "Trainer",
          modelType: "linear_regression",
          targetColumn: "MedHouseVal",
          testSplit: 0.2,
        },
      },
      {
        id: "ex-ev-1",
        type: "evaluator",
        position: { x: 600, y: 200 },
        data: { label: "Evaluator" },
      },
    ],
    edges: [
      { id: "ex-e1", source: "ex-dl-1", target: "ex-tr-1" },
      { id: "ex-e2", source: "ex-tr-1", target: "ex-ev-1" },
    ],
  };
}
