import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useMediaQuery } from "../shared/useMediaQuery";
import MobileSelectSheet from "../shared/MobileSelectSheet";
import ProfileMenu from "../shared/ProfileMenu";
import { useLanguage } from "../i18n/LanguageContext";
import type { SupportedLanguage } from "../i18n/i18n";
import { useTimezone } from "../time/TimezoneContext";
import { TIMEZONE_OPTIONS, type TimeZoneId } from "../time/timezones";
import { THEME_SCHEMES, type ThemeSchemeId } from "../theme/schemes";
import { useTheme } from "../theme/ThemeContext";
import styles from "./settings.module.css";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
  uk: "Українська",
  ru: "Русский"
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 880px)");

  const { themePreference, setThemePreference, scheme, setScheme } = useTheme();
  const { language, setLanguage, supportedLanguages } = useLanguage();
  const { timeZone, setTimeZone } = useTimezone();

  const supportedTimeZoneOptions = useMemo(() => TIMEZONE_OPTIONS, []);
  const supportedSchemeOptions = useMemo(
    () =>
      (Object.values(THEME_SCHEMES) as Array<{ id: ThemeSchemeId; label: string }>).map((s) => ({ id: s.id, label: s.label })),
    []
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.backButton}
            title={t("settings.back")}
            onClick={() => navigate("/mail")}
          >
            {t("settings.back")}
          </button>
          <ProfileMenu />
        </div>
      </header>

      <section className={styles.center}>
        <div className={styles.stack}>
          <div className={styles.card}>
            <h1 className={styles.title}>{t("settings.title")}</h1>

            <div className={styles.grid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-theme">
                  {t("settings.themeMode")}
                </label>
                {isMobile ? (
                  <MobileSelectSheet
                    id="settings-theme"
                    title={t("settings.themeMode")}
                    value={themePreference}
                    options={[
                      { value: "system", label: t("settings.themeModeSystem") },
                      { value: "light", label: t("settings.themeModeLight") },
                      { value: "dark", label: t("settings.themeModeDark") }
                    ]}
                    onChange={(v) => setThemePreference(v as "system" | "light" | "dark")}
                  />
                ) : (
                  <select
                    id="settings-theme"
                    className={styles.select}
                    value={themePreference}
                    onChange={(e) => setThemePreference(e.target.value as "system" | "light" | "dark")}
                  >
                    <option value="system">{t("settings.themeModeSystem")}</option>
                    <option value="light">{t("settings.themeModeLight")}</option>
                    <option value="dark">{t("settings.themeModeDark")}</option>
                  </select>
                )}
                <div className={styles.hint}>{t("settings.themeModeHint")}</div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-scheme">
                  {t("settings.themeScheme")}
                </label>
                {isMobile ? (
                  <MobileSelectSheet
                    id="settings-scheme"
                    title={t("settings.themeScheme")}
                    value={scheme}
                    options={supportedSchemeOptions.map((s) => ({ value: s.id, label: s.label }))}
                    onChange={(v) => setScheme(v as ThemeSchemeId)}
                  />
                ) : (
                  <select
                    id="settings-scheme"
                    className={styles.select}
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value as ThemeSchemeId)}
                  >
                    {supportedSchemeOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-language">
                  {t("settings.language")}
                </label>
                {isMobile ? (
                  <MobileSelectSheet
                    id="settings-language"
                    title={t("settings.language")}
                    value={language}
                    options={supportedLanguages.map((lng) => ({ value: lng, label: LANGUAGE_LABELS[lng] }))}
                    onChange={(v) => setLanguage(v as SupportedLanguage)}
                  />
                ) : (
                  <select
                    id="settings-language"
                    className={styles.select}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                  >
                    {supportedLanguages.map((lng) => (
                      <option key={lng} value={lng}>
                        {LANGUAGE_LABELS[lng]}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-timezone">
                  {t("settings.timezone")}
                </label>
                {isMobile ? (
                  <MobileSelectSheet
                    id="settings-timezone"
                    title={t("settings.timezone")}
                    value={timeZone}
                    options={supportedTimeZoneOptions.map((tz) => ({ value: tz.id, label: tz.label }))}
                    onChange={(v) => setTimeZone(v as TimeZoneId)}
                  />
                ) : (
                  <select
                    id="settings-timezone"
                    className={styles.select}
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value as TimeZoneId)}
                  >
                    {supportedTimeZoneOptions.map((tz) => (
                      <option key={tz.id} value={tz.id}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                )}
                <div className={styles.hint}>{t("settings.timezoneHint")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}


