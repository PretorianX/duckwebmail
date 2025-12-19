export type Profile = { id: string; name: string };

export const STORAGE_ACTIVE_PROFILE = "activeProfileId";
export const STORAGE_PROFILES = "profiles";
export const PROFILE_STORAGE_EVENT = "duckwebmail:profile-storage";

const DEFAULT_PROFILES: Profile[] = [
  { id: "personal", name: "Personal" },
  { id: "work", name: "Work" }
];

export function readProfiles(): Profile[] {
  const raw = localStorage.getItem(STORAGE_PROFILES);
  if (!raw) return DEFAULT_PROFILES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PROFILES;
    const normalized = parsed
      .map((p) => (typeof p === "object" && p ? (p as { id?: unknown; name?: unknown }) : null))
      .filter(Boolean)
      .map((p) => ({ id: String(p!.id ?? ""), name: String(p!.name ?? "") }))
      .filter((p) => p.id.length > 0 && p.name.length > 0);
    return normalized.length > 0 ? normalized : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function ensureProfilesPersisted(profiles: Profile[]): void {
  localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
  window.dispatchEvent(new Event(PROFILE_STORAGE_EVENT));
}

export function readActiveProfileId(profiles: Profile[]): string {
  const raw = localStorage.getItem(STORAGE_ACTIVE_PROFILE);
  const fallback = profiles[0]?.id ?? DEFAULT_PROFILES[0].id;
  if (!raw) return fallback;
  return profiles.some((p) => p.id === raw) ? raw : fallback;
}

export function setActiveProfileIdInStorage(profileId: string): void {
  localStorage.setItem(STORAGE_ACTIVE_PROFILE, profileId);
  window.dispatchEvent(new Event(PROFILE_STORAGE_EVENT));
}

export function subscribeToProfileStorageChanges(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== localStorage) return;
    if (e.key !== null && e.key !== STORAGE_ACTIVE_PROFILE && e.key !== STORAGE_PROFILES) return;
    onChange();
  };
  const onCustom: EventListener = () => onChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener(PROFILE_STORAGE_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PROFILE_STORAGE_EVENT, onCustom);
  };
}

