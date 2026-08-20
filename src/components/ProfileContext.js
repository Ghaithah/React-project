import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const ProfileContext = createContext(null);

// Profiles (and which one is active) are namespaced per logged-in user so
// two people sharing a browser never see each other's profiles.
const PROFILES_KEY_PREFIX = 'movieapp_profiles_';
const ACTIVE_PROFILE_KEY_PREFIX = 'movieapp_active_profile_';

// Six profiles, matching the "Who's watching?" grid: five regular profiles
// (the first named after the account) plus one Kids profile that's flagged
// so MovieSearch can restrict what it shows.
function defaultProfilesForUser(username) {
  return [
    { id: 'p1', name: username || 'Profile 1', color: '#3B82F6', isKids: false },
    { id: 'p2', name: 'Profile 2', color: '#E4489A', isKids: false },
    { id: 'p3', name: 'Profile 3', color: '#2ECC71', isKids: false },
    { id: 'p4', name: 'Profile 4', color: '#9B59B6', isKids: false },
    { id: 'p5', name: 'Profile 5', color: '#F5A623', isKids: false },
    { id: 'p6', name: 'Kids', color: '#E5342E', isKids: true },
  ];
}

export function ProfileProvider({ children }) {
  const { user } = useAuth();
  const profilesKey = user ? PROFILES_KEY_PREFIX + user.toLowerCase() : null;
  const activeKey = user ? ACTIVE_PROFILE_KEY_PREFIX + user.toLowerCase() : null;

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);

  // Load (or seed) this user's profiles, and restore whichever profile was
  // active earlier in this browser session, whenever the logged-in user
  // changes.
  useEffect(() => {
    if (!user || !profilesKey) {
      setProfiles([]);
      setActiveProfileId(null);
      return;
    }

    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(profilesKey));
    } catch {
      stored = null;
    }
    if (!Array.isArray(stored) || stored.length === 0) {
      stored = defaultProfilesForUser(user);
      localStorage.setItem(profilesKey, JSON.stringify(stored));
    }
    setProfiles(stored);
    setActiveProfileId(sessionStorage.getItem(activeKey) || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profilesKey, activeKey]);

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

  const renameProfile = useCallback(
    (id, name) => {
      setProfiles((prev) => {
        const trimmed = (name || '').slice(0, 20);
        const updated = prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p));
        if (profilesKey) localStorage.setItem(profilesKey, JSON.stringify(updated));
        return updated;
      });
    },
    [profilesKey]
  );

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  return (
    <ProfileContext.Provider
      value={{ profiles, activeProfile, activeProfileId, selectProfile, clearProfile, renameProfile }}
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