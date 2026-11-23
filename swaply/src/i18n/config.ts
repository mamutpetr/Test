export const LOCALES = ["uk", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uk";
export const isLocale = (v: string | undefined | null): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);
/** To add a language: add it here, create dictionaries/<code>.ts typed as Dictionary, register in index.ts. */
