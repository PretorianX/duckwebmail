import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "./routes/LoginPage";
import MailPage from "./routes/MailPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mail" element={<MailPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}


