import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../lib/api';
import { saveStoredSession } from '../lib/session';
import { useI18n } from '../lib/language';

const Login = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [form, setForm] = useState({
    identifier: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError('');
      const session = await loginAdmin(form);
      saveStoredSession(session);
      navigate('/shop/analytics', { replace: true });
    } catch (err) {
      setError(err.message || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-form-title">
        <div className="login-card__header">
          <h2 id="login-form-title">{t('login.formTitle')}</h2>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="login-form__error" role="alert">
              <span className="login-form__error-icon" aria-hidden="true">!</span>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="field login-form__field">
            <label htmlFor="identifier">{t('login.identifier')}</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              value={form.identifier}
              onChange={handleChange}
              placeholder={t('login.identifierPlaceholder')}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="field login-form__field">
            <label htmlFor="password">{t('login.password')}</label>
            <div className="login-form__password">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                onKeyDown={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
                onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
                onBlur={() => setCapsLockOn(false)}
                required
              />
              <button
                type="button"
                className="login-form__password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                      <path d="M9.9 4.3A10.7 10.7 0 0 1 12 4c5.2 0 8.5 4.2 9.5 6-.4.8-1.3 2.2-2.7 3.4M6.2 6.2C4.4 7.4 3.2 9.1 2.5 10c1 1.8 4.3 6 9.5 6 1 0 2-.2 2.8-.5" />
                    </>
                  ) : (
                    <>
                      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6S18 18 12 18 2.5 12 2.5 12Z" />
                      <circle cx="12" cy="12" r="2.5" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            {capsLockOn ? <small className="login-form__hint">{t('login.capsLock')}</small> : null}
          </div>

          <button className="button login-form__submit" type="submit" disabled={loading}>
            {loading ? <span className="login-form__spinner" aria-hidden="true" /> : null}
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className="login-card__support">
          <span>{t('login.supportPrefix')}</span>{' '}
          <a
            href="https://wa.me/message/TJP53DL4W2OHK1"
            target="_blank"
            rel="noopener noreferrer"
            className="login-card__support-link"
          >
            {t('login.supportLink')}
          </a>
        </p>
      </section>
    </main>
  );
};

export default Login;
