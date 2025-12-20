import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import ProfileMenu from "../shared/ProfileMenu";
import styles from "./about.module.css";

export default function AboutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.backButton}
            title={t("about.back")}
            onClick={() => navigate("/mail")}
          >
            {t("about.back")}
          </button>
          <ProfileMenu />
        </div>
      </header>

      <section className={styles.center}>
        <div className={styles.stack}>
          <div className={styles.card}>
            <h1 className={styles.title}>{t("about.title")}</h1>
            <p className={styles.text}>{t("about.description")}</p>
            <ul className={styles.list}>
              <li>{t("about.bullets.jmap")}</li>
              <li>{t("about.bullets.localFirst")}</li>
              <li>{t("about.bullets.privacy")}</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}


