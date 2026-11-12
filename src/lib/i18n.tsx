import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'hi' | 'pa';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
  { id: 'pa', label: 'ਪੰਜਾਬੀ' },
];
const KEY = 'toolatlas:lang';

// Navigation and key labels only. Tool names and descriptions stay in English for now.
const TEXT = {
  allTools: { en: 'All tools', hi: 'सभी टूल', pa: 'ਸਾਰੇ ਟੂਲ' },
  categories: { en: 'Categories', hi: 'श्रेणियाँ', pa: 'ਸ਼੍ਰੇਣੀਆਂ' },
  favourites: { en: 'Favourites', hi: 'पसंदीदा', pa: 'ਪਸੰਦੀਦਾ' },
  recent: { en: 'Recently used', hi: 'हाल में उपयोग किए', pa: 'ਹਾਲ ਵਿੱਚ ਵਰਤੇ' },
  workspaces: { en: 'Workspaces', hi: 'वर्कस्पेस', pa: 'ਵਰਕਸਪੇਸ' },
  freeApps: { en: 'Free apps', hi: 'मुफ़्त ऐप', pa: 'ਮੁਫ਼ਤ ਐਪ' },
  offline: { en: 'Offline and install', hi: 'ऑफ़लाइन और इंस्टॉल', pa: 'ਔਫ਼ਲਾਈਨ ਅਤੇ ਇੰਸਟਾਲ' },
  about: { en: 'About', hi: 'परिचय', pa: 'ਜਾਣ-ਪਛਾਣ' },
  search: { en: 'Search', hi: 'खोजें', pa: 'ਖੋਜੋ' },
  language: { en: 'Language', hi: 'भाषा', pa: 'ਭਾਸ਼ਾ' },
} as const;
export type TextKey = keyof typeof TEXT;
export const TRANSLATION_KEYS = Object.keys(TEXT) as TextKey[];
export const translation = (key: TextKey, lang: Lang) => TEXT[key][lang];

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { const v = localStorage.getItem(KEY); return v === 'hi' || v === 'pa' ? v : 'en'; } catch { return 'en'; }
  });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* storage full or blocked */ } };
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}
export function useT() {
  const { lang, setLang } = useContext(Ctx);
  return { lang, setLang, t: (key: TextKey) => translation(key, lang) };
}
