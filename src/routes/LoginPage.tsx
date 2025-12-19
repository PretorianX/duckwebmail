import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import ThemeToggle from "../theme/ThemeToggle";
import ProfileMenu from "../shared/ProfileMenu";
import { useMediaQuery } from "../shared/useMediaQuery";
import styles from "./login.module.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, activeProfile } = useAuth();
  const isMobile = useMediaQuery("(max-width: 880px)");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <div className={styles.brand}>🦆 DuckWebmail</div>
        <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
          <ProfileMenu />
          {isMobile ? null : <ThemeToggle />}
        </div>
      </header>

      <section className={styles.card}>
        <h1 className={styles.title}>Sign in ({activeProfile.name})</h1>
        <p className={styles.subtitle}>Your mail, private by default.</p>

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
      </section>
    </main>
  );
}


