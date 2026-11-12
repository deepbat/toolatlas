/**
 * Compile-time guarantee that the application registry and the catalogue stay
 * in sync. This file is never imported at runtime — `tsc --noEmit` checks it
 * during the build, so a tool that is catalogued but not registered (or the
 * other way round) breaks the build instead of rendering an empty page.
 */
import { TOOLS } from '../lib/catalog';
import { TOOL_COMPONENTS } from './index';

type CatalogId = (typeof TOOLS)[number]['id'];
type RegisteredId = keyof typeof TOOL_COMPONENTS;

/** Catalogued tools that have no lazy component. */
type MissingComponent = Exclude<CatalogId, RegisteredId>;

/** Registered components that are not in the catalogue. */
type OrphanComponent = Exclude<RegisteredId, CatalogId>;

type Assert<T extends true> = T;

export type RegistryIsComplete = Assert<
  [MissingComponent] extends [never] ? true : { error: 'Missing tool components'; ids: MissingComponent }
>;

export type RegistryHasNoOrphans = Assert<
  [OrphanComponent] extends [never]
    ? true
    : { error: 'Unregistered tool components'; ids: OrphanComponent }
>;

/** Runtime helper used by the tool page to detect a missing implementation. */
export function isRegistered(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_COMPONENTS, id);
}
