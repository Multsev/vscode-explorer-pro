import * as path from "path";
export function focusLabel(target: string, originalRoots: string[]): string {
  const roots = originalRoots.filter(root => {
    const relative = path.relative(root, target);
    return !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
  }).sort((a, b) => b.length - a.length);
  const root = roots[0];
  if (!root) return target;
  return [path.basename(root) || root, path.relative(root, target)].filter(Boolean).join(path.sep);
}
