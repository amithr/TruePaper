import type en from "@/messages/en.json";

/** Shape of the translation dictionary — derived from the English source file. */
export type Dictionary = typeof en;

type NestedPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? P extends ""
      ? K
      : `${P}.${K}`
    : NestedPaths<T[K], P extends "" ? K : `${P}.${K}`>;
}[keyof T & string];

export type TranslationPath = NestedPaths<Dictionary>;

/** Replace `{name}` placeholders in a translated string. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
