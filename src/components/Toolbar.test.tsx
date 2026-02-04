import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toolbar } from "./Toolbar";
import { usePipelineStore } from "../stores/pipelineStore";

// Mock tauri APIs
vi.mock("../lib/tauri", () => ({
  getPythonPath: vi.fn(() => Promise.resolve("/usr/bin/python3")),
  findPython: vi.fn(() =>
    Promise.resolve({ path: "/usr/bin/python3", version: "3.11.9", is_bundled: false })
  ),
  setPythonPath: vi.fn(() => Promise.resolve()),
  runScript: vi.fn(() => Promise.resolve()),
  cancelScript: vi.fn(() => Promise.resolve()),
  listenToScriptOutput: vi.fn(() => Promise.resolve(() => {})),
  listPipelines: vi.fn(() => Promise.resolve([])),
  deletePipeline: vi.fn(() => Promise.resolve()),
  savePipeline: vi.fn(() => Promise.resolve()),
  loadPipeline: vi.fn(() => Promise.resolve(null)),
}));

// Default props for Toolbar component
const defaultProps = {
  showNodePalette: true,
  showOutputPanel: true,
  onToggleNodePalette: vi.fn(),
  onToggleOutputPanel: vi.fn(),
};

describe("Toolbar", () => {
  beforeEach(() => {
    // Reset store state
    usePipelineStore.setState({
      nodes: [],
      edges: [],
      executionStatus: "idle",
      outputLogs: [],
      pythonPath: null,
      validationErrors: [],
      currentPipelineId: null,
      currentPipelineName: null,
      isDirty: false,
    });
  });

  describe("Save Dialog", () => {
    it("shows save dialog when clicking Save with no pipeline name", async () => {
      render(<Toolbar {...defaultProps} />);

      const saveButton = screen.getByRole("button", { name: /^save$/i });
      fireEvent.click(saveButton);

      // Dialog should appear
      expect(screen.getByText("Save Pipeline")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter pipeline name...")).toBeInTheDocument();
    });

    it("closes save dialog when clicking Cancel", async () => {
      render(<Toolbar {...defaultProps} />);

      // Open dialog
      const saveButton = screen.getByRole("button", { name: /^save$/i });
      fireEvent.click(saveButton);

      expect(screen.getByText("Save Pipeline")).toBeInTheDocument();

      // Click cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText("Save Pipeline")).not.toBeInTheDocument();
      });
    });

    it("saves directly when pipeline already has a name", async () => {
      // Set pipeline name
      usePipelineStore.setState({
        currentPipelineName: "Existing Pipeline",
        currentPipelineId: "existing-id",
      });

      render(<Toolbar {...defaultProps} />);

      const saveButton = screen.getByRole("button", { name: /^save$/i });
      fireEvent.click(saveButton);

      // Dialog should NOT appear (saves directly)
      expect(screen.queryByText("Save Pipeline")).not.toBeInTheDocument();
    });

    it("shows dirty indicator when pipeline is modified", () => {
      usePipelineStore.setState({
        currentPipelineName: "My Pipeline",
        isDirty: true,
      });

      render(<Toolbar {...defaultProps} />);

      // Should show pipeline name and asterisk (asterisk is in separate span for warning color)
      expect(screen.getByText(/My Pipeline/)).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument();
    });

    it("shows 'Untitled *' when dirty with no name", () => {
      usePipelineStore.setState({
        currentPipelineName: null,
        isDirty: true,
      });

      render(<Toolbar {...defaultProps} />);

      // Asterisk is in a separate span for warning color
      expect(screen.getByText(/Untitled/)).toBeInTheDocument();
      expect(screen.getByText("*")).toBeInTheDocument();
    });
  });

  describe("Run button", () => {
    it("is disabled when no runnable pipeline", () => {
      render(<Toolbar {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /run/i });
      expect(runButton).toBeDisabled();
    });

    it("is enabled when pipeline has script and dataLoader with file", () => {
      usePipelineStore.setState({
        nodes: [
          { id: "dl-1", type: "dataLoader", position: { x: 0, y: 0 }, data: { label: "DL", filePath: "/test.csv" } },
          { id: "sc-1", type: "script", position: { x: 100, y: 0 }, data: { label: "Script", code: "print(1)" } },
        ],
        edges: [{ id: "e1", source: "dl-1", target: "sc-1" }],
      });

      render(<Toolbar {...defaultProps} />);

      const runButton = screen.getByRole("button", { name: /run/i });
      expect(runButton).not.toBeDisabled();
    });
  });
});
