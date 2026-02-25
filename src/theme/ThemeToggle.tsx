import styled from "styled-components";

import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTheme } from "./ThemeContext";

const ToggleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: transparent;
  color: var(--duck-orange);
  border: 2px solid var(--duck-orange);
  padding: 0;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(var(--duck-orange-rgb), 0.12);
  }
`;

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const currentTheme = theme ?? "light";

  return (
    <ToggleButton
      onClick={toggleTheme}
      aria-label={t(currentTheme === "light" ? "theme.switchToDarkMode" : "theme.switchToLightMode")}
      title={t(currentTheme === "light" ? "theme.switchToDarkMode" : "theme.switchToLightMode")}
    >
      {currentTheme === "light" ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
    </ToggleButton>
  );
}


