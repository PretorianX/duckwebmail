import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, RequireAuth, useAuth } from "./auth/AuthContext";
import LoginPage from "./routes/LoginPage";
import MailPage from "./routes/MailPage";

function HomeRedirect() {
  const { activeAuth, rehydrating } = useAuth();
  if (rehydrating) {
    return (
      <div style={{ padding: 16, color: "var(--text-color)" }} aria-live="polite">
        Restoring session…
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


