import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import AppLogo from './AppLogo';
import {
  getFacebookOauthUrl,
  getTikTokOauthUrl,
  startTikTokPartnerOauth,
  startTikTokShopOauth,
  updateUser,
} from '../lib/api';
import { clearStoredSession, hasPermission, isAdminSession, saveStoredSession } from '../lib/session';
import { useSession } from '../lib/useSession';
import { useI18n } from '../lib/language';
import { setStoredCurrency, useCurrency } from '../lib/currency';
import { topNavItems } from '../routes/navigation';

const TikTokGlyph = () => (
  <svg viewBox="0 0 24 24" focusable="false">
    <path fill="#25f4ee" d="M13.2 3.2v10.2a3.1 3.1 0 1 1-2.3-3V13a1.3 1.3 0 1 0 .5 1V3.2h1.8Zm0 0c.4 2.1 1.7 3.4 3.8 3.9v2.2a7 7 0 0 1-3.8-1.7V3.2Z" transform="translate(-.8 .7)" />
    <path fill="#fe2c55" d="M13.2 3.2v10.2a3.1 3.1 0 1 1-2.3-3V13a1.3 1.3 0 1 0 .5 1V3.2h1.8Zm0 0c.4 2.1 1.7 3.4 3.8 3.9v2.2a7 7 0 0 1-3.8-1.7V3.2Z" transform="translate(.7 -.2)" />
    <path fill="#111827" d="M13.2 3.2v10.2a3.1 3.1 0 1 1-2.3-3V13a1.3 1.3 0 1 0 .5 1V3.2h1.8Zm0 0c.4 2.1 1.7 3.4 3.8 3.9v2.2a7 7 0 0 1-3.8-1.7V3.2Z" />
  </svg>
);

const ConnectionIcon = ({ type }) => {
  if (type === 'facebook') {
    return (
      <span className="topbar__connect-icon topbar__connect-icon--facebook" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <rect width="32" height="32" rx="8" fill="#1877f2" />
          <path fill="#fff" d="M18.5 27V17.2h3.3l.5-3.8h-3.8V11c0-1.1.3-1.8 1.9-1.8h2V5.8c-.4 0-1.6-.2-3-.2-3 0-5 1.8-5 5.1v2.8H11v3.8h3.4V27h4.1Z" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`topbar__connect-icon${type === 'creator' || type === 'shop' ? ' topbar__connect-icon--creator' : ''}`} aria-hidden="true">
      <TikTokGlyph />
      {type === 'creator' || type === 'shop' ? (
        <span className="topbar__connect-creator-mark">
          {type === 'shop' ? <span aria-hidden="true">▣</span> : <svg viewBox="0 0 16 16" focusable="false"><circle cx="8" cy="5.3" r="2.4" fill="currentColor" /><path fill="currentColor" d="M3.7 13c.3-2.5 1.8-3.8 4.3-3.8s4 1.3 4.3 3.8H3.7Z" /></svg>}
        </span>
      ) : null}
    </span>
  );
};

