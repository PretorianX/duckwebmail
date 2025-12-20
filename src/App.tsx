import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthProvider, RequireAuth, useAuth } from "./auth/AuthContext";
import LoginPage from "./routes/LoginPage";
import MailPage from "./routes/MailPage";

function HomeRedirect() {
  const { t } = useTranslation();
  const { activeAuth, rehydrating } = useAuth();
  if (rehydrating) {
    return (
      <div style={{ padding: 16, color: "var(--text-color)" }} aria-live="polite">
        {t("app.restoringSession")}
      </div>
    );
  }
  return <Navigate to={activeAuth ? "/mail" : "/login"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/mail"
          element={
            <RequireAuth>
              <MailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </AuthProvider>
  );
}


