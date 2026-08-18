/**
 * Minimal Valve KeyValues parser. Handles the nested-object + quoted-string
 * subset that libraryfolders.vdf and appmanifest_*.acf actually use.
 */
export function parseVdf(text: string): Record<string, any> {
  const root: Record<string, any> = {};
  const stack: Record<string, any>[] = [root];
  let pendingKey: string | null = null;

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("//")) continue;

    if (t === "{") {
      const obj: Record<string, any> = {};
      if (pendingKey !== null) stack[stack.length - 1][pendingKey] = obj;
      stack.push(obj);
      pendingKey = null;
      continue;
    }
    if (t === "}") { stack.pop(); continue; }

    const pair = t.match(/^"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"$/);
    if (pair) { stack[stack.length - 1][pair[1]] = pair[2]; continue; }

    const key = t.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (key) pendingKey = key[1];
  }
  return root;
}
