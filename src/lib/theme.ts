import {
  FolderOpen,
  FileCode2,
  Scissors,
  Brain,
  BarChart3,
  Package,
  LucideIcon,
} from 'lucide-react';

interface NodeTheme {
  icon: LucideIcon;
  bgClass: string;
  borderClass: string;
  accentClass: string;
  handleColor: string;
}

export const nodeConfig: Record<string, NodeTheme> = {
  dataLoader: {
    icon: FolderOpen,
    bgClass: 'bg-emerald-950/30',
    borderClass: 'border-emerald-500/30',
    accentClass: 'text-emerald-400',
    handleColor: '#34d399',
  },
  script: {
    icon: FileCode2,
    bgClass: 'bg-sky-950/30',
    borderClass: 'border-sky-500/30',
    accentClass: 'text-sky-400',
    handleColor: '#38bdf8',
  },
  dataSplit: {
    icon: Scissors,
    bgClass: 'bg-fuchsia-950/30',
    borderClass: 'border-fuchsia-500/30',
    accentClass: 'text-fuchsia-400',
    handleColor: '#e879f9',
  },
  trainer: {
    icon: Brain,
    bgClass: 'bg-purple-950/30',
    borderClass: 'border-purple-500/30',
    accentClass: 'text-purple-400',
    handleColor: '#c084fc',
  },
  evaluator: {
    icon: BarChart3,
    bgClass: 'bg-amber-950/30',
    borderClass: 'border-amber-500/30',
    accentClass: 'text-amber-400',
    handleColor: '#fbbf24',
  },
  modelExporter: {
    icon: Package,
    bgClass: 'bg-cyan-950/30',
    borderClass: 'border-cyan-500/30',
    accentClass: 'text-cyan-400',
    handleColor: '#22d3ee',
  },
};

export const statusColors = {
  idle: 'border-slate-600/50',
  running: 'border-amber-500/60 shadow-lg shadow-amber-500/20',
  success: 'border-emerald-500/60',
  error: 'border-red-500/60',
};
