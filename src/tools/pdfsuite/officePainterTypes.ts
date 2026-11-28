/** Font bytes and shapes for the on-device Office painter, keyed by family and variant. */
export interface PainterFontVariant {
  bytes: Uint8Array;
  fk: any;
}
export interface PainterFontSet {
  regular?: PainterFontVariant;
  bold?: PainterFontVariant;
  italic?: PainterFontVariant;
  boldItalic?: PainterFontVariant;
  [variant: string]: PainterFontVariant | undefined;
}
export type PainterFontFiles = Record<string, PainterFontSet>;
export interface PainterMeta {
  Title?: string;
  Author?: string;
  Creator?: string;
  Producer?: string;
  [key: string]: string | undefined;
}
