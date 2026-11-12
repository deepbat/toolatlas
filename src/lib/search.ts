import type { ToolMeta } from './types';
import { CATEGORY_MAP, TOOLS } from './catalog';

function haystack(tool: ToolMeta): string {
  return [
    tool.name,
    tool.description,
    CATEGORY_MAP[tool.category].name,
    tool.id.replace(/-/g, ' '),
    ...tool.keywords,
  ]
    .join(' ')
    .toLowerCase();
}

/**
 * Lightweight, dependency-free search. Every query term must appear somewhere
 * in the tool's name, description, category, id or keywords; results are ranked
 * by where the match happens.
 */
export function searchTools(query: string, source: ToolMeta[] = TOOLS): ToolMeta[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return source;

  const terms = trimmed.split(/\s+/).filter(Boolean);

  const results = source
    .map((tool) => {
      const name = tool.name.toLowerCase();
      const category = CATEGORY_MAP[tool.category].name.toLowerCase();
      const description = tool.description.toLowerCase();
      const keywords = tool.keywords.map((keyword) => keyword.toLowerCase());
      const hay = haystack(tool);

      let score = 0;
      for (const term of terms) {
        if (!hay.includes(term)) return { tool, score: -1 };
        if (name === term) score += 70;
        else if (name.startsWith(term)) score += 45;
        else if (name.includes(term)) score += 28;
        if (keywords.some((keyword) => keyword === term)) score += 20;
        else if (keywords.some((keyword) => keyword.startsWith(term))) score += 12;
        else if (keywords.some((keyword) => keyword.includes(term))) score += 6;
        if (category.includes(term)) score += 8;
        if (description.includes(term)) score += 3;
        score += 2;
      }
      if (tool.featured) score += 1;
      return { tool, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  return results.map((entry) => entry.tool);
}
