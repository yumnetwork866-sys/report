import { useMemo, useSyncExternalStore } from 'react';
import { getStoredSession } from './session';
import vi from '../locales/vi.json';
import en from '../locales/en.json';

const LANGUAGE_STORAGE_KEY = 'content_report_language';
const DEFAULT_LANGUAGE = 'vi';
const messages = { vi, en };

function preferenceKey() {
  const session = getStoredSession();
  const userKey = session?.user?.id || session?.user?.email || session?.id || session?.email;
  return userKey ? `${LANGUAGE_STORAGE_KEY}:${userKey}` : LANGUAGE_STORAGE_KEY;
}

function isSupportedLanguage(value) {
  return Object.prototype.hasOwnProperty.call(messages, value);
}

export function getStoredLanguage() {
  try {
    const scopedKey = preferenceKey();
    const stored = localStorage.getItem(scopedKey);
    if (isSupportedLanguage(stored)) return stored;
    if (scopedKey !== LANGUAGE_STORAGE_KEY) {
      const legacy = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isSupportedLanguage(legacy)) {
        localStorage.setItem(scopedKey, legacy);
        return legacy;
      }
    }
    return DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setStoredLanguage(language) {
  const nextLanguage = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;

  try {
    localStorage.setItem(preferenceKey(), nextLanguage);
  } catch {
    // Ignore storage failures and keep the in-memory event flow working.
  }

  window.dispatchEvent(new Event('content-report-language-change'));
}

function subscribe(callback) {
  const handler = () => callback();

  window.addEventListener('storage', handler);
  window.addEventListener('content-report-language-change', handler);
  window.addEventListener('content-report-session-change', handler);

  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('content-report-language-change', handler);
      window.removeEventListener('content-report-session-change', handler);
  };
}

function getSnapshot() {
  return getStoredLanguage();
}

function getTranslation(path, language = getStoredLanguage()) {
  const locale = messages[language] || messages[DEFAULT_LANGUAGE];
  return path.split('.').reduce((current, key) => current?.[key], locale) ?? path;
}

function formatMessage(template, values = {}) {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_LANGUAGE);
}

export function useI18n() {
  const language = useLanguage();
  const t = useMemo(() => (path, values) => formatMessage(getTranslation(path, language), values), [language]);

  return {
    language,
    setLanguage: setStoredLanguage,
    t,
    isEnglish: language === 'en',
    isVietnamese: language === 'vi',
  };
}

export { getTranslation };
