import { useState, useEffect, useCallback, Fragment } from "react";
import { useReactFlow } from "@xyflow/react";
import { Menu, Transition } from "@headlessui/react";
import {
  RiZoomInLine,
  RiZoomOutLine,
  RiFocus3Line,
  RiArrowDownSLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200] as const;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

export function ZoomControls() {
  const reactFlowInstance = useReactFlow();
  const [zoom, setZoom] = useState(1);

  // Subscribe to viewport changes to keep zoom in sync
  useEffect(() => {
    const updateZoom = () => {
      const currentZoom = reactFlowInstance.getZoom();
      setZoom(currentZoom);
    };

    // Initial zoom
    updateZoom();

    // Poll for zoom changes (ReactFlow doesn't expose a zoom change event directly)
    const interval = setInterval(updateZoom, 100);
    return () => clearInterval(interval);
  }, [reactFlowInstance]);

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(zoom + ZOOM_STEP, MAX_ZOOM);
    reactFlowInstance.zoomTo(newZoom, { duration: 200 });
  }, [reactFlowInstance, zoom]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(zoom - ZOOM_STEP, MIN_ZOOM);
    reactFlowInstance.zoomTo(newZoom, { duration: 200 });
  }, [reactFlowInstance, zoom]);

  const handleZoomPreset = useCallback(
    (preset: number) => {
      reactFlowInstance.zoomTo(preset / 100, { duration: 200 });
    },
    [reactFlowInstance]
  );

  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ duration: 200, padding: 0.1 });
  }, [reactFlowInstance]);

  const zoomPercentage = Math.round(zoom * 100);
  const canZoomOut = zoom > MIN_ZOOM;
  const canZoomIn = zoom < MAX_ZOOM;

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-background-elevated border border-white/10 rounded-lg p-1 shadow-lg z-10">
      {/* Zoom out button */}
      <button
        onClick={handleZoomOut}
        disabled={!canZoomOut}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          canZoomOut
            ? "text-text-secondary hover:text-text-primary hover:bg-white/5"
            : "text-text-muted cursor-not-allowed opacity-50"
        )}
        title="Zoom out"
      >
        <RiZoomOutLine className="w-4 h-4" />
      </button>

      {/* Zoom percentage dropdown */}
      <Menu as="div" className="relative">
        <Menu.Button
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium",
            "text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors",
            "min-w-[60px] justify-center"
          )}
        >
          <span>{zoomPercentage}%</span>
          <RiArrowDownSLine className="w-3 h-3" />
        </Menu.Button>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute bottom-full left-0 mb-1 w-24 origin-bottom-left rounded-lg bg-background-elevated border border-white/10 shadow-lg focus:outline-none overflow-hidden">
            {ZOOM_PRESETS.map((preset) => (
              <Menu.Item key={preset}>
                {({ active }) => (
                  <button
                    onClick={() => handleZoomPreset(preset)}
                    className={cn(
                      "w-full px-3 py-2 text-sm text-left transition-colors",
                      active
                        ? "bg-white/5 text-text-primary"
                        : "text-text-secondary",
                      zoomPercentage === preset && "text-accent font-medium"
                    )}
                  >
                    {preset}%
                  </button>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
        </Transition>
      </Menu>

      {/* Zoom in button */}
      <button
        onClick={handleZoomIn}
        disabled={!canZoomIn}
        className={cn(
          "p-1.5 rounded-md transition-colors",
          canZoomIn
            ? "text-text-secondary hover:text-text-primary hover:bg-white/5"
            : "text-text-muted cursor-not-allowed opacity-50"
        )}
        title="Zoom in"
      >
        <RiZoomInLine className="w-4 h-4" />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Fit to view button */}
      <button
        onClick={handleFitView}
        className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
        title="Fit to view"
      >
        <RiFocus3Line className="w-4 h-4" />
      </button>
    </div>
  );
}
