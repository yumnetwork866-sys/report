import React from 'react';
import { createPortal } from 'react-dom';

import AppAvatar from '../../AppAvatar';

export const EmployeeOverlays = ({
  bookingDrawerUser,
  closeBookingsDrawer,
  closeEditor,
  confirm,
  confirmPending,
  editingUser,
  error,
  form,
  getRoleLabel,
  handleBackdropClick,
  handleChange,
  handleReassignAllBookings,
  handleSubmit,
  handleUnassignAllBookings,
  handleUnassignSingleBooking,
  isEditorOpen,
  roleOptions,
  runConfirm,
  saving,
  setConfirm,
  setTargetReassignStaffId,
  t,
  targetReassignStaffId,
  teams,
  toast,
  userBookings,
  userBookingsBusy,
  userBookingsError,
  userBookingsLoading,
  users,
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
    
    {bookingDrawerUser ? createPortal(
      <div
        className="koc-drawer-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBookingsDrawer();
        }}
      >
        <aside className="koc-drawer" role="dialog" aria-modal="true" aria-labelledby="user-bookings-drawer-title">
          <div className="koc-drawer__header">
            <div className="employee-table__account-cell">
              <AppAvatar
                src={bookingDrawerUser.avatar_url}
                name={bookingDrawerUser.name}
                seed={bookingDrawerUser.id}
                className="employee-table__avatar"
              />
              <div>
                <h2 id="user-bookings-drawer-title" className="section-card__title">
                  {t('users.userBookingsTitle', { name: bookingDrawerUser.name })}
                </h2>
                <p>{bookingDrawerUser.email || t('users.userBookingsSubtitle')}</p>
              </div>
            </div>
            <button
              className="button button--ghost"
              type="button"
              onClick={closeBookingsDrawer}
              disabled={userBookingsBusy}
              aria-label={t('users.close')}
            >
              ×
            </button>
          </div>
    
          <div className="koc-drawer__body">
            {userBookingsLoading ? (
              <div className="empty-state table-empty-state">
                <div className="loading-dot" />
                <div>{t('users.loading')}</div>
              </div>
            ) : userBookingsError ? (
              <section className="empty-state empty-state--compact employee-table__modal-error" role="alert">
                <div>{userBookingsError}</div>
              </section>
            ) : userBookings.length === 0 ? (
              <div className="empty-state">{t('users.noAssignedBookings')}</div>
            ) : (
              <>
                <div className="user-bookings-drawer__toolbar">
                  <span className="chip">{t('users.userBookingsCount', { count: userBookings.length })}</span>
                  <button
                    type="button"
                    className="button button--small button--danger"
                    onClick={handleUnassignAllBookings}
                    disabled={userBookingsBusy}
                  >
                    {userBookingsBusy ? t('users.unassigning') : t('users.unassignAll')}
                  </button>
                </div>
    
                <div className="user-bookings-drawer__reassign-box">
                  <select
                    className="employee-table__inline-select"
                    value={targetReassignStaffId}
                    onChange={(e) => setTargetReassignStaffId(e.target.value)}
                    disabled={userBookingsBusy}
                  >
                    <option value="">{t('users.selectTargetStaff')}</option>
                    {users
                      .filter((u) => u.id !== bookingDrawerUser.id && u.is_active !== false)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email || getRoleLabel(u.role)})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="button button--small"
                    onClick={handleReassignAllBookings}
                    disabled={userBookingsBusy || !targetReassignStaffId}
                  >
                    {userBookingsBusy ? t('users.reassigning') : t('users.reassignAll')}
                  </button>
                </div>
    
                <div className="table-wrap">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>KOC</th>
                        <th>Shop</th>
                        <th className="cell-number">Chi phí</th>
                        <th>Trạng thái</th>
                        <th className="cell-actions">{t('users.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userBookings.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <div className="employee-table__account-cell">
                              {b.creator_avatar_url ? (
                                <img
                                  src={b.creator_avatar_url}
                                  alt=""
                                  className="employee-table__avatar"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="creator-identity__avatar creator-identity__avatar--fallback">
                                  {(b.creator_name || b.creator_username || 'K').trim().slice(0, 1).toUpperCase()}
                                </span>
                              )}
                              <div className="employee-table__account">
                                <span className="row-title">{b.creator_name || b.creator_username || 'KOC'}</span>
                                <span className="row-subtitle">@{b.creator_username || '—'}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <small>{b.target_shop?.name || '—'}</small>
                          </td>
                          <td className="cell-number">
                            <strong>
                              {Number(b.total_cost ?? b.booking_cost ?? 0).toLocaleString()}{' '}
                              {b.currency || 'MYR'}
                            </strong>
                          </td>
                          <td>
                            <span className={`chip status-chip status-chip--${b.status || 'draft'}`}>
                              {b.status || 'draft'}
                            </span>
                          </td>
                          <td className="cell-actions">
                            <button
                              type="button"
                              className="button button--small button--ghost button--danger"
                              onClick={() => handleUnassignSingleBooking(b)}
                              disabled={userBookingsBusy}
                              title={t('users.unassign')}
                            >
                              {t('users.unassign')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>,
      document.body,
    ) : null}
    
  </>
);
