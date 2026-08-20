import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfiles } from './ProfileContext';
import Logo from './Logo';
import './ProfileSelector.css';

// A plain smiley face for the five regular profiles — deliberately simple
// (two dots + a curve) so it reads at a glance, same idea as Netflix's
// default profile icons.
function SmileyFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <circle cx="35" cy="42" r="6" fill="#fff" />
      <circle cx="65" cy="42" r="6" fill="#fff" />
      <path d="M30 60 Q50 78 70 60" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// A friendlier, wide-eyed face for the Kids profile, plus the red "KIDS"
// badge that's the visual cue the rest of the app keys off of.
function KidsFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <circle cx="33" cy="40" r="9" fill="#fff" />
      <circle cx="67" cy="40" r="9" fill="#fff" />
      <circle cx="33" cy="40" r="4" fill="#3a1a17" />
      <circle cx="67" cy="40" r="4" fill="#3a1a17" />
      <path d="M28 62 Q50 82 72 62" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ProfileAvatar({ profile }) {
  return (
    <div
      className={`profile-avatar ${profile.isKids ? 'profile-avatar--kids' : ''}`}
      style={{ background: profile.color }}
    >
      {profile.isKids ? <KidsFace /> : <SmileyFace />}
      {profile.isKids && <span className="profile-avatar__badge">KIDS</span>}
    </div>
  );
}

export default function ProfileSelector() {
  const { profiles, selectProfile, renameProfile } = useProfiles();
  const [managing, setManaging] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = location.state?.from?.pathname || '/';

  function handlePick(profile) {
    if (managing) return;
    selectProfile(profile.id);
    navigate(redirectTo === '/profiles' ? '/' : redirectTo, { replace: true });
  }

  return (
    <div className="profile-select">
      <div className="profile-select__logo">
        <Logo height={36} showWordmark={false} color="#e8b04b" outlineColor="#0d0f14" />
      </div>

      <h1 className="profile-select__heading">Who's watching?</h1>

      <div className="profile-select__grid">
        {profiles.map((p) => (
          <div key={p.id} className="profile-select__item">
            <div
              className="profile-select__avatar-wrap"
              role="button"
              tabIndex={0}
              aria-label={managing ? `Editing ${p.name}` : `Watch as ${p.name}`}
              onClick={() => handlePick(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePick(p);
                }
              }}
            >
              <ProfileAvatar profile={p} />
              {managing && <span className="profile-select__edit-badge">✎</span>}
            </div>

            {managing ? (
              <input
                className="profile-select__name-input"
                value={p.name}
                maxLength={20}
                onChange={(e) => renameProfile(p.id, e.target.value)}
                aria-label={`Rename ${p.name}`}
              />
            ) : (
              <span className="profile-select__name">{p.name}</span>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="profile-select__manage"
        onClick={() => setManaging((m) => !m)}
      >
        {managing ? 'Done' : 'Manage Profiles'}
      </button>
    </div>
  );
}