const prepareAvatarImage = (file) => new Promise((resolve, reject) => {
  if (!file?.type?.startsWith('image/')) {
    reject(new Error('Please choose an image file'));
    return;
  }

  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - cropSize) / 2;
    const sourceY = (image.naturalHeight - cropSize) / 2;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);
    URL.revokeObjectURL(sourceUrl);
    resolve(canvas.toDataURL('image/jpeg', 0.78));
  };
  image.onerror = () => {
    URL.revokeObjectURL(sourceUrl);
    reject(new Error('Unable to read this image'));
  };
  image.src = sourceUrl;
});

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const hasSession = Boolean(session);
  const isAdmin = isAdminSession(session);
  const [activeMenu, setActiveMenu] = useState(null);
  const [connectingTarget, setConnectingTarget] = useState(null);
  const [connectionError, setConnectionError] = useState('');
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [accountDialog, setAccountDialog] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [avatarPreview, setAvatarPreview] = useState('');
  const accountRootRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const connectRootRef = useRef(null);
  const connectTriggerRef = useRef(null);
  const connectMenuRef = useRef(null);
  const { t, language, setLanguage } = useI18n();
  const currency = useCurrency();

  const userName = String(session?.user?.name || session?.user?.email || 'Admin').trim();
  const userEmail = String(session?.user?.email || '').trim();
  const userRole = String(session?.user?.role || session?.role || '').trim();
  const avatarText = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase() || 'A';
  const avatarSeed = String(session?.user?.id || session?.user?.email || userName);
  const fallbackAvatarUrl = `https://api.dicebear.com/10.x/pixel-art/svg?seed=${encodeURIComponent(avatarSeed)}&backgroundColor=e6f7f5`;
  const avatarUrl = session?.user?.avatar_url || fallbackAvatarUrl;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  useEffect(() => {
    if (!activeMenu) return undefined;

    const handlePointerDown = (event) => {
      const activeRoot = activeMenu === 'connect' ? connectRootRef.current : accountRootRef.current;
      if (activeRoot && !activeRoot.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        const trigger = activeMenu === 'connect' ? connectTriggerRef.current : accountTriggerRef.current;
        setActiveMenu(null);
        window.requestAnimationFrame(() => trigger?.focus());
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [activeMenu]);

  useEffect(() => {
    setActiveMenu(null);
    setConnectionError('');
  }, [location.pathname]);

  const handleSignOut = () => {
    clearStoredSession();
    setActiveMenu(null);
    navigate('/');
  };

  const handleLanguageChange = (nextLanguage) => {
    setLanguage(nextLanguage);
  };

  const navLabels = {
    '/dashboard': t('nav.tiktok'),
    '/chatbot': t('nav.facebook'),
    '/whatsapp': t('nav.whatsapp'),
  };
  const currentLanguage = language;
  const connectionOptions = [
    { id: 'tiktok', group: 'tiktok', label: t('header.connectTikTok'), meta: t('header.connectTikTokMeta') },
    { id: 'creator', group: 'tiktok', label: t('header.connectTikTokCreator'), meta: t('header.connectTikTokCreatorMeta') },
    { id: 'shop', group: 'tiktok', label: t('header.connectTikTokShop'), meta: t('header.connectTikTokShopMeta') },
    { id: 'facebook', group: 'facebook', label: t('header.connectFacebook'), meta: t('header.connectFacebookMeta') },
  ];
  const connectionGroups = [
    { id: 'tiktok', label: 'TikTok' },
    { id: 'facebook', label: 'Facebook' },
  ];
  const canAccessTopNavItem = (item) => hasPermission(session, item.permission)
    || (item.alternatePermission && hasPermission(session, item.alternatePermission));
  const topNavTarget = (item) => hasPermission(session, item.permission)
    ? item.to
    : item.fallbackTo || item.to;
  const isTopNavActive = (to) => {
    if (to === '/manage/users') {
      return location.pathname.startsWith('/manage/users')
        || location.pathname.startsWith('/manage/shops')
        || location.pathname.startsWith('/manage/schedules')
        || location.pathname.startsWith('/chatbot/chat-setting');
    }
    if (to === '/chatbot') {
      return location.pathname.startsWith('/chatbot') && !location.pathname.startsWith('/chatbot/chat-setting');
    }
    if (to === '/whatsapp') {
      return location.pathname.startsWith('/whatsapp');
    }
    if (to === '/dashboard') {
      return [
        '/dashboard',
        '/channel-reports',
        '/manage/channels',
        '/videos',
        '/manage/affiliate',
        '/manage/koc-performance',
        '/manage/shop-analytics',
        '/manage/video-analytics',
        '/bookings',
        '/reports',
      ].some((prefix) => location.pathname.startsWith(prefix));
    }
    return location.pathname.startsWith(to);
  };
  const focusConnectionItem = (position) => {
    window.requestAnimationFrame(() => {
      const items = Array.from(connectMenuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
      if (!items.length) return;
      items[position === 'last' ? items.length - 1 : 0].focus();
    });
  };

  const handleConnectTriggerKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    setActiveMenu('connect');
    setConnectionError('');
    focusConnectionItem(event.key === 'ArrowUp' ? 'last' : 'first');
  };

  const handleConnectMenuKeyDown = (event) => {
    const items = Array.from(connectMenuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex].focus();
  };

  const startConnection = async (target) => {
    try {
      setConnectingTarget(target);
      setConnectionError('');
      let authorizeUrl;
      if (target === 'tiktok') authorizeUrl = await getTikTokOauthUrl();
      if (target === 'creator') {
        ({ authorizeUrl } = await startTikTokPartnerOauth('/manage/koc-performance', { createKoc: true }));
      }
      if (target === 'shop') ({ authorizeUrl } = await startTikTokShopOauth());
      if (target === 'facebook') authorizeUrl = await getFacebookOauthUrl();
      if (!authorizeUrl) throw new Error(t('header.connectionError'));
      setActiveMenu(null);
      window.location.assign(authorizeUrl);
    } catch (error) {
      setConnectionError(error.message || t('header.connectionError'));
    } finally {
      setConnectingTarget(null);
    }
  };

  const closeAccountDialog = () => {
    setAccountDialog(null);
    setProfileError('');
    setPasswordForm({ password: '', confirmPassword: '' });
  };

  const saveSessionUser = (updatedUser) => {
    saveStoredSession({ ...session, user: updatedUser });
  };

  const handlePasswordUpdate = async (event) => {
    event.preventDefault();
    if (passwordForm.password.length < 8) {
      setProfileError(t('header.passwordMinLength'));
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setProfileError(t('header.passwordMismatch'));
      return;
    }

    try {
      setProfileSaving(true);
      setProfileError('');
      const updatedUser = await updateUser(session.user.id, { password: passwordForm.password });
      saveSessionUser(updatedUser);
      closeAccountDialog();
    } catch (error) {
      setProfileError(error.message || t('header.profileUpdateError'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpdate = async () => {
    if (!avatarPreview.startsWith('data:image/')) {
      setProfileError(t('header.avatarRequired'));
      return;
    }
    try {
      setProfileSaving(true);
      setProfileError('');
      const updatedUser = await updateUser(session.user.id, { avatar_url: avatarPreview });
      saveSessionUser(updatedUser);
      closeAccountDialog();
    } catch (error) {
      setProfileError(error.message || t('header.profileUpdateError'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarFile = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      setProfileError('');
      const preparedImage = await prepareAvatarImage(file);
      if (preparedImage.length > 90_000) throw new Error(t('header.avatarTooLarge'));
      setAvatarPreview(preparedImage);
    } catch (error) {
      setProfileError(error.message || t('header.avatarInvalid'));
    } finally {
      event.target.value = '';
    }
  };

  return (
    <>
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand" aria-label="Go to home">
          <AppLogo size="sm" />
          <div className="brand__text">
            <div className="brand__name">{t('app.name')}</div>
          </div>
        </Link>

        <nav className="topbar__nav" aria-label="Primary">
          <div className="topbar__tabs">
            {topNavItems.filter(canAccessTopNavItem).map((item) => {
              const target = topNavTarget(item);
              const active = isTopNavActive(target);
              return (
              <Link
                key={item.to}
                to={target}
                className={`topbar__nav-link${active ? ' topbar__nav-link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {navLabels[item.to] || item.label}
              </Link>
              );
            })}
          </div>
          <div className="topbar__actions">
            {hasSession ? (
              <>
              <div className="topbar__connect" ref={connectRootRef}>
                <button
                  ref={connectTriggerRef}
                  type="button"
                  className="topbar__connect-trigger"
                  aria-haspopup="menu"
                  aria-controls="topbar-connect-menu"
                  aria-expanded={activeMenu === 'connect'}
                  onClick={() => {
                    setConnectionError('');
                    setActiveMenu((current) => current === 'connect' ? null : 'connect');
                  }}
                  onKeyDown={handleConnectTriggerKeyDown}
                >
                  <Link2 className="topbar__connect-trigger-icon" size={16} strokeWidth={2.25} aria-hidden="true" />
                  <span>{t('header.connect')}</span>
                </button>
                {activeMenu === 'connect' ? (
                  <div
                    id="topbar-connect-menu"
                    ref={connectMenuRef}
                    className="topbar__connect-menu"
                    role="menu"
                    aria-label={t('header.connections')}
                    aria-busy={Boolean(connectingTarget)}
                    onKeyDown={handleConnectMenuKeyDown}
                  >
                    <div className="topbar__connect-head">
                      <strong>{t('header.connections')}</strong>
                      <span>{t('header.connectionsMeta')}</span>
                    </div>
                    {connectionGroups.map((group) => (
                      <div className="topbar__connect-group" key={group.id} role="presentation">
                        <span className="topbar__connect-group-label">{group.label}</span>
                        {connectionOptions.filter((option) => option.group === group.id).map((option) => (
                          <button
                            className="topbar__connect-item"
                            type="button"
                            role="menuitem"
                            key={option.id}
                            disabled={Boolean(connectingTarget)}
                            onClick={() => startConnection(option.id)}
                          >
                            <ConnectionIcon type={option.id} />
                            <span className="topbar__connect-copy">
                              <strong>{option.label}</strong>
                              <small>{connectingTarget === option.id ? t('header.connecting') : option.meta}</small>
                            </span>
                            <span className="topbar__connect-arrow" aria-hidden="true">→</span>
                          </button>
                        ))}
                      </div>
                    ))}
                    {connectionError ? <p className="topbar__connect-error" role="alert">{connectionError}</p> : null}
                  </div>
                ) : null}
              </div>
              <div className="topbar__account" ref={accountRootRef}>
              <button
                ref={accountTriggerRef}
                type="button"
                className="topbar__avatar-button"
                aria-label="Open account menu"
                aria-expanded={activeMenu === 'account'}
                onClick={() => setActiveMenu((current) => current === 'account' ? null : 'account')}
              >
                <span className="topbar__avatar">
                  {avatarLoadFailed ? avatarText : (
                    <img
                      src={avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarLoadFailed(true)}
                    />
                  )}
                </span>
              </button>
              {activeMenu === 'account' ? (
                <div className="topbar__account-menu" role="menu" aria-label="Account menu">
                  <div className="topbar__account-head">
                    <div className="topbar__account-identity">
                      <strong>{userName}</strong>
                      {userRole ? <small>{userRole}</small> : null}
                    </div>
                    {userEmail ? <span>{userEmail}</span> : null}
                  </div>
                  {isAdmin ? (
                    <Link
                      to="/chatbot/chat-setting"
                      className="topbar__account-item"
                      role="menuitem"
                      onClick={() => setActiveMenu(null)}
                    >
                      {t('header.settings')}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="topbar__account-item"
                    role="menuitem"
                    onClick={() => {
                      setActiveMenu(null);
                      setProfileError('');
                      setAccountDialog('password');
                    }}
                  >
                    {t('header.changePassword')}
                  </button>
                  <button
                    type="button"
                    className="topbar__account-item"
                    role="menuitem"
                    onClick={() => {
                      setActiveMenu(null);
                      setProfileError('');
                      setAvatarPreview(session?.user?.avatar_url || '');
                      setAccountDialog('avatar');
                    }}
                  >
                    {t('header.changeAvatar')}
                  </button>
                  <div className="topbar__account-section" aria-label={t('header.language')}>
                    <span className="topbar__account-section-label">{t('header.language')}</span>
                    <button
                      type="button"
                      className={`topbar__language-switch${currentLanguage === 'en' ? ' topbar__language-switch--en' : ' topbar__language-switch--vi'}`}
                      onClick={() => handleLanguageChange(currentLanguage === 'en' ? 'vi' : 'en')}
                      role="menuitemcheckbox"
                      aria-checked={currentLanguage === 'en'}
                    >
                      <span className="topbar__language-switch-label topbar__language-switch-label--vi">VI</span>
                      <span className="topbar__language-switch-label topbar__language-switch-label--en">EN</span>
                    </button>
                  </div>
                  <div className="topbar__account-section" aria-label={t('header.currency')}>
                    <span className="topbar__account-section-label">{t('header.currency')}</span>
                    <button
                      type="button"
                      className={`topbar__currency-switch${currency === 'VND' ? ' topbar__currency-switch--vnd' : ' topbar__currency-switch--myr'}`}
                      onClick={() => setStoredCurrency(currency === 'MYR' ? 'VND' : 'MYR')}
                      role="menuitemcheckbox"
                      aria-checked={currency === 'VND'}
                    >
                      <span className="topbar__currency-switch-label topbar__currency-switch-label--myr">RM</span>
                      <span className="topbar__currency-switch-label topbar__currency-switch-label--vnd">VNĐ</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="topbar__account-item topbar__account-item--danger"
                    role="menuitem"
                    onClick={handleSignOut}
                  >
                    {t('header.signOut')}
                  </button>
                </div>
              ) : null}
                </div>
              </>
            ) : (
              <Link to="/login" className="button button--ghost topbar__nav-button">
                {t('header.signIn')}
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
    {accountDialog ? (
      <div className="modal-backdrop account-dialog" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeAccountDialog();
      }}>
        <section className="modal-card account-dialog__card" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
          <div className="account-dialog__header">
            <div>
              <h2 id="account-dialog-title">
                {accountDialog === 'password' ? t('header.changePassword') : t('header.changeAvatar')}
              </h2>
              <p>{accountDialog === 'password' ? t('header.changePasswordMeta') : t('header.changeAvatarMeta')}</p>
            </div>
            <button type="button" className="account-dialog__close" onClick={closeAccountDialog} aria-label={t('header.close')}>×</button>
          </div>

          {accountDialog === 'password' ? (
            <form className="account-dialog__form" onSubmit={handlePasswordUpdate}>
              <label className="field">
                <span>{t('header.newPassword')}</span>
                <input
                  type="password"
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label className="field">
                <span>{t('header.confirmPassword')}</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              {profileError ? <p className="account-dialog__error" role="alert">{profileError}</p> : null}
              <div className="account-dialog__actions">
                <button type="button" className="button button--ghost" onClick={closeAccountDialog}>{t('header.cancel')}</button>
                <button type="submit" className="button" disabled={profileSaving}>{profileSaving ? t('header.saving') : t('header.save')}</button>
              </div>
            </form>
          ) : (
            <div className="account-dialog__form">
              <div className="account-dialog__upload">
                <div className="account-dialog__avatar-preview">
                  <img src={avatarPreview || avatarUrl} alt={t('header.avatarPreview')} />
                </div>
                <div className="account-dialog__upload-copy">
                  <strong>{t('header.uploadAvatar')}</strong>
                  <span>{t('header.uploadAvatarMeta')}</span>
                  <label className="button button--ghost account-dialog__upload-button">
                    {t('header.chooseImage')}
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarFile} />
                  </label>
                </div>
              </div>
              {profileError ? <p className="account-dialog__error" role="alert">{profileError}</p> : null}
              <div className="account-dialog__actions">
                <button type="button" className="button button--ghost" onClick={closeAccountDialog}>{t('header.cancel')}</button>
                <button type="button" className="button" disabled={profileSaving} onClick={handleAvatarUpdate}>{profileSaving ? t('header.saving') : t('header.save')}</button>
              </div>
            </div>
          )}
        </section>
      </div>
    ) : null}
    </>
  );
};

export default Header;
