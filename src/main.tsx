import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./i18n/i18n";
import App from "./App";
import { LanguageProvider } from "./i18n/LanguageContext";
import { TimezoneProvider } from "./time/TimezoneContext";
import { ThemeProvider } from "./theme/ThemeContext";
import GlobalStyle from "./theme/GlobalStyle";

const branding = (import.meta.env.VITE_LOGIN_BRANDING as string | undefined)?.trim();
if (branding) document.title = branding;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <TimezoneProvider>
          <GlobalStyle />
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </TimezoneProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);


