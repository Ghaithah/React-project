import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { AVATAR_LIBRARY } from './Avatars';

const ProfileContext = createContext(null);

// Profiles (and which one is active) are namespaced per logged-in user so
// two people sharing a browser never see each other's profiles.
const PROFILES_KEY_PREFIX = 'movieapp_profiles_';
const ACTIVE_PROFILE_KEY_PREFIX = 'movieapp_active_profile_';

// Netflix caps a household at 5 regular profiles + 1 Kids profile (6
// total); this app allows the same six total, split however the account
// likes between regular and Kids profiles.
export const MAX_PROFILES = 6;

// Generates an id that can't collide with an existing profile, even if
// two profiles get created in the same millisecond. Existing ids are
// collected into a Set up front (rather than calling `existing.some(...)`
// from inside the retry loop) so the loop body never declares a closure
// over a variable it's also reassigning — that pattern is what triggers
// eslint's no-loop-func warning, since a closure capturing a
// loop-mutated binding can't be statically proven safe.
function nextProfileId(existing) {
  const existingIds = new Set(existing.map((p) => p.id));
  let id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  while (existingIds.has(id)) {
    id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return id;
}

// Both read synchronously from storage so they can be used as useState
// lazy initializers — see the note on ProfileProvider below for why that
// matters.
function loadProfiles(profilesKey) {
  if (!profilesKey) return [];
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(profilesKey));
  } catch {
    stored = null;
  }
  return Array.isArray(stored) ? stored : [];
}

function loadActiveId(activeKey) {
  if (!activeKey) return null;
  return sessionStorage.getItem(activeKey) || null;
}

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const profilesKey = user ? PROFILES_KEY_PREFIX + user.toLowerCase() : null;
  const activeKey = user ? ACTIVE_PROFILE_KEY_PREFIX + user.toLowerCase() : null;

  // Lazy initializers read localStorage/sessionStorage synchronously on
  // the very first render, instead of starting empty and filling in via
  // an effect after mount. That first-render gap used to be real: on a
  // page refresh, RequireProfile would see an empty `profiles` array
  // (the pre-effect default) before the old effect had a chance to load
  // the stored data, and would redirect an already-logged-in, already
  // has-a-profile user back to /profiles for a split second — a redirect
  // that then stuck because it replaced history. Since AuthProvider
  // (a parent) hydrates `user` from localStorage the same way, `user` is
  // already correct by the time this component's initializers run, so
  // profilesKey/activeKey are correct too and this loads the right data
  // on the first paint.
  const [profiles, setProfiles] = useState(() => loadProfiles(profilesKey));
  const [activeProfileId, setActiveProfileId] = useState(() => loadActiveId(activeKey));

  // Re-sync whenever the logged-in user changes — e.g. logging out and
  // into a different account without a full page reload. On first mount
  // this just re-confirms what the lazy initializers above already
  // loaded, so it's a no-op in the common case.
  useEffect(() => {
    setProfiles(loadProfiles(profilesKey));
    setActiveProfileId(loadActiveId(activeKey));
  }, [profilesKey, activeKey]);

  const persist = useCallback(
    (updated) => {
      if (profilesKey) localStorage.setItem(profilesKey, JSON.stringify(updated));
      setProfiles(updated);
      return updated;
    },
    [profilesKey]
  );

  const selectProfile = useCallback(
    (id) => {
      setActiveProfileId(id);
      if (activeKey) sessionStorage.setItem(activeKey, id);
    },
    [activeKey]
  );

  const clearProfile = useCallback(() => {
    setActiveProfileId(null);
    if (activeKey) sessionStorage.removeItem(activeKey);
  }, [activeKey]);

  // Creates a brand-new profile with its own nickname + built-in picture,
  // optionally flagged as a Kids profile. Up to MAX_PROFILES per account,
  // matching the "Who's watching?" grid size.
  const addProfile = useCallback(
    ({ name, avatarId, isKids }) => {
      const trimmedName = (name || '').trim().slice(0, 20);
      if (!trimmedName) {
        return { success: false, error: 'Give this profile a nickname.' };
      }
      if (profiles.length >= MAX_PROFILES) {
        return { success: false, error: `You can only have up to ${MAX_PROFILES} profiles.` };
      }

      const resolvedAvatar = AVATAR_LIBRARY.some((a) => a.id === avatarId)
        ? avatarId
        : AVATAR_LIBRARY[0].id;

      const newProfile = {
        id: nextProfileId(profiles),
        name: trimmedName,
        avatarId: resolvedAvatar,
        isKids: !!isKids,
      };
      const updated = persist([...profiles, newProfile]);
      return { success: true, profile: newProfile, profiles: updated };
    },
    [profiles, persist]
  );

  // Edits an existing profile's nickname, picture, and/or Kids flag in
  // one go — this backs the "Edit Profile" screen. Any field left
  // undefined keeps its current value, so callers can pass just the
  // fields that changed.
  const updateProfile = useCallback(
    (id, { name, avatarId, isKids } = {}) => {
      const target = profiles.find((p) => p.id === id);
      if (!target) {
        return { success: false, error: "That profile doesn't exist anymore." };
      }

      let trimmedName = target.name;
      if (name !== undefined) {
        trimmedName = (name || '').trim().slice(0, 20);
        if (!trimmedName) {
          return { success: false, error: 'Give this profile a nickname.' };
        }
      }

      const resolvedAvatar =
        avatarId !== undefined && AVATAR_LIBRARY.some((a) => a.id === avatarId)
          ? avatarId
          : target.avatarId;

      const resolvedKids = isKids !== undefined ? !!isKids : target.isKids;

      const updated = profiles.map((p) =>
        p.id === id ? { ...p, name: trimmedName, avatarId: resolvedAvatar, isKids: resolvedKids } : p
      );
      persist(updated);
      return { success: true };
    },
    [profiles, persist]
  );

  // Deletes a single profile. If it was the active one, the active
  // selection is cleared too so nothing stale lingers in session storage.
  const deleteProfile = useCallback(
    (id) => {
      const updated = persist(profiles.filter((p) => p.id !== id));
      if (activeProfileId === id) clearProfile();
      return updated;
    },
    [profiles, persist, activeProfileId, clearProfile]
  );

  // Wipes every profile on the account in one go. Also drops the active
  // selection, so RequireProfile immediately routes back through the
  // (now-empty) forced-creation flow the next time a protected page loads.
  const deleteAllProfiles = useCallback(() => {
    persist([]);
    clearProfile();
  }, [persist, clearProfile]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        activeProfileId,
        maxProfiles: MAX_PROFILES,
        selectProfile,
        clearProfile,
        addProfile,
        updateProfile,
        deleteProfile,
        deleteAllProfiles,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfiles() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfiles must be used within a ProfileProvider');
  return ctx;
}