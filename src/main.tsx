import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ThemeProvider } from "./theme/ThemeContext";
import GlobalStyle from "./theme/GlobalStyle";

const branding = (import.meta.env.VITE_LOGIN_BRANDING as string | undefined)?.trim();
if (branding) document.title = branding;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <GlobalStyle />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);


