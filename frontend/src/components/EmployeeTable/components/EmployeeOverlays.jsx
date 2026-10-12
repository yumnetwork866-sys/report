import React from 'react';
import { createPortal } from 'react-dom';

export const EmployeeOverlays = ({
  closeEditor,
  confirm,
  confirmPending,
  editingUser,
  error,
  form,
  getRoleLabel,
  handleBackdropClick,
  handleChange,
  handleSubmit,
  isEditorOpen,
  roleOptions,
  runConfirm,
  saving,
  setConfirm,
  t,
  teams,
  toast,
}) => (
  <>
    {isEditorOpen ? createPortal(
      <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
        <div
          className="modal-card employee-table__modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-editor-title"
        >
          <div className="employee-table__modal-header">
            <div>
              <span className="employee-table__modal-eyebrow">{t('users.account')}</span>
              <h2 id="user-editor-title" className="section-card__title">
                {editingUser ? t('users.editorEdit') : t('users.editorCreate')}
              </h2>
              {!editingUser ? (
                <p className="section-card__meta">
                  {t('users.createMeta')}
                </p>
              ) : null}
            </div>
            <button
              className="employee-table__modal-close"
              type="button"
              onClick={closeEditor}
              aria-label={t('users.close')}
            >
              ×
            </button>
          </div>
    
          {error ? (
            <section className="empty-state empty-state--compact employee-table__modal-error" role="alert">
              <div>{error}</div>
            </section>
          ) : null}
    
          <form className="employee-table__modal-form" onSubmit={handleSubmit}>
    
            <div className="field">
              <label htmlFor="name">{t('users.fullName')}</label>
              <input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Nguyễn Văn A" />
            </div>
            <div className="field">
              <label htmlFor="email">{t('users.email')}</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="name@company.com" />
            </div>
            <div className="field">
              <label htmlFor="password">{t('users.password')}</label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                minLength="8"
                required={!editingUser}
                placeholder={editingUser ? t('users.passwordEditPlaceholder') : t('users.passwordPlaceholder')}
              />
              {!editingUser ? (
                <p className="employee-table__field-hint">
                  {t('users.passwordHint')}
                </p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="role">{t('users.role')}</label>
              <select id="role" name="role" value={form.role} onChange={handleChange}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{getRoleLabel(role)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="content-team">{t('users.team')}</label>
              <select id="content-team" name="content_team_id" value={form.content_team_id} onChange={handleChange}>
                <option value="">{t('users.unassignedTeam')}</option>
                {teams.map((team) => <option key={team.id} value={String(team.id)}>{team.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="content-hashtags">{t('users.hashtags')}</label>
              <input id="content-hashtags" name="content_hashtags" value={form.content_hashtags} onChange={handleChange} placeholder={t('users.hashtagsPlaceholder')} />
            </div>
            <div className="actions employee-table__modal-actions">
              <button className="button button--ghost" type="button" onClick={closeEditor} disabled={saving}>
                {t('users.cancel')}
              </button>
              <button className="button" type="submit" disabled={saving}>
                {saving ? (editingUser ? t('users.saving') : t('users.creating')) : (editingUser ? t('users.save') : t('users.create'))}
              </button>
            </div>
          </form>
        </div>
      </div>,
      document.body,
    ) : null}
    
    {confirm ? createPortal(
      <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !confirmPending) setConfirm(null); }}>
        <div className="modal-card confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
          <h2 id="confirm-modal-title" className="section-card__title">{confirm.title}</h2>
          <p className="confirm-modal__message">{confirm.message}</p>
          <div className="actions confirm-modal__actions">
            <button className="button button--ghost" type="button" onClick={() => setConfirm(null)} disabled={confirmPending}>
              {t('users.cancel')}
            </button>
            <button className="button button--danger" type="button" onClick={runConfirm} disabled={confirmPending}>
              {confirmPending ? t('users.deleting') : confirm.confirmLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    ) : null}
    
    {toast ? createPortal(
      <div className={`toast employee-table__toast toast--${toast.status}`} role="status">
        {toast.message}
      </div>,
      document.body,
    ) : null}
  </>
);
