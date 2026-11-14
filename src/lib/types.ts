export type CategoryId =
  | 'calculators'
  | 'converters'
  | 'date'
  | 'finance'
  | 'text'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'productivity'
  | 'developer'
  | 'internet'
  | 'generators'
  | 'device'
  | 'misc';

export type ToolStatus = 'stable' | 'beta';

export interface Category {
  id: CategoryId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  accent: string;
}

export interface ToolMeta {
  /** Stable, unique, URL-safe identifier. Never reuse an id for a different tool. */
  id: string;
  name: string;
  description: string;
  category: CategoryId;
  icon: string;
  /** Extra terms used by the global search. */
  keywords: string[];
  version: string;
  status: ToolStatus;
  /** ISO date the tool was published. Drives "Recently added". */
  added: string;
  featured?: boolean;
  popular?: boolean;
  /** Tools that need room can opt out of the default narrow column. */
  layout?: 'default' | 'wide' | 'full';
}
