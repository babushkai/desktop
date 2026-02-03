import { useCallback } from "react";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { ParamSpec } from "@/lib/tuningTypes";
import { getParamDisplayName } from "@/lib/searchSpaceDefaults";
import { cn } from "@/lib/utils";

interface SearchSpaceEditorProps {
  searchSpace: Record<string, ParamSpec>;
  onChange: (searchSpace: Record<string, ParamSpec>) => void;
  availableParams: string[];
  disabled?: boolean;
}

export function SearchSpaceEditor({
  searchSpace,
  onChange,
  availableParams,
  disabled,
}: SearchSpaceEditorProps) {
  const handleAddParam = useCallback(
    (paramName: string) => {
      // Default to int type with reasonable defaults
      const newSpec: ParamSpec = {
        type: "int",
        min: 1,
        max: 100,
        step: 1,
      };
      onChange({ ...searchSpace, [paramName]: newSpec });
    },
    [searchSpace, onChange]
  );

  const handleRemoveParam = useCallback(
    (paramName: string) => {
      const newSpace = { ...searchSpace };
      delete newSpace[paramName];
      onChange(newSpace);
    },
    [searchSpace, onChange]
  );

  const handleUpdateParam = useCallback(
    (paramName: string, updates: Partial<ParamSpec>) => {
      onChange({
        ...searchSpace,
        [paramName]: { ...searchSpace[paramName], ...updates },
      });
    },
    [searchSpace, onChange]
  );

  const handleTypeChange = useCallback(
    (paramName: string, newType: "int" | "float" | "categorical") => {
      let newSpec: ParamSpec;

      if (newType === "categorical") {
        newSpec = { type: "categorical", values: [] };
      } else if (newType === "float") {
        newSpec = { type: "float", min: 0.01, max: 1.0, distribution: "uniform" };
      } else {
        newSpec = { type: "int", min: 1, max: 100, step: 1 };
      }

      onChange({ ...searchSpace, [paramName]: newSpec });
    },
    [searchSpace, onChange]
  );

  const unusedParams = availableParams.filter((p) => !(p in searchSpace));

  return (
    <div className="space-y-3">
      {/* Parameter list */}
      {Object.entries(searchSpace).map(([paramName, spec]) => (
        <div key={paramName} className="p-3 bg-background rounded-lg border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-primary">
              {getParamDisplayName(paramName)}
            </span>
            <button
              onClick={() => handleRemoveParam(paramName)}
              disabled={disabled}
              className="p-1 rounded hover:bg-state-error/20 text-text-muted hover:text-state-error transition-colors disabled:opacity-50"
            >
              <RiDeleteBinLine className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Type selector */}
          <div className="flex gap-1 mb-2">
            {(["int", "float", "categorical"] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(paramName, type)}
                disabled={disabled}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition-colors",
                  spec.type === type
                    ? "bg-accent/20 text-accent"
                    : "bg-background-elevated text-text-muted hover:text-text-secondary"
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Type-specific controls */}
          {spec.type === "categorical" ? (
            <div>
              <label className="text-xs text-text-muted">
                Values (comma-separated)
              </label>
              <input
                type="text"
                value={(spec.values || []).join(", ")}
                onChange={(e) => {
                  const values = e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                    .map((v) => {
                      if (v === "null" || v === "None") return null;
                      if (v === "true") return true;
                      if (v === "false") return false;
                      const num = Number(v);
                      return isNaN(num) ? v : num;
                    });
                  handleUpdateParam(paramName, { values });
                }}
                disabled={disabled}
                className="input mt-1 text-xs h-7"
                placeholder="e.g. 10, 20, null"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-text-muted">Min</label>
                <input
                  type="number"
                  value={spec.min ?? ""}
                  onChange={(e) =>
                    handleUpdateParam(paramName, {
                      min: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  disabled={disabled}
                  className="input mt-1 text-xs h-7"
                  step={spec.type === "float" ? "0.01" : "1"}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted">Max</label>
                <input
                  type="number"
                  value={spec.max ?? ""}
                  onChange={(e) =>
                    handleUpdateParam(paramName, {
                      max: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  disabled={disabled}
                  className="input mt-1 text-xs h-7"
                  step={spec.type === "float" ? "0.01" : "1"}
                />
              </div>

              {spec.type === "int" && (
                <div className="col-span-2">
                  <label className="text-xs text-text-muted">Step</label>
                  <input
                    type="number"
                    value={spec.step ?? ""}
                    onChange={(e) =>
                      handleUpdateParam(paramName, {
                        step: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    disabled={disabled}
                    className="input mt-1 text-xs h-7"
                    min={1}
                  />
                </div>
              )}

              {spec.type === "float" && (
                <div className="col-span-2">
                  <label className="text-xs text-text-muted">Distribution</label>
                  <select
                    value={spec.distribution || "uniform"}
                    onChange={(e) =>
                      handleUpdateParam(paramName, {
                        distribution: e.target.value as "uniform" | "log",
                      })
                    }
                    disabled={disabled}
                    className="input mt-1 text-xs h-7"
                  >
                    <option value="uniform">Uniform</option>
                    <option value="log">Log-uniform</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add parameter button */}
      {unusedParams.length > 0 && (
        <div className="relative group">
          <button
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-text-muted hover:text-text-secondary border border-dashed border-white/10 hover:border-white/20 rounded-lg transition-colors disabled:opacity-50"
          >
            <RiAddLine className="w-3.5 h-3.5" />
            Add Parameter
          </button>

          {/* Dropdown menu */}
          <div className="absolute left-0 right-0 top-full mt-1 py-1 bg-background-surface border border-white/10 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 max-h-48 overflow-y-auto">
            {unusedParams.map((param) => (
              <button
                key={param}
                onClick={() => handleAddParam(param)}
                disabled={disabled}
                className="w-full px-3 py-1.5 text-xs text-left text-text-secondary hover:bg-background-elevated hover:text-text-primary transition-colors"
              >
                {getParamDisplayName(param)}
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.keys(searchSpace).length === 0 && (
        <p className="text-xs text-text-muted text-center py-2">
          No parameters configured. Add parameters to tune.
        </p>
      )}
    </div>
  );
}
