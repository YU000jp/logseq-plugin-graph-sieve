import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// 言語jsonファイルのimport
import translation_en from "./en.json";
import translation_ja from "./ja.json";
import translation_de from "./de.json";
import translation_fr from "./fr.json";
import translation_zhCN from "./zh-CN.json";
import translation_zhTW from "./zh-TW.json";
import translation_ko from "./ko.json";

const resources = {
    ja: { translation: translation_ja },
    en: { translation: translation_en },
    de: { translation: translation_de },
    fr: { translation: translation_fr },
    'zh-CN': { translation: translation_zhCN },
    'zh-TW': { translation: translation_zhTW },
    ko: { translation: translation_ko },
} as const;

i18n
    .use(initReactI18next)
    .init({
        resources,
    fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        }
    });

export default i18n;