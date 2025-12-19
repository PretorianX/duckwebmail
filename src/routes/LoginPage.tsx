import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import ThemeToggle from "../theme/ThemeToggle";
import ProfileMenu from "../shared/ProfileMenu";
import { useMediaQuery } from "../shared/useMediaQuery";
import styles from "./login.module.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, activeProfile, activeAuth, profiles, authByProfile, setActiveProfileId } = useAuth();
  const isMobile = useMediaQuery("(max-width: 880px)");
  const branding = (import.meta.env.VITE_LOGIN_BRANDING as string | undefined)?.trim();
  const brandingText = branding ? branding : "Pure Email";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyAuthedProfile = useMemo(() => profiles.find((p) => !!authByProfile[p.id]) ?? null, [profiles, authByProfile]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    try {
      await signIn(email, password);
      navigate("/mail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
              title="Back to inbox"
              onClick={() => {
                if (!activeAuth && anyAuthedProfile) setActiveProfileId(anyAuthedProfile.id);
                navigate("/mail");
              }}
            >
              Inbox
            </button>
          ) : null}
          <ProfileMenu />
          {isMobile ? null : <ThemeToggle />}
        </div>
      </header>

      <section className={styles.center}>
        <div className={styles.stack}>
          <div className={styles.branding}>{brandingText}</div>

          <div className={styles.card}>
            <h1 className={styles.title}>{activeAuth ? `Sign in (${activeProfile.name})` : "Sign in"}</h1>

            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <div className={styles.error}>{error}</div>}

              <label className={styles.label}>
                Email / Username
                <input
                  className={styles.input}
                  type="text"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder='e.g. "test" (or "test@domain.ote")'
                  required
                />
              </label>

              <label className={styles.label}>
                Password
                <input
                  className={styles.input}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button className={styles.primaryButton} type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Continue"}
              </button>
            </form>

            <blockquote className={styles.subtitle}>
              <q>Pure Clean emails service for you, your family and business.</q>
            </blockquote>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© {new Date().getFullYear()} mail-duck.com</footer>
    </main>
  );
}


