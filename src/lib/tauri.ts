import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type ScriptEvent =
  | { type: "log"; message: string }
  | { type: "progress"; current: number; total: number }
  | { type: "error"; message: string }
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
