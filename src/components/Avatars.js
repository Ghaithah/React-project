// Shared library of built-in profile pictures and the small icon
// components that render them. There's no photo upload here — you pick
// one of these icon+color combos when you create (or later re-style) a
// profile, the same idea as Netflix's default profile icons.

export function SmileyFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <circle cx="35" cy="42" r="6" fill="#fff" />
      <circle cx="65" cy="42" r="6" fill="#fff" />
      <path d="M30 60 Q50 78 70 60" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// A friendlier, wide-eyed face used for the Kids-styled avatar options.
export function KidsFace() {
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

export function StarFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <path d="M50 10 L61 39 L92 39 L67 57 L77 87 L50 69 L23 87 L33 57 L8 39 L39 39 Z" fill="#fff" />
    </svg>
  );
}

export function CatFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <path d="M22 24 L38 44 L18 46 Z" fill="#fff" />
      <path d="M78 24 L62 44 L82 46 Z" fill="#fff" />
      <circle cx="36" cy="48" r="6" fill="#fff" />
      <circle cx="64" cy="48" r="6" fill="#fff" />
      <path d="M45 60 L55 60 L50 68 Z" fill="#fff" />
      <path d="M30 66 Q50 78 70 66" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function RobotFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <rect x="24" y="34" width="52" height="38" rx="8" fill="none" stroke="#fff" strokeWidth="6" />
      <circle cx="40" cy="53" r="5" fill="#fff" />
      <circle cx="60" cy="53" r="5" fill="#fff" />
      <line x1="50" y1="34" x2="50" y2="20" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="50" cy="16" r="5" fill="#fff" />
    </svg>
  );
}

export function HeartFace() {
  return (
    <svg viewBox="0 0 100 100" className="profile-avatar__face" aria-hidden="true">
      <path
        d="M50 78 C20 56 12 36 28 24 C38 16 48 20 50 30 C52 20 62 16 72 24 C88 36 80 56 50 78 Z"
        fill="#fff"
      />
    </svg>
  );
}

const ICON_COMPONENTS = {
  smiley: SmileyFace,
  kids: KidsFace,
  star: StarFace,
  cat: CatFace,
  robot: RobotFace,
  heart: HeartFace,
};

// The full built-in picture gallery a profile can be created with — a
// fixed icon+color pairing per entry (there's no photo upload, this *is*
// the picture). Twelve options, mirroring the range of default avatars
// Netflix offers on its profile-creation screen.
export const AVATAR_LIBRARY = [
  { id: 'a-blue-smile', icon: 'smiley', color: '#3B82F6' },
  { id: 'a-pink-smile', icon: 'smiley', color: '#E4489A' },
  { id: 'a-green-smile', icon: 'smiley', color: '#2ECC71' },
  { id: 'a-purple-smile', icon: 'smiley', color: '#9B59B6' },
  { id: 'a-orange-smile', icon: 'smiley', color: '#F5A623' },
  { id: 'a-teal-star', icon: 'star', color: '#16A085' },
  { id: 'a-amber-star', icon: 'star', color: '#E67E22' },
  { id: 'a-indigo-cat', icon: 'cat', color: '#5C6BC0' },
  { id: 'a-slate-robot', icon: 'robot', color: '#607D8B' },
  { id: 'a-rose-heart', icon: 'heart', color: '#FF6B81' },
  { id: 'a-red-kids', icon: 'kids', color: '#E5342E' },
  { id: 'a-gold-kids', icon: 'kids', color: '#F5A623' },
];

const DEFAULT_AVATAR = AVATAR_LIBRARY[0];

export function getAvatar(avatarId) {
  return AVATAR_LIBRARY.find((a) => a.id === avatarId) || DEFAULT_AVATAR;
}

// Renders one profile's picture: the colored tile + its icon, plus the
// "KIDS" corner badge when the profile itself is flagged as a Kids
// profile (independent of which icon/color was picked for it). Accepts
// either a full `profile` object or a bare `avatarId`/`isKids` pair, so
// it also works for previewing avatar options before a profile exists.
export function ProfileAvatar({ profile, avatarId, isKids, size }) {
  const resolved = getAvatar(avatarId !== undefined ? avatarId : profile?.avatarId);
  const kids = isKids !== undefined ? isKids : !!profile?.isKids;
  const Icon = ICON_COMPONENTS[resolved.icon] || SmileyFace;
  const style = { background: resolved.color };
  if (size) {
    style.width = size;
    style.height = size;
  }
  return (
    <div className={`profile-avatar ${kids ? 'profile-avatar--kids' : ''}`} style={style}>
      <Icon />
      {kids && <span className="profile-avatar__badge">KIDS</span>}
    </div>
  );
}