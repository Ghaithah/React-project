import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfiles } from './ProfileContext';
import { AVATAR_LIBRARY, ProfileAvatar } from './Avatars';
import Logo from './Logo';
import './ProfileSelector.css';

// formTarget drives the add/edit overlay: null = closed, 'new' = creating
// a fresh profile, or an existing profile's id = editing that profile.
export default function ProfileSelector() {
  const {
    profiles,
    maxProfiles,
    selectProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    deleteAllProfiles,
  } = useProfiles();

  const [managing, setManaging] = useState(false);
  const [formTarget, setFormTarget] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftAvatar, setDraftAvatar] = useState(AVATAR_LIBRARY[0].id);
  const [draftKids, setDraftKids] = useState(false);
  const [formError, setFormError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = location.state?.from?.pathname || '/';
  const isEmpty = profiles.length === 0;
  const atCapacity = profiles.length >= maxProfiles;
  const isFormOpen = formTarget !== null;
  const isCreateMode = formTarget === 'new';
  const editingProfile = !isCreateMode && formTarget ? profiles.find((p) => p.id === formTarget) : null;

  // Brand-new account (or one that's just had every profile deleted):
  // there's nothing to pick, so jump straight into profile creation
  // instead of showing an empty "Who's watching?" grid.
  useEffect(() => {
    if (isEmpty) {
      setFormTarget('new');
      setManaging(false);
    }
  }, [isEmpty]);

  function handlePick(profile) {
    if (managing) {
      openEdit(profile);
      return;
    }
    selectProfile(profile.id);
    navigate(redirectTo === '/profiles' ? '/' : redirectTo, { replace: true });
  }

  function openCreate() {
    setDraftName('');
    setDraftAvatar(AVATAR_LIBRARY[0].id);
    setDraftKids(false);
    setFormError('');
    setFormTarget('new');
  }

  function openEdit(profile) {
    setDraftName(profile.name);
    setDraftAvatar(profile.avatarId || AVATAR_LIBRARY[0].id);
    setDraftKids(!!profile.isKids);
    setFormError('');
    setFormTarget(profile.id);
  }

  function closeForm() {
    if (isEmpty) return; // at least one profile is required before this can be dismissed
    setFormTarget(null);
    setFormError('');
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (isCreateMode) {
      const wasEmpty = profiles.length === 0;
      const result = addProfile({ name: draftName, avatarId: draftAvatar, isKids: draftKids });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setFormTarget(null);
      setFormError('');
      // First profile on a fresh (or freshly wiped) account: select it
      // immediately and head straight into the app rather than bouncing
      // back to a grid that only has one tile in it.
      if (wasEmpty) {
        selectProfile(result.profile.id);
        navigate(redirectTo === '/profiles' ? '/' : redirectTo, { replace: true });
      }
      return;
    }

    if (editingProfile) {
      const result = updateProfile(editingProfile.id, {
        name: draftName,
        avatarId: draftAvatar,
        isKids: draftKids,
      });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setFormTarget(null);
      setFormError('');
    }
  }

  function handleDeleteAll() {
    if (profiles.length === 0) return;
    const ok = window.confirm(
      "Delete all profiles on this account? This removes every nickname and picture — you'll need to create at least one new profile to keep watching."
    );
    if (!ok) return;
    deleteAllProfiles();
  }

  function handleDeleteOne(e, profile) {
    e.stopPropagation();
    const ok = window.confirm(`Delete the "${profile.name}" profile?`);
    if (!ok) return;
    deleteProfile(profile.id);
  }

  // Deletes the profile currently open in the edit form, then closes it.
  function handleDeleteFromForm() {
    if (!editingProfile) return;
    const ok = window.confirm(`Delete the "${editingProfile.name}" profile?`);
    if (!ok) return;
    deleteProfile(editingProfile.id);
    setFormTarget(null);
    setFormError('');
  }

  return (
    <div className="profile-select">
      <div className="profile-select__logo">
        <Logo height={36} showWordmark={false} color="#e8b04b" outlineColor="#0d0f14" />
      </div>

      <h1 className="profile-select__heading">
        {isEmpty ? 'Create your first profile' : "Who's watching?"}
      </h1>

      {isEmpty && (
        <p className="profile-select__hint">
          Pick a nickname and a picture below to start browsing. You can add up to{' '}
          {maxProfiles} profiles on this account, including one for kids.
        </p>
      )}
      {managing && !isEmpty && (
        <p className="profile-select__hint">
          Click a profile to edit its nickname, picture, or Kids setting. Use ✕ to delete one
          quickly, or add another — up to {maxProfiles} per account.
        </p>
      )}

      {!isEmpty && (
        <div className="profile-select__grid">
          {profiles.map((p) => (
            <div key={p.id} className="profile-select__item">
              <div
                className="profile-select__avatar-wrap"
                role="button"
                tabIndex={0}
                aria-label={managing ? `Edit ${p.name}` : `Watch as ${p.name}`}
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
                {managing && (
                  <button
                    type="button"
                    className="profile-select__delete-badge"
                    onClick={(e) => handleDeleteOne(e, p)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete profile"
                  >
                    ✕
                  </button>
                )}
              </div>

              <span className="profile-select__name">
                {p.name}
                {p.isKids && <span className="profile-select__kids-tag">KIDS</span>}
              </span>
            </div>
          ))}

          {!atCapacity && (
            <div className="profile-select__item">
              <div
                className="profile-select__avatar-wrap profile-select__avatar-wrap--add"
                role="button"
                tabIndex={0}
                aria-label="Add profile"
                onClick={openCreate}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCreate();
                  }
                }}
              >
                <span className="profile-select__add-icon">+</span>
              </div>
              <span className="profile-select__name">Add Profile</span>
            </div>
          )}
        </div>
      )}

      {!isEmpty && (
        <div className="profile-select__actions">
          <button
            type="button"
            className="profile-select__manage"
            onClick={() => setManaging((m) => !m)}
          >
            {managing ? 'Done' : 'Manage Profiles'}
          </button>
          {managing && (
            <button
              type="button"
              className="profile-select__delete-all"
              onClick={handleDeleteAll}
            >
              Delete All Profiles
            </button>
          )}
        </div>
      )}

      {isFormOpen && (
        <div
          className="profile-create__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={isCreateMode ? 'Add a profile' : 'Edit profile'}
        >
          <form className="profile-create" onSubmit={handleSubmit}>
            <h2 className="profile-create__heading">
              {isCreateMode ? 'Add a Profile' : 'Edit Profile'}
            </h2>

            <label className="profile-create__field">
              <span>Nickname</span>
              <input
                type="text"
                value={draftName}
                maxLength={20}
                placeholder="e.g. Alex"
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
              />
            </label>

            <div className="profile-create__field">
              <span>Choose a picture</span>
              <div className="profile-create__avatar-grid">
                {AVATAR_LIBRARY.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`profile-create__avatar-option ${
                      draftAvatar === a.id ? 'is-selected' : ''
                    }`}
                    onClick={() => setDraftAvatar(a.id)}
                    aria-label="Use this picture"
                    aria-pressed={draftAvatar === a.id}
                  >
                    <ProfileAvatar avatarId={a.id} isKids={false} size={56} />
                  </button>
                ))}
              </div>
            </div>

            <label className="profile-create__checkbox">
              <input
                type="checkbox"
                checked={draftKids}
                onChange={(e) => setDraftKids(e.target.checked)}
              />
              <span>
                This is a Kids profile
                <small>Only kid-friendly titles will be shown.</small>
              </span>
            </label>

            {formError && (
              <p className="profile-create__error" role="alert">
                {formError}
              </p>
            )}

            <div className="profile-create__buttons">
              {!isCreateMode && (
                <button
                  type="button"
                  className="profile-create__delete"
                  onClick={handleDeleteFromForm}
                >
                  Delete Profile
                </button>
              )}
              <div className="profile-create__buttons-right">
                {!isEmpty && (
                  <button type="button" className="profile-create__cancel" onClick={closeForm}>
                    Cancel
                  </button>
                )}
                <button type="submit" className="profile-create__save">
                  {isCreateMode ? (isEmpty ? 'Create Profile & Continue' : 'Save') : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}