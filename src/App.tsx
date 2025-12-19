import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, RequireAuth } from "./auth/AuthContext";
import LoginPage from "./routes/LoginPage";
import MailPage from "./routes/MailPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/mail"
          element={
            <RequireAuth>
              <MailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}


