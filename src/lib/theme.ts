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
    bgClass: 'bg-green-950/50',
    borderClass: 'border-green-500/50',
    accentClass: 'text-green-400',
    handleColor: '#22c55e',
  },
  script: {
    icon: FileCode2,
    bgClass: 'bg-blue-950/50',
    borderClass: 'border-blue-500/50',
    accentClass: 'text-blue-400',
    handleColor: '#3b82f6',
  },
  dataSplit: {
    icon: Scissors,
    bgClass: 'bg-pink-950/50',
    borderClass: 'border-pink-500/50',
    accentClass: 'text-pink-400',
    handleColor: '#ec4899',
  },
  trainer: {
    icon: Brain,
    bgClass: 'bg-violet-950/50',
    borderClass: 'border-violet-500/50',
    accentClass: 'text-violet-400',
    handleColor: '#8b5cf6',
  },
  evaluator: {
    icon: BarChart3,
    bgClass: 'bg-orange-950/50',
    borderClass: 'border-orange-500/50',
    accentClass: 'text-orange-400',
    handleColor: '#f97316',
  },
  modelExporter: {
    icon: Package,
    bgClass: 'bg-teal-950/50',
    borderClass: 'border-teal-500/50',
    accentClass: 'text-teal-400',
    handleColor: '#14b8a6',
  },
};

export const statusColors = {
  idle: 'border-slate-600',
  running: 'border-yellow-500 shadow-lg shadow-yellow-500/20',
  success: 'border-green-500',
  error: 'border-red-500',
};
