import uk, { type Dictionary } from "./dictionaries/uk";
import en from "./dictionaries/en";
import type { Locale } from "./config";

const DICTS: Record<Locale, Dictionary> = { uk, en };
export function getDictionary(locale: Locale): Dictionary {
  return DICTS[locale];
}
export type { Dictionary };
