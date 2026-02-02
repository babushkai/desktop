import { useCallback, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePipelineStore, NodeData } from "../stores/pipelineStore";
import { BaseNode, NodeButton, NodeText } from "./BaseNode";
import {
  RiDatabase2Line,
  RiFileLine,
  RiSearchEyeLine,
  RiLoader4Line,
  RiCheckLine,
} from "@remixicon/react";
import { generateDataProfileScript } from "@/lib/dataProfileCodeGen";
import { runScript, listenToScriptOutput, ScriptEvent } from "@/lib/tauri";
import { cn } from "@/lib/utils";

export function DataLoaderNode({ id, data, selected: isSelected }: NodeProps) {
  const nodeData = data as NodeData;
  const updateNodeData = usePipelineStore((state) => state.updateNodeData);
  const executionStatus = usePipelineStore((state) => state.executionStatus);
  const profilingStatus = usePipelineStore(
    (state) => state.profilingStatus[id] || "idle"
  );
  const profile = usePipelineStore((state) => state.dataProfiles[id]);
  const setDataProfile = usePipelineStore((state) => state.setDataProfile);
  const setProfilingStatus = usePipelineStore(
    (state) => state.setProfilingStatus
  );
  const setProfilingNodeId = usePipelineStore(
    (state) => state.setProfilingNodeId
  );
  const clearDataProfile = usePipelineStore((state) => state.clearDataProfile);
  const appendLog = usePipelineStore((state) => state.appendLog);

  // Listen for dataProfile events
  useEffect(() => {
    const unlisten = listenToScriptOutput((event: ScriptEvent) => {
      if (event.type === "dataProfile" && event.nodeId === id) {
        setDataProfile(id, event.data);
        setProfilingStatus(id, "complete");
        setProfilingNodeId(null);
      } else if (event.type === "error") {
        // Only handle error if this node is currently profiling
        const currentProfilingNodeId =
          usePipelineStore.getState().profilingNodeId;
        if (currentProfilingNodeId === id) {
          setProfilingStatus(id, "error");
          setProfilingNodeId(null);
        }
      } else if (event.type === "log") {
        // Forward profiling logs to output panel
        const currentProfilingNodeId =
          usePipelineStore.getState().profilingNodeId;
        if (currentProfilingNodeId === id) {
          appendLog(event.message);
        }
      } else if (event.type === "progress") {
        // Log progress during profiling
        const currentProfilingNodeId =
          usePipelineStore.getState().profilingNodeId;
        if (currentProfilingNodeId === id) {
          appendLog(`Profiling column ${event.current}/${event.total}...`);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [id, setDataProfile, setProfilingStatus, setProfilingNodeId, appendLog]);

  const handleSelectFile = useCallback(async () => {
    const selectedFile = await open({
      multiple: false,
      filters: [
        {
          name: "Data Files",
          extensions: ["csv", "json", "parquet", "txt"],
        },
      ],
    });

    if (selectedFile && typeof selectedFile === "string") {
      updateNodeData(id, { filePath: selectedFile });
      // Clear stale profile when file changes
      clearDataProfile(id);
    }
  }, [id, updateNodeData, clearDataProfile]);

  const handleProfile = useCallback(async () => {
    if (!nodeData.filePath) return;

    // Clear logs and set profiling state
    usePipelineStore.getState().clearLogs();
    setProfilingNodeId(id);
    setProfilingStatus(id, "profiling");
    appendLog("--- Data Profiling ---");
    appendLog(`File: ${nodeData.filePath}`);
    appendLog("");

    try {
      const script = generateDataProfileScript(id);
      // filePath passed as argv[1] by runScript (safe from injection)
      await runScript(script, nodeData.filePath);
    } catch (error) {
      appendLog(`ERROR: ${error}`);
      setProfilingStatus(id, "error");
      setProfilingNodeId(null);
    }
  }, [id, nodeData.filePath, setProfilingNodeId, setProfilingStatus, appendLog]);

  const fileName = nodeData.filePath?.split("/").pop();

  // Disable profiling during pipeline execution or when already profiling
  const isProfileDisabled =
    !nodeData.filePath ||
    profilingStatus === "profiling" ||
    executionStatus === "running";

  return (
    <BaseNode
      variant="dataloader"
      title="Data Loader"
      icon={RiDatabase2Line}
      isSelected={isSelected}
      hasOutput
      minWidth={200}
    >
      <NodeButton onClick={handleSelectFile} className="flex items-center gap-2">
        <RiFileLine className="w-3.5 h-3.5" />
        {fileName || "Select file..."}
      </NodeButton>

      {nodeData.filePath && (
        <>
          <NodeText className="truncate max-w-[200px]" title={nodeData.filePath}>
            {nodeData.filePath}
          </NodeText>

          {/* Profile button */}
          <button
            onClick={handleProfile}
            disabled={isProfileDisabled}
            className={cn(
              "nodrag w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md",
              "bg-background border border-white/10",
              "transition-colors duration-150",
              isProfileDisabled
                ? "opacity-50 cursor-not-allowed text-text-muted"
                : "hover:bg-background-elevated hover:text-text-primary text-text-secondary"
            )}
          >
            {profilingStatus === "profiling" ? (
              <>
                <RiLoader4Line className="w-3.5 h-3.5 animate-spin" />
                Profiling...
              </>
            ) : (
              <>
                <RiSearchEyeLine className="w-3.5 h-3.5" />
                Profile Data
              </>
            )}
          </button>

          {/* Status indicator */}
          {profile && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
              <RiCheckLine className="w-3 h-3 text-state-success" />
              <span>
                {profile.rowCount.toLocaleString()} rows, {profile.columnCount}{" "}
                cols
                {profile.sampled && " (sampled)"}
              </span>
            </div>
          )}
        </>
      )}
    </BaseNode>
  );
}
