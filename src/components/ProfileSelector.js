import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProfiles, PIN_LENGTH } from './ProfileContext';
import { AVATAR_LIBRARY, ProfileAvatar } from './Avatars';
import Logo from './Logo';
import './ProfileSelector.css';

// How many wrong PIN attempts a single gate (see pinGate state below)
// tolerates before locking out further tries for a cooldown period —
// same idea as a phone's PIN lock, so a locked profile can't be brute-
// forced by just sitting there re-guessing four digits.
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30 * 1000;

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
    setProfilePin,
    removeProfilePin,
    verifyProfilePin,
  } = useProfiles();

  const [managing, setManaging] = useState(false);
  const [formTarget, setFormTarget] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftAvatar, setDraftAvatar] = useState(AVATAR_LIBRARY[0].id);
  const [draftKids, setDraftKids] = useState(false);
  const [formError, setFormError] = useState('');

  // --- Profile Lock (PIN) form state — see the "Profile Lock" section of
  // the edit form further down. Kept separate from the draftName/
  // draftAvatar/draftKids fields above since setting a PIN is its own
  // async action (hashing via ProfileContext.setProfilePin) rather than
  // part of the main Save button's synchronous update.
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirmDraft, setPinConfirmDraft] = useState('');
  const [pinFormError, setPinFormError] = useState('');
  const [pinFormBusy, setPinFormBusy] = useState(false);

  // --- PIN entry gate — shown whenever picking (to watch), editing, or
  // deleting a profile that's locked with a PIN (see the lock badge on
  // each tile below). `purpose` decides what happens once the PIN
  // checks out: 'watch' selects the profile and navigates in, 'edit'
  // opens the normal edit form, 'delete' runs the same delete
  // confirmation handleDeleteOne would otherwise run directly. `digits`
  // is the PIN being typed; `attempts`/`lockedUntil` implement the
  // cooldown described by MAX_PIN_ATTEMPTS/PIN_LOCKOUT_MS above.
  const [pinGate, setPinGate] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = location.state?.from?.pathname || '/';
  const isEmpty = profiles.length === 0;
  const atCapacity = profiles.length >= maxProfiles;
  const isFormOpen = formTarget !== null;
  const isCreateMode = formTarget === 'new';
  const editingProfile = !isCreateMode && formTarget ? profiles.find((p) => p.id === formTarget) : null;

  const isPinLocked = !!(pinGate && pinGate.lockedUntil && pinGate.lockedUntil > nowTick);
  const pinRemainingSeconds = isPinLocked
    ? Math.max(1, Math.ceil((pinGate.lockedUntil - nowTick) / 1000))
    : 0;

  // Brand-new account (or one that's just had every profile deleted):
  // there's nothing to pick, so jump straight into profile creation
  // instead of showing an empty "Who's watching?" grid.
  useEffect(() => {
    if (isEmpty) {
      setFormTarget('new');
      setManaging(false);
    }
  }, [isEmpty]);

  // Ticks once a second while a gate is in its post-lockout cooldown, so
  // the "try again in Ns" message counts down instead of sitting frozen
  // until the next unrelated re-render. Deliberately keyed on just
  // pinGate?.lockedUntil rather than the whole pinGate object, so this
  // only restarts when a lockout actually begins/ends/changes — not on
  // every keystroke while typing a PIN, which would otherwise tear down
  // and restart the interval on every digit.
  useEffect(() => {
    if (!pinGate || !pinGate.lockedUntil) return undefined;
    const interval = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinGate?.lockedUntil]);

  // Once the cooldown above actually elapses, clear it (and the attempt
  // counter) so the visitor can try again rather than staying locked out
  // forever.
  useEffect(() => {
    if (pinGate && pinGate.lockedUntil && nowTick >= pinGate.lockedUntil) {
      setPinGate((current) =>
        current && current.lockedUntil ? { ...current, lockedUntil: 0, attempts: 0, error: '' } : current
      );
    }
  }, [nowTick, pinGate]);

  // Standard modal hygiene: Esc dismisses the PIN gate, same as the
  // add/edit profile overlay would if it supported Esc.
  useEffect(() => {
    if (!pinGate) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setPinGate(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pinGate]);

  // Auto-submits the moment all PIN_LENGTH digits are entered — no
  // separate "Unlock" button to click, same as Netflix's own PIN pad.
  useEffect(() => {
    if (!pinGate || pinGate.lockedUntil) return;
    if (pinGate.digits.length === PIN_LENGTH) {
      submitPinGate(pinGate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinGate?.digits]);

  function openPinGate(profile, purpose) {
    setPinGate({ profile, purpose, digits: '', attempts: 0, lockedUntil: 0, error: '' });
  }

  function handlePinDigitsChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPinGate((current) => (current ? { ...current, digits, error: '' } : current));
  }

  // Verifies the just-completed PIN attempt against ProfileContext. On a
  // match, closes the gate and carries out whatever it was guarding
  // (see closePinGateAndProceed). On a miss, records the attempt and —
  // once MAX_PIN_ATTEMPTS is reached — starts the cooldown.
  async function submitPinGate(gate) {
    const ok = await verifyProfilePin(gate.profile.id, gate.digits);
    if (ok) {
      closePinGateAndProceed(gate);
      return;
    }
    setPinGate((current) => {
      // The gate may have been cancelled or replaced with a different
      // profile/purpose while this PIN was being checked — only apply
      // the miss if it's still the same attempt.
      if (!current || current.profile.id !== gate.profile.id || current.purpose !== gate.purpose) {
        return current;
      }
      const attempts = current.attempts + 1;
      const locked = attempts >= MAX_PIN_ATTEMPTS;
      return {
        ...current,
        digits: '',
        attempts,
        error: locked ? '' : 'Incorrect PIN. Try again.',
        lockedUntil: locked ? Date.now() + PIN_LOCKOUT_MS : 0,
      };
    });
  }

  function closePinGateAndProceed(gate) {
    const { profile, purpose } = gate;
    setPinGate(null);
    if (purpose === 'watch') {
      selectProfile(profile.id);
      navigate(redirectTo === '/profiles' ? '/' : redirectTo, { replace: true });
    } else if (purpose === 'edit') {
      openEdit(profile);
    } else if (purpose === 'delete') {
      const ok = window.confirm(`Delete the "${profile.name}" profile?`);
      if (ok) deleteProfile(profile.id);
    }
  }

  function handlePick(profile) {
    if (managing) {
      if (profile.pinHash) {
        openPinGate(profile, 'edit');
      } else {
        openEdit(profile);
      }
      return;
    }
    if (profile.pinHash) {
      openPinGate(profile, 'watch');
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
    setPinDraft('');
    setPinConfirmDraft('');
    setPinFormError('');
    setFormTarget('new');
  }

  function openEdit(profile) {
    setDraftName(profile.name);
    setDraftAvatar(profile.avatarId || AVATAR_LIBRARY[0].id);
    setDraftKids(!!profile.isKids);
    setFormError('');
    setPinDraft('');
    setPinConfirmDraft('');
    setPinFormError('');
    setFormTarget(profile.id);
  }

  function closeForm() {
    if (isEmpty) return; // at least one profile is required before this can be dismissed
    setFormTarget(null);
    setFormError('');
    setPinDraft('');
    setPinConfirmDraft('');
    setPinFormError('');
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
    if (profile.pinHash) {
      openPinGate(profile, 'delete');
      return;
    }
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

  // --- Profile Lock (PIN) management, from inside the edit form ---

  function handlePinDraftKeyDown(e) {
    // The PIN fields sit inside the same <form> as the main Save button
    // (see the "Profile Lock" section below) — without this, pressing
    // Enter while typing a PIN would submit the whole profile-edit form
    // instead of setting the PIN.
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSetPin(e);
    }
  }

  async function handleSetPin(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingProfile) return;
    setPinFormError('');
    if (pinDraft.length !== PIN_LENGTH || !/^\d+$/.test(pinDraft)) {
      setPinFormError(`PIN must be exactly ${PIN_LENGTH} digits.`);
      return;
    }
    if (pinDraft !== pinConfirmDraft) {
      setPinFormError('PINs do not match.');
      return;
    }
    setPinFormBusy(true);
    const result = await setProfilePin(editingProfile.id, pinDraft);
    setPinFormBusy(false);
    if (!result.success) {
      setPinFormError(result.error);
      return;
    }
    setPinDraft('');
    setPinConfirmDraft('');
  }

  function handleRemovePin() {
    if (!editingProfile) return;
    const ok = window.confirm(`Remove the PIN from "${editingProfile.name}"?`);
    if (!ok) return;
    removeProfilePin(editingProfile.id);
    setPinDraft('');
    setPinConfirmDraft('');
    setPinFormError('');
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
          Click a profile to edit its nickname, picture, Kids setting, or PIN lock. Use ✕ to
          delete one quickly, or add another — up to {maxProfiles} per account.
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
                {p.pinHash && (
                  <span className="profile-select__lock-badge" aria-hidden="true" title="PIN locked">
                    🔒
                  </span>
                )}
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

            {/* Profile Lock (PIN) — only available once a profile already
                exists, since a PIN protects an existing profile's id and
                a brand-new one doesn't have one yet until Save is
                pressed. Deliberately its own mini-form with its own
                Set/Change/Remove buttons rather than folded into the
                main Save button: setting a PIN is async (hashing, via
                ProfileContext.setProfilePin) and conceptually separate
                from the nickname/picture/Kids fields above. */}
            {!isCreateMode && editingProfile && (
              <div className="profile-create__field profile-create__pin-section">
                <span>Profile Lock</span>
                {editingProfile.pinHash ? (
                  <div className="profile-pin-manage">
                    <p className="profile-pin-manage__status">
                      🔒 This profile requires a PIN to switch to, edit, or delete.
                    </p>
                    <div className="profile-pin-manage__row">
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="\d*"
                        autoComplete="off"
                        maxLength={PIN_LENGTH}
                        placeholder="New PIN"
                        value={pinDraft}
                        onChange={(e) =>
                          setPinDraft(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
                        }
                        onKeyDown={handlePinDraftKeyDown}
                        aria-label="New PIN"
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="\d*"
                        autoComplete="off"
                        maxLength={PIN_LENGTH}
                        placeholder="Confirm"
                        value={pinConfirmDraft}
                        onChange={(e) =>
                          setPinConfirmDraft(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
                        }
                        onKeyDown={handlePinDraftKeyDown}
                        aria-label="Confirm new PIN"
                      />
                    </div>
                    {pinFormError && (
                      <p className="profile-create__error" role="alert">
                        {pinFormError}
                      </p>
                    )}
                    <div className="profile-pin-manage__buttons">
                      <button
                        type="button"
                        onClick={handleSetPin}
                        disabled={pinFormBusy || !pinDraft}
                      >
                        Change PIN
                      </button>
                      <button
                        type="button"
                        className="profile-pin-manage__remove"
                        onClick={handleRemovePin}
                      >
                        Remove PIN
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="profile-pin-manage">
                    <p className="profile-pin-manage__status">
                      Not locked. Set a 4-digit PIN to require it before switching to,
                      editing, or deleting this profile — handy for keeping kids out of an
                      adult profile, or protecting one you'd rather keep private.
                    </p>
                    <div className="profile-pin-manage__row">
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="\d*"
                        autoComplete="off"
                        maxLength={PIN_LENGTH}
                        placeholder="New PIN"
                        value={pinDraft}
                        onChange={(e) =>
                          setPinDraft(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
                        }
                        onKeyDown={handlePinDraftKeyDown}
                        aria-label="New PIN"
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="\d*"
                        autoComplete="off"
                        maxLength={PIN_LENGTH}
                        placeholder="Confirm"
                        value={pinConfirmDraft}
                        onChange={(e) =>
                          setPinConfirmDraft(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))
                        }
                        onKeyDown={handlePinDraftKeyDown}
                        aria-label="Confirm new PIN"
                      />
                    </div>
                    {pinFormError && (
                      <p className="profile-create__error" role="alert">
                        {pinFormError}
                      </p>
                    )}
                    <div className="profile-pin-manage__buttons">
                      <button
                        type="button"
                        onClick={handleSetPin}
                        disabled={pinFormBusy || !pinDraft}
                      >
                        Set PIN
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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

      {/* PIN entry gate — shown on top of everything else (including the
          edit-form overlay above) whenever picking, editing, or deleting
          a PIN-locked profile requires unlocking it first. See pinGate
          state and openPinGate/submitPinGate/closePinGateAndProceed
          above for the flow. */}
      {pinGate && (
        <div
          className="profile-pin__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Enter PIN for ${pinGate.profile.name}`}
        >
          <div className="profile-pin">
            <ProfileAvatar profile={pinGate.profile} size={64} />
            <h2 className="profile-pin__heading">{pinGate.profile.name} is locked</h2>
            <p className="profile-pin__hint">
              {pinGate.purpose === 'watch' &&
                `Enter the ${PIN_LENGTH}-digit PIN to switch to this profile.`}
              {pinGate.purpose === 'edit' &&
                `Enter the ${PIN_LENGTH}-digit PIN to manage this profile.`}
              {pinGate.purpose === 'delete' &&
                `Enter the ${PIN_LENGTH}-digit PIN to delete this profile.`}
            </p>

            <input
              type="password"
              inputMode="numeric"
              pattern="\d*"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              value={pinGate.digits}
              onChange={handlePinDigitsChange}
              disabled={isPinLocked}
              autoFocus
              className="profile-pin__input"
              aria-label={`${PIN_LENGTH}-digit PIN`}
            />

            {isPinLocked ? (
              <p className="profile-pin__error" role="alert">
                Too many incorrect attempts. Try again in {pinRemainingSeconds}s.
              </p>
            ) : (
              pinGate.error && (
                <p className="profile-pin__error" role="alert">
                  {pinGate.error}
                </p>
              )
            )}

            <div className="profile-pin__buttons">
              <button
                type="button"
                className="profile-create__cancel"
                onClick={() => setPinGate(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}