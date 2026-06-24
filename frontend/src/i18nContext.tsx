import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import en from './locales/en';
import zh from './locales/zh';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Language = 'en' | 'zh';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const dictionaries: Record<Language, Record<string, unknown>> = { en, zh };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const I18nContext = createContext<I18nContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helper: resolve nested key like "nav.overview" from dictionary
// ---------------------------------------------------------------------------

function resolveKey(dict: Record<string, unknown>, key: string): string {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key; // fallback: return the key itself
    }
  }
  return typeof current === 'string' ? current : key;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem('xcloud_lang');
    if (stored === 'zh' || stored === 'en') return stored;
    return 'en';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('xcloud_lang', lang);
  }, []);

  const t = useCallback(
    (key: string): string => {
      return resolveKey(dictionaries[language], key);
    },
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
