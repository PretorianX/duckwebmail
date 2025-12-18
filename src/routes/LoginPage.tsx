import { useNavigate } from "react-router-dom";

import ThemeToggle from "../theme/ThemeToggle";
import styles from "./login.module.css";

export default function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>RayMap Webmail</div>
        <ThemeToggle />
      </header>

      <section className={styles.card}>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>Your mail, private by default.</p>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            navigate("/mail");
          }}
        >
          <label className={styles.label}>
            Email
            <input className={styles.input} type="email" name="email" autoComplete="email" required />
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

          <button className={styles.primaryButton} type="submit">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}


