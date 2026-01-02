import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isAuthError, useAuth } from "../auth/AuthContext";
import ThemeToggle from "../theme/ThemeToggle";
import ProfileMenu from "../shared/ProfileMenu";
import { useMediaQuery } from "../shared/useMediaQuery";
import { getDeployEnv } from "../config/deployEnv";
import styles from "./login.module.css";

function toUserFacingLoginError(err: unknown, t: (key: string, options?: Record<string, unknown>) => string): { message: string; focusPassword: boolean } {
  if (isAuthError(err)) {
    switch (err.kind) {
      case "invalid_credentials":
        return { message: t("login.errors.invalidCredentials"), focusPassword: true };
      case "network":
        return { message: t("login.errors.network"), focusPassword: false };
      case "server":
        return { message: t("login.errors.server"), focusPassword: false };
      case "unexpected":
      default:
        return { message: t("login.errors.unexpected"), focusPassword: false };
    }
  }
  return { message: t("login.errors.unexpected"), focusPassword: false };
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn, activeProfile, activeAuth, profiles, authByProfile, setActiveProfileId } = useAuth();
  const isMobile = useMediaQuery("(max-width: 880px)");
  const branding = getDeployEnv("VITE_LOGIN_BRANDING")?.trim();
  const brandingText = branding ? branding : t("login.brandingDefault");
  const tagline = getDeployEnv("VITE_LOGIN_TAGLINE")?.trim();
  const taglineText = tagline ? tagline : t("login.taglineDefault");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const errorRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const anyAuthedProfile = useMemo(() => profiles.find((p) => !!authByProfile[p.id]) ?? null, [profiles, authByProfile]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
  }, [error]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    try {
      await signIn(email.trim(), password);
      navigate("/mail");
    } catch (err) {
      const mapped = toUserFacingLoginError(err, t);
      setError(mapped.message);
      if (mapped.focusPassword) {
        void Promise.resolve().then(() => {
          passwordRef.current?.focus();
          passwordRef.current?.select();
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerActions}>
          {anyAuthedProfile ? (
            <button
              type="button"
              className={styles.backToInbox}
              title={t("login.backToInbox")}
              onClick={() => {
                if (!activeAuth && anyAuthedProfile) setActiveProfileId(anyAuthedProfile.id);
                navigate("/mail");
              }}
            >
              {t("common.inbox")}
            </button>
          ) : null}
          {anyAuthedProfile ? <ProfileMenu /> : null}
          {isMobile ? null : <ThemeToggle />}
        </div>
      </header>

      <section className={styles.center}>
        <div className={styles.stack}>
          <div className={styles.branding}>{brandingText}</div>

          <div className={styles.card}>
            <h1 className={styles.title}>
              {activeAuth ? t("login.signInWithProfile", { name: activeProfile.name }) : t("login.signIn")}
            </h1>

            <form className={styles.form} onSubmit={handleSubmit} aria-busy={loading}>
              {error && (
                <div ref={errorRef} className={styles.error} role="alert" aria-live="assertive" tabIndex={-1}>
                  {error}
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-email">
                  {t("login.emailUsername")}
                </label>
                <input
                  ref={emailRef}
                  id="login-email"
                  className={styles.input}
                  type="text"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder={t("login.emailPlaceholder")}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-password">
                  {t("login.password")}
                </label>
                <div className={styles.passwordRow}>
                  <input
                    ref={passwordRef}
                    id="login-password"
                    className={`${styles.input} ${styles.passwordInput}`}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword((p) => !p)}
                    aria-controls="login-password"
                    aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className={styles.passwordIcon} /> : <Eye aria-hidden="true" className={styles.passwordIcon} />}
                  </button>
                </div>
              </div>

              <button className={styles.primaryButton} type="submit" disabled={loading}>
                {loading ? t("login.signingIn") : t("common.continue")}
              </button>
            </form>

            <p className={styles.subtitle}>
              <q>{taglineText}</q>
            </p>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© {new Date().getFullYear()} mail-duck.com</footer>
    </main>
  );
}


