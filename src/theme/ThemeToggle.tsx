import styled from "styled-components";

import { Moon, Sun } from "lucide-react";

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
    background-color: rgba(247, 148, 29, 0.12);
  }
`;

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const currentTheme = theme ?? "light";

  return (
    <ToggleButton
      onClick={toggleTheme}
      aria-label={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${currentTheme === "light" ? "dark" : "light"} mode`}
    >
      {currentTheme === "light" ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
    </ToggleButton>
  );
}


