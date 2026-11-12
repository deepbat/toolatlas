import { TOOL_MAP } from './catalog';

export interface Workspace { id: string; name: string; tools: string[] }
export const WS_KEY = 'toolatlas:workspaces';
export const MAX_WORKSPACES = 30;
export const MAX_TOOLS = 40;

export function cleanName(name: string): string {
  const n = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  if (!n) throw Error('Give the workspace a name.');
  return n;
}

/** Parse an exported file. Unknown tool ids are dropped, shapes are checked, sizes are capped. */
export function parseWorkspaces(text: string): Workspace[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw Error('This file is not valid JSON.'); }
  const list = Array.isArray(data) ? data : (data as { workspaces?: unknown })?.workspaces;
  if (!Array.isArray(list)) throw Error('This file does not look like a ToolAtlas workspace export.');
  const out: Workspace[] = [];
  for (const w of list.slice(0, MAX_WORKSPACES)) {
    if (!w || typeof w !== 'object' || typeof (w as Workspace).name !== 'string' || !Array.isArray((w as Workspace).tools)) continue;
    let name: string;
    try { name = cleanName((w as Workspace).name); } catch { continue; }
    const tools = [...new Set((w as Workspace).tools.filter((t): t is string => typeof t === 'string' && !!TOOL_MAP[t]))].slice(0, MAX_TOOLS);
    out.push({ id: crypto.randomUUID(), name, tools });
  }
  if (!out.length) throw Error('No usable workspaces were found in this file.');
  return out;
}
