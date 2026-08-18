import fs from "node:fs";
import path from "node:path";
import { placeholders } from "@gsc/recipes";

export interface Candidate {
  path: string;
  /** the placeholder-templated form, ready to paste into a recipe */
  template: string;
  score: number;
  files: number;
  bytes: number;
  newestMs: number;
  why: string[];
}

/** Extensions that strongly suggest a save folder rather than a cache or log dir. */
const SAVE_EXT = /\.(sav|save|dat|bin|json|xml|profile|slot|ess|es[0-9]|db|sl2|bak)$/i;
const NOISE_DIR = /^(logs?|crashes|cache|shadercache|temp|tmp|webcache|dumps|videos?|screenshots?)$/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "Detroit: Become Human" also matches "DetroitBecomeHuman" and "Detroit". */
function nameMatches(dirName: string, game: string): number {
  const d = norm(dirName), g = norm(game);
  if (!d) return 0;
  if (d === g) return 100;
  if (d.includes(g) || g.includes(d)) return 70;
  const words = game.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 3).map(norm);
  const hits = words.filter((w) => d.includes(w)).length;
  return words.length ? Math.round((hits / words.length) * 55) : 0;
}

function summarize(dir: string, depth = 0): { files: number; bytes: number; newestMs: number; saveish: number } {
  let files = 0, bytes = 0, newestMs = 0, saveish = 0;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return { files, bytes, newestMs, saveish }; }

  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth >= 3 || NOISE_DIR.test(e.name)) continue;
      const sub = summarize(abs, depth + 1);
      files += sub.files; bytes += sub.bytes; saveish += sub.saveish;
      newestMs = Math.max(newestMs, sub.newestMs);
      continue;
    }
    try {
      const st = fs.statSync(abs);
      files++; bytes += st.size;
      newestMs = Math.max(newestMs, st.mtimeMs);
      if (SAVE_EXT.test(e.name)) saveish++;
    } catch { /* locked file */ }
  }
  return { files, bytes, newestMs, saveish };
}

/** Turn an absolute path back into a recipe template using known placeholders. */
function toTemplate(abs: string): string {
  const vars = placeholders();
  const order: [string, string][] = [
    ["winSavedGames", vars.winSavedGames], ["winDocuments", vars.winDocuments],
    ["winLocalLow", vars.winLocalLow], ["winLocalAppData", vars.winLocalAppData],
    ["winAppData", vars.winAppData], ["winPublic", vars.winPublic], ["home", vars.home],
  ];
  for (const [name, value] of order) {
    if (value && abs.toLowerCase().startsWith(value.toLowerCase())) {
      return `<${name}>` + abs.slice(value.length).split(path.sep).join("/");
    }
  }
  return abs.split(path.sep).join("/");
}

/**
 * Searches the folders games actually save into and ranks what it finds.
 * Beats guessing: the answer comes from the machine that has the game installed.
 */
export function findSaveCandidates(
  game: string,
  opts: { extraRoots?: string[]; minScore?: number; installDir?: string } = {},
): Candidate[] {
  const v = placeholders();
  const roots = [
    v.winSavedGames,
    path.join(v.winDocuments, "My Games"),
    v.winDocuments,
    v.winLocalLow,
    v.winLocalAppData,
    v.winAppData,
    path.join(v.winPublic, "Documents"),
    ...(opts.extraRoots ?? []),
  ].filter(Boolean);

  const seen = new Set<string>();
  const out: Candidate[] = [];

  for (const root of roots) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const abs = path.join(root, e.name);
      if (seen.has(abs.toLowerCase())) continue;

      // publisher folders (Quantic Dream/, Team Cherry/) hold the real dir one level down
      const direct = nameMatches(e.name, game);
      const targets: { dir: string; score: number; via?: string }[] = [];
      if (direct >= 40) targets.push({ dir: abs, score: direct });
      else {
        let subs: fs.Dirent[] = [];
        try { subs = fs.readdirSync(abs, { withFileTypes: true }); } catch { /* denied */ }
        for (const s of subs) {
          if (!s.isDirectory()) continue;
          const sc = nameMatches(s.name, game);
          if (sc >= 55) targets.push({ dir: path.join(abs, s.name), score: sc - 5, via: e.name });
        }
      }

      for (const t of targets) {
        if (seen.has(t.dir.toLowerCase())) continue;
        seen.add(t.dir.toLowerCase());

        const st = summarize(t.dir);
        if (st.files === 0) continue;

        const why: string[] = [`name match ${t.score}%`];
        let score = t.score;
        if (st.saveish > 0) { score += 25; why.push(`${st.saveish} save-like files`); }
        const ageDays = (Date.now() - st.newestMs) / 86400000;
        if (ageDays < 30) { score += 20; why.push(`written ${Math.round(ageDays)}d ago`); }
        else if (ageDays < 365) { score += 8; why.push(`written ${Math.round(ageDays)}d ago`); }
        // save folders are small; a multi-hundred-MB tree is the game itself
        if (st.bytes > 200 * 1024 * 1024) { score -= 40; why.push("very large — probably game data, not saves"); }
        else if (st.bytes > 1024) { score += 5; }
        if (st.files > 400) { score -= 15; why.push(`${st.files} files — unusually many`); }
        // saves next to the executable happen, but they're the exception
        if (opts.installDir && t.dir.toLowerCase().startsWith(opts.installDir.toLowerCase())) {
          score -= 20; why.push("inside the install folder");
        }
        if (t.via) why.push(`under ${t.via}/`);

        out.push({
          path: t.dir, template: toTemplate(t.dir), score,
          files: st.files, bytes: st.bytes, newestMs: st.newestMs, why,
        });
      }
    }
  }

  return out
    .filter((c) => c.score >= (opts.minScore ?? 45))
    .sort((a, b) => b.score - a.score || b.newestMs - a.newestMs);
}

/** Emits a ready-to-paste recipe file. */
export function renderRecipe(opts: {
  id: string; name: string; steamAppId?: string; epicAppName?: string; templates: string[];
}): string {
  const platforms: string[] = [];
  const saves = opts.templates.map((t) => `        ${JSON.stringify(t)},`).join("\n");
  if (opts.steamAppId) {
    platforms.push(`    steam: {\n      appId: ${JSON.stringify(opts.steamAppId)},\n      saves: [\n${saves}\n      ],\n    },`);
  }
  if (opts.epicAppName) {
    platforms.push(`    epic: {\n      appName: ${JSON.stringify(opts.epicAppName)},\n      saves: [\n${saves}\n      ],\n    },`);
  }
  if (!platforms.length) platforms.push(`    manual: {\n      saves: [\n${saves}\n      ],\n    },`);

  return `import { defineRecipe } from "../types";

export default defineRecipe({
  id: ${JSON.stringify(opts.id)},
  name: ${JSON.stringify(opts.name)},
  platforms: {
${platforms.join("\n")}
  },
  exclude: ["**/*.log"],
});
`;
}
