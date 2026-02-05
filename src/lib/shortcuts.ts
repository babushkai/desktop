/**
 * Platform-aware keyboard shortcut formatting utilities
 */

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Modern API with fallback to deprecated navigator.platform
  return (
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === 'macOS' ||
    navigator.platform.toUpperCase().includes('MAC')
  );
}

export function formatShortcut(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}
): string {
  const mac = isMac();
  const parts: string[] = [];

  if (modifiers.ctrl) parts.push(mac ? '⌘' : 'Ctrl');
  if (modifiers.shift) parts.push(mac ? '⇧' : 'Shift');
  if (modifiers.alt) parts.push(mac ? '⌥' : 'Alt');
  parts.push(key.toUpperCase());

  return mac ? parts.join('') : parts.join('+');
}

// Common shortcuts used across the app
export const SHORTCUTS = {
  toggleNodePalette: () => formatShortcut('B', { ctrl: true }),
  toggleOutput: () => formatShortcut('J', { ctrl: true }),
  togglePlayground: () => formatShortcut('P', { ctrl: true, shift: true }),
  selectAll: () => formatShortcut('A', { ctrl: true }),
  duplicate: () => formatShortcut('D', { ctrl: true }),
};
