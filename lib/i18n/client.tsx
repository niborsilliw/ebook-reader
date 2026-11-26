"use client";

import { createContext, useContext } from "react";
import { strings, type Lang, type Strings } from "./strings";

const Words = createContext<Strings>(strings("en"));

/** Set once in the root layout from the request's language. */
export function LanguageProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Words.Provider value={strings(lang)}>{children}</Words.Provider>;
}

/** The reader's words, in client components. */
export const useStrings = () => useContext(Words);
