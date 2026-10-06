export type ManagedWorkspace = { uri: string; modified: number; references: string[] };
export function cleanupCandidates(files: ManagedWorkspace[], active: string[], now: number): string[] {
  const ordered = [...files].sort((a, b) => b.modified - a.modified);
  const protectedUris = new Set([...active, ...ordered.slice(0, 20).map(file => file.uri)]);
  // Retain recursively referenced return workspaces, including references from recent inactive sessions.
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of files) if (protectedUris.has(file.uri)) for (const ref of file.references) {
      if (!protectedUris.has(ref)) { protectedUris.add(ref); changed = true; }
    }
  }
  return ordered.filter(file => !protectedUris.has(file.uri) && now - file.modified > 30 * 86400000).map(file => file.uri);
}
