import { useEffect, useId, useMemo, useRef, useState } from "react";
import styled from "styled-components";

import { Check, Info, Settings, User, Users } from "lucide-react";

type Profile = { id: string; name: string };

const STORAGE_ACTIVE_PROFILE = "activeProfileId";
const STORAGE_PROFILES = "profiles";

function readProfiles(): Profile[] {
  const raw = localStorage.getItem(STORAGE_PROFILES);
  if (!raw) return [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
    const normalized = parsed
      .map((p) => (typeof p === "object" && p ? (p as { id?: unknown; name?: unknown }) : null))
      .filter(Boolean)
      .map((p) => ({ id: String(p!.id ?? ""), name: String(p!.name ?? "") }))
      .filter((p) => p.id.length > 0 && p.name.length > 0);
    return normalized.length > 0 ? normalized : [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
  } catch {
    return [{ id: "personal", name: "Personal" }, { id: "work", name: "Work" }];
  }
}

function readActiveProfileId(profiles: Profile[]): string {
  const raw = localStorage.getItem(STORAGE_ACTIVE_PROFILE);
  const fallback = profiles[0]?.id ?? "personal";
  if (!raw) return fallback;
  return profiles.some((p) => p.id === raw) ? raw : fallback;
}

const Wrapper = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`;

const MenuButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background-color: transparent;
  color: var(--duck-orange);
  border: 2px solid var(--duck-orange);
  padding: 0;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(247, 148, 29, 0.12);
  }
`;

const Popover = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  min-width: 240px;
  background: var(--card-background);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  z-index: 50;
`;

const PopoverHeader = styled.div`
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
`;

const ActiveProfile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const ActiveLabel = styled.div`
  font-size: 0.75rem;
  color: var(--light-text);
  font-weight: 900;
  letter-spacing: 0.2px;
  text-transform: uppercase;
`;

const ActiveName = styled.div`
  font-weight: 950;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Section = styled.div`
  padding: 8px;
  display: grid;
  gap: 6px;
`;

const MenuItem = styled.button`
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  padding: 10px 10px;
  border-radius: 12px;
  font-weight: 900;

  &:hover {
    background: rgba(255, 204, 0, 0.08);
    border-color: rgba(255, 204, 0, 0.25);
  }
`;

const ItemLeft = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const ItemText = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Divider = styled.div`
  height: 1px;
  background: var(--border-color);
`;

const Icon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--light-text);

  svg {
    width: 18px;
    height: 18px;
    display: block;
  }
`;

const RightIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--duck-orange);

  svg {
    width: 18px;
    height: 18px;
    display: block;
  }
`;

const Subtle = styled.div`
  padding: 0 12px 10px;
  color: var(--light-text);
  font-size: 0.85rem;
`;

export default function ProfileMenu() {
  const menuId = useId();
  const buttonId = `${menuId}-button`;
  const popoverId = `${menuId}-popover`;

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [profiles] = useState<Profile[]>(() => readProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string>(() => readActiveProfileId(readProfiles()));

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? { id: "personal", name: "Personal" },
    [profiles, activeProfileId]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ACTIVE_PROFILE, activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const root = wrapperRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <Wrapper ref={wrapperRef}>
      <MenuButton
        id={buttonId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-label={`Profile menu (${activeProfile.name})`}
        title={`Profile: ${activeProfile.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <User size={20} aria-hidden="true" />
      </MenuButton>

      {open && (
        <Popover id={popoverId} role="menu" aria-labelledby={buttonId}>
          <PopoverHeader>
            <ActiveProfile>
              <ActiveLabel>Profile</ActiveLabel>
              <ActiveName>
                {activeProfile.name} <span aria-hidden="true">🦆</span>
              </ActiveName>
            </ActiveProfile>
          </PopoverHeader>

          <Section aria-label="Actions">
            <MenuItem
              type="button"
              role="menuitem"
              title="Settings"
              onClick={() => {
                setOpen(false);
                // Placeholder for future settings screen/dialog.
              }}
            >
              <ItemLeft>
                <Icon>
                  <Settings aria-hidden="true" />
                </Icon>
                <ItemText>Settings</ItemText>
              </ItemLeft>
            </MenuItem>

            <MenuItem
              type="button"
              role="menuitem"
              title="About Duckwebmail"
              onClick={() => {
                setOpen(false);
                // Placeholder for future about screen/dialog.
              }}
            >
              <ItemLeft>
                <Icon>
                  <Info aria-hidden="true" />
                </Icon>
                <ItemText>About</ItemText>
              </ItemLeft>
            </MenuItem>
          </Section>

          <Divider />

          <Section aria-label="Profiles">
            {profiles.map((p) => {
              const active = p.id === activeProfileId;
              return (
                <MenuItem
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  title={active ? "Active profile" : "Switch profile"}
                  onClick={() => {
                    setActiveProfileId(p.id);
                    setOpen(false);
                  }}
                >
                  <ItemLeft>
                    <Icon>
                      <Users aria-hidden="true" />
                    </Icon>
                    <ItemText>{p.name}</ItemText>
                  </ItemLeft>
                  {active && (
                    <RightIcon>
                      <Check aria-hidden="true" />
                    </RightIcon>
                  )}
                </MenuItem>
              );
            })}
          </Section>

          <Subtle>Mobile theme follows your device settings.</Subtle>
        </Popover>
      )}
    </Wrapper>
  );
}

