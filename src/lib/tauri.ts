import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface MetricsData {
  modelType: "classifier" | "regressor";
  // Classification metrics
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  confusionMatrix?: number[][];
  // Regression metrics
  r2?: number;
  mse?: number;
  rmse?: number;
  mae?: number;
}

export type ScriptEvent =
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number }
  | { type: "error"; message: string }
  | { type: "metrics"; modelType: string; data: MetricsData }
  | { type: "complete" }
  | { type: "exit"; code: number };

export async function getPythonPath(): Promise<string | null> {
  return invoke<string | null>("get_python_path");
}

export async function setPythonPath(path: string): Promise<void> {
  return invoke("set_python_path", { path });
}

export async function findPython(): Promise<string | null> {
  return invoke<string | null>("find_python");
}

export async function runScript(scriptCode: string, inputPath: string): Promise<void> {
  return invoke("run_script", { scriptCode, inputPath });
}

export async function cancelScript(): Promise<void> {
  return invoke("cancel_script");
}

export async function listenToScriptOutput(
  callback: (event: ScriptEvent) => void
): Promise<UnlistenFn> {
  return listen<ScriptEvent>("script-output", (event) => {
    callback(event.payload);
  });
}

export async function runScriptAndWait(
  scriptCode: string,
  inputPath: string,
  onOutput?: (event: ScriptEvent) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    let unlistener: UnlistenFn | undefined;

    listenToScriptOutput((event) => {
      onOutput?.(event);
      if (event.type === "exit") {
        unlistener?.();
        if (event.code === 0) {
          resolve(event.code);
        } else {
          reject(new Error(`Script exited with code ${event.code}`));
        }
      }
    }).then((unlisten) => {
      unlistener = unlisten;
      runScript(scriptCode, inputPath).catch(reject);
    });
  });
}

// Pipeline CRUD

export interface PipelineMetadata {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function savePipeline(id: string, name: string, data: string): Promise<void> {
  return invoke("save_pipeline", { id, name, data });
}

export async function loadPipeline(id: string): Promise<string | null> {
  return invoke<string | null>("load_pipeline", { id });
}

export async function listPipelines(): Promise<PipelineMetadata[]> {
  return invoke<PipelineMetadata[]>("list_pipelines");
}

export async function deletePipeline(id: string): Promise<void> {
  return invoke("delete_pipeline", { id });
}
