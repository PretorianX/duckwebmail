import { createGlobalStyle } from "styled-components";

import { schemeCss } from "./schemes";

const GlobalStyle = createGlobalStyle`
  :root {
    /* Light theme base tokens */
    --bg-color: #f0f0f0;
    --surface-color: #ffffff;
    --text-primary: #333;
    --text-secondary: #666;
    --accent-color: #ffcc00;
    --accent-rgb: 255, 204, 0;
    --hover-color: rgba(255, 204, 0, 0.08);
    --border-color: #ddd;

    /* App tokens mapped to base tokens (schemes may override either layer) */
    --primary-color: #4a90e2;
    --secondary-color: #f8f9fa;
    --text-color: var(--text-primary);
    --light-text: var(--text-secondary);
    --background-color: var(--bg-color);
    --card-background: var(--surface-color);
    --shadow-color: rgba(0, 0, 0, 0.1);

    /* Duck theme colors */
    --duck-orange: #f7941d;
    --duck-orange-rgb: 247, 148, 29;
    --duck-orange-light: #ffa940;
    --duck-black: #222222;
    --duck-gray: #f0f0f0;
    --duck-white: #ffffff;
    --duck-yellow: #ffde59;

    /* Compose defaults (schemes may override) */
    --compose-bg: var(--card-background);
    --compose-text-color: var(--text-color);
    --compose-muted-color: var(--light-text);
    --compose-border-color: var(--border-color);
    --compose-link-color: var(--primary-color);
    --compose-caret-color: var(--text-color);

    /* Typography defaults for compose (schemes may override) */
    --compose-font-family: inherit;
    --compose-font-size: 16px;
    --compose-line-height: 1.45;

    /* Visual tokens for compose (schemes may override) */
    --compose-toolbar-bg: rgba(255, 204, 0, 0.06);
    --compose-quote-bg: rgba(255, 204, 0, 0.06);
    --compose-quote-border: rgba(255, 204, 0, 0.9);
  }

  [data-theme='dark'] {
    --bg-color: #121620;
    --surface-color: #1e2635;
    --text-primary: #e2e8f0;
    --text-secondary: #a0aec0;
    --accent-color: #ffcc00;
    --accent-rgb: 255, 204, 0;
    --hover-color: rgba(255, 204, 0, 0.08);
    --border-color: #4a5568;

    --primary-color: #6ba5f7;
    --secondary-color: #2d3748;
    --text-color: var(--text-primary);
    --light-text: var(--text-secondary);
    --background-color: var(--bg-color);
    --card-background: var(--surface-color);
    --shadow-color: rgba(0, 0, 0, 0.5);

    --duck-orange: #ff9f30;
    --duck-orange-rgb: 255, 159, 48;
    --duck-orange-light: #ffb860;
    --duck-black: #e2e8f0;
    --duck-gray: #2d3748;
    --duck-white: #e2e8f0;
    --duck-yellow: #ffd426;

    --dark-input-bg: #1a202c;
    --dark-border: #3a4556;
    --dark-button-text: #121620;
  }

${schemeCss}

  /* Duck 2.0: light palette is enabled by adding .light-theme to <body> */
  body.light-theme[data-scheme='duck2'] {
    --bg-color: #f5f7fa;
    --surface-color: #ffffff;
    --text-primary: #34485e;
    --text-secondary: #6b7c93;
    --accent-color: #f4a261;
    --accent-rgb: 244, 162, 97;
    --hover-color: rgba(244,162,97,0.15);
    --border-color: rgba(0,0,0,0.06);

    --primary-color: var(--accent-color);
    --secondary-color: var(--surface-color);
    --text-color: var(--text-primary);
    --light-text: var(--text-secondary);
    --background-color: var(--bg-color);
    --card-background: var(--surface-color);
    --shadow-color: rgba(0, 0, 0, 0.10);

    --duck-orange: var(--accent-color);
    --duck-orange-rgb: 244, 162, 97;
    --duck-orange-light: #f7b27d;
    --dark-button-text: #0d1b2a;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family:
      'Noto Sans',
      'Inter',
      'Nunito',
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      sans-serif;
    line-height: 1.6;
    background-color: var(--background-color);
    color: var(--text-color);
  }

  @media screen and (min-width: 1024px) {
    body {
      font-size: 14px;
      line-height: 1.35;
    }
  }

  button, input, textarea, select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }
`;

export default GlobalStyle;


