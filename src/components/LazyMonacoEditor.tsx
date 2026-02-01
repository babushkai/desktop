import { lazy, Suspense, ComponentProps } from "react";

// Dynamic import for Monaco Editor (~800KB+ bundle savings)
// Rule: bundle-dynamic-imports
const MonacoEditor = lazy(() => import("@monaco-editor/react"));

type EditorProps = ComponentProps<typeof MonacoEditor>;

// Loading skeleton that matches editor dimensions
function EditorSkeleton({ height }: { height?: string | number }) {
  return (
    <div
      className="bg-slate-800/50 animate-pulse rounded-lg flex items-center justify-center"
      style={{ height: height || "150px" }}
    >
      <span className="text-xs text-slate-500">Loading editor...</span>
    </div>
  );
}

export function LazyMonacoEditor(props: EditorProps) {
  return (
    <Suspense fallback={<EditorSkeleton height={props.height} />}>
      <MonacoEditor {...props} />
    </Suspense>
  );
}
