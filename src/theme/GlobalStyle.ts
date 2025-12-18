import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`
  :root {
    /* Light theme variables (taken from hide-mail_styles) */
    --primary-color: #4a90e2;
    --secondary-color: #f8f9fa;
    --accent-color: #ffcc00;
    --text-color: #333;
    --light-text: #666;
    --border-color: #ddd;
    --background-color: #f0f0f0;
    --card-background: #ffffff;
    --shadow-color: rgba(0, 0, 0, 0.1);

    /* Duck theme colors */
    --duck-orange: #f7941d;
    --duck-orange-light: #ffa940;
    --duck-black: #222222;
    --duck-gray: #f0f0f0;
    --duck-white: #ffffff;
    --duck-yellow: #ffde59;
  }

  [data-theme='dark'] {
    --primary-color: #6ba5f7;
    --secondary-color: #2d3748;
    --accent-color: #ffcc00;
    --text-color: #e2e8f0;
    --light-text: #a0aec0;
    --border-color: #4a5568;
    --background-color: #121620;
    --card-background: #1e2635;
    --shadow-color: rgba(0, 0, 0, 0.5);

    --duck-orange: #ff9f30;
    --duck-orange-light: #ffb860;
    --duck-black: #e2e8f0;
    --duck-gray: #2d3748;
    --duck-white: #e2e8f0;
    --duck-yellow: #ffd426;

    --dark-input-bg: #1a202c;
    --dark-border: #3a4556;
    --dark-button-text: #121620;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family:
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

  button, input, textarea, select {
    font: inherit;
  }

  button {
    cursor: pointer;
  }
`;

export default GlobalStyle;


