import React from 'react';
import { CheckCheck, Lock, Trash2, X } from 'lucide-react';
import AppAvatar from '../AppAvatar';
import Pagination from '../Pagination';
import { EmployeeOverlays } from './components/EmployeeOverlays';
import { useEmployeeManagement } from './hooks/useEmployeeManagement';
import '../../styles/pages/admin.css';

const EmployeeTable = ({ heroTitle, heroSubtitle }) => {
  const {
    activeFilters,
    activeTab,
    activeUsers,
    allPageSelected,
    bookingDrawerUser,
    bulkAssignTeam,
    bulkBusy,
    bulkChangeRole,
    closeBookingsDrawer,
    closeEditor,
    confirm,
    confirmBulkDelete,
    confirmPending,
    currentPage,
    deletingId,
    disabledUsers,
    editRole,
    editTeam,
    editingRoleKey,
    editingTeamId,
    editingUser,
    error,
    filteredRows,
    form,
    getRoleLabel,
    handleAttributionChange,
    handleBackdropClick,
    handleChange,
    handleDelete,
    handleDeleteRole,
    handleDeleteTeam,
    handleReassignAllBookings,
    handleRoleSubmit,
    handleSubmit,
    handleTeamSubmit,
    handleToggleActive,
    handleUnassignAllBookings,
    handleUnassignSingleBooking,
    isAdmin,
    isEditorOpen,
    loading,
    openActions,
    openBookingsDrawer,
    openCreateModal,
    openEditModal,
    pageRows,
    queryInput,
    resetRoleForm,
    resetTeamForm,
    roleError,
    roleFilter,
    roleForm,
    roleOptions,
    roleSaving,
    roles,
    runConfirm,
    saving,
    selectAllRef,
    selectedIds,
    setActiveTab,
    setConfirm,
    setCurrentPage,
    setOpenActions,
    setQueryInput,
    setRoleFilter,
    setRoleForm,
    setSelectedIds,
    setTargetReassignStaffId,
    setTeamFilter,
    setTeamForm,
    t,
    targetReassignStaffId,
    teamError,
    teamFilter,
    teamForm,
    teamSaving,
    teams,
    toast,
    toggleActionsMenu,
    toggleRolePermission,
    toggleSelect,
    toggleSelectAll,
    togglingId,
    totalPages,
    userBookings,
    userBookingsBusy,
    userBookingsError,
    userBookingsLoading,
    users,
  } = useEmployeeManagement();
  return (
    <div className="page employee-table-page">
      <section className="page__hero admin-page__hero employee-table__hero">
        <div className="employee-table__hero-copy">
          <h1 className="page__title">{t('users.heroTitle') || heroTitle}</h1>
          {heroSubtitle ? <p className="page__subtitle">{heroSubtitle}</p> : null}
        </div>

        {activeTab === 'users' || activeTab === 'disabled' ? (
          <div className="employee-table__hero-actions">
          <button className="button" type="button" onClick={openCreateModal}>
            {t('users.create')}
          </button>
          </div>
        ) : null}
      </section>

      <nav className="employee-table__tabs" aria-label="Quản lý hệ thống">
        {[
          { key: 'users', label: 'Người dùng', count: activeUsers.length },
          { key: 'disabled', label: 'Đã khóa', count: disabledUsers.length },
          { key: 'teams', label: 'Team', count: teams.length },
          { key: 'roles', label: 'Vai trò', count: roles.length },
        ].map((tab) => (
          <button
            className={`employee-table__tab${activeTab === tab.key ? ' is-active' : ''}`}
            type="button"
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
              setSelectedIds(new Set());
              setCurrentPage(1);
            }}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            <span>{tab.label}</span>
            <strong>{tab.count}</strong>
          </button>
        ))}
      </nav>

      {activeTab === 'users' || activeTab === 'disabled' ? (
        <>
          {error && !isEditorOpen ? (
            <section className="section-card empty-state empty-state--compact">
              <div>{error}</div>
            </section>
          ) : null}

          <section className="section-card employee-table__table-card">
        <div className="section-card__header section-card__header--compact">
          <div>
            <h2 className="section-card__title">{t('users.list')}</h2>
            <p className="section-card__meta">
              {t('users.showing', { visible: pageRows.length, total: filteredRows.length })}
            </p>
          </div>
        </div>

        <div className="employee-table__toolbar">
          <div className="employee-table__search">
            <label className="sr-only" htmlFor="user-search">{t('users.search')}</label>
            <input
              id="user-search"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder={t('users.searchPlaceholder')}
            />
          </div>
          <div className="employee-table__role-filter employee-table__select-wrap">
            <label className="sr-only" htmlFor="user-role-filter">{t('users.filterRole')}</label>
            <select
              id="user-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">{t('users.allRoles')}</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>{getRoleLabel(role)}</option>
              ))}
            </select>
          </div>
          <div className="employee-table__team-filter employee-table__select-wrap">
            <label className="sr-only" htmlFor="user-team-filter">Lọc theo team</label>
            <select
              id="user-team-filter"
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
            >
              <option value="all">Tất cả team</option>
              <option value="unassigned">Chưa có team</option>
              {teams.map((team) => (
                <option key={team.id} value={String(team.id)}>{team.name}</option>
              ))}
            </select>
          </div>
          {activeFilters ? (
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={() => {
                setQueryInput('');
                setRoleFilter('all');
                setTeamFilter('all');
              }}
              disabled={!activeFilters}
            >
              {t('users.clearFilter')}
            </button>
          ) : null}
        </div>

          {selectedIds.size > 0 ? (
            <div className="employee-table__bulk-bar">
              <span className="employee-table__bulk-count">
                <span className="employee-table__bulk-count-badge" aria-hidden="true"><CheckCheck size={14} /></span>
                {t('users.bulkSelected', { count: selectedIds.size })}
              </span>
              <div className="employee-table__bulk-tools">
                <label className="employee-table__bulk-action">
                  <span className="sr-only">{t('users.bulkRolePlaceholder')}</span>
                  <select value="" onChange={(event) => bulkChangeRole(event.target.value)} disabled={bulkBusy}>
                    <option value="" disabled>{t('users.bulkRolePlaceholder')}</option>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{getRoleLabel(role)}</option>
                    ))}
                  </select>
                </label>
                <label className="employee-table__bulk-action">
                  <span className="sr-only">{t('users.bulkTeamPlaceholder')}</span>
                  <select value="" onChange={(event) => bulkAssignTeam(event.target.value)} disabled={bulkBusy}>
                    <option value="" disabled>{t('users.bulkTeamPlaceholder')}</option>
                    <option value="unassigned">{t('users.bulkUnassigned')}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={String(team.id)}>{team.name}</option>
                    ))}
                  </select>
                </label>
                {isAdmin ? (
                  <button className="button button--small button--danger employee-table__bulk-delete" type="button" onClick={confirmBulkDelete} disabled={bulkBusy}>
                    <Trash2 size={14} aria-hidden="true" />
                    {t('users.delete')}
                  </button>
                ) : null}
                <button className="button button--ghost button--small employee-table__bulk-clear" type="button" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}>
                  <X size={14} aria-hidden="true" />
                  {t('users.bulkClear')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="table-wrap">
          <table className="data-table employee-table__data-table">
            <thead>
              <tr>
                <th className="employee-table__select-cell">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label={t('users.selectAll')}
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>{t('users.account')}</th>
                <th>{t('users.role')}</th>
                <th>Team</th>
                <th>{t('users.hashtags')}</th>
                <th className="cell-actions">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={6}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('users.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : pageRows.length ? (
                pageRows.map((user) => (
                  <tr key={user.id} className={user.is_active === false ? 'is-disabled' : undefined}>
                    <td className="employee-table__select-cell">
                      <input
                        type="checkbox"
                        aria-label={t('users.selectUser', { name: user.name })}
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleSelect(user.id)}
                      />
                    </td>
                    <td>
                      <div className="employee-table__account-cell">
                        <AppAvatar src={user.avatar_url} name={user.name} seed={user.id} className="employee-table__avatar" />
                        <div className="employee-table__account">
                          <span className="row-title">{user.name}</span>
                          <span className="row-subtitle">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="chip employee-table__role-chip">{getRoleLabel(user.role)}</span>
                    </td>
                    <td className="employee-table__attribution-cell">
                      <select
                        className="employee-table__inline-select"
                        value={user.content_attribution?.team?.id ? String(user.content_attribution.team.id) : ''}
                        aria-label={`${t('users.team')}: ${user.name}`}
                        onChange={(event) => handleAttributionChange(user, 'content_team_id', event.target.value)}
                      >
                        <option value="">{t('users.unassignedTeam')}</option>
                        {teams.map((team) => <option key={team.id} value={String(team.id)}>{team.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        className="employee-table__inline-input"
                        defaultValue={(user.content_attribution?.hashtags || []).join(', ')}
                        aria-label={`${t('users.hashtags')}: ${user.name}`}
                        placeholder={t('users.hashtagsPlaceholder')}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          const current = (user.content_attribution?.hashtags || []).join(', ');
                          if (value !== current) handleAttributionChange(user, 'content_hashtags', value);
                        }}
                      />
                    </td>
                    <td className="cell-actions">
                      <div className="action-menu employee-table__action-menu">
                        <button
                          type="button"
                          className="action-menu__trigger"
                          aria-haspopup="menu"
                          aria-expanded={openActions.id === user.id}
                          aria-label={t('users.openActions', { name: user.name })}
                          onClick={(event) => toggleActionsMenu(user.id, event.currentTarget)}
                        >
                          ...
                        </button>
                        {openActions.id === user.id ? createPortal((
                          <div
                          className="action-menu__panel employee-table__action-menu-panel"
                          role="menu"
                          aria-label={`Thao tác với ${user.name}`}
                          style={{
                            position: 'fixed',
                            zIndex: 30000,
                            right: `${openActions.right}px`,
                            top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                            bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                          }}
                        >
                          <button
                            type="button"
                            className="action-menu__item"
                            role="menuitem"
                            onClick={() => {
                              setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                              openBookingsDrawer(user);
                            }}
                          >
                            {t('users.viewBookings')}
                          </button>
                          <button
                            type="button"
                            className="action-menu__item"
                            role="menuitem"
                            onClick={() => {
                              setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                              openEditModal(user);
                            }}
                          >
                            {t('users.edit')}
                          </button>
                          <button
                            type="button"
                            className="action-menu__item"
                            role="menuitem"
                            onClick={() => {
                              setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                              handleToggleActive(user);
                            }}
                            disabled={togglingId === user.id}
                          >
                            {togglingId === user.id ? t('users.saving') : (user.is_active === false ? t('users.enable') : t('users.disable'))}
                          </button>
                          {isAdmin ? (
                            <button
                              type="button"
                              className="action-menu__item action-menu__item--danger"
                              role="menuitem"
                              onClick={() => {
                                setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                                handleDelete(user);
                              }}
                              disabled={deletingId === user.id}
                            >
                              {deletingId === user.id ? t('users.deleting') : t('users.delete')}
                            </button>
                          ) : null}
                          </div>
                        ), document.body) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={6}>
                    <div className="empty-state empty-state--compact table-empty-state">
                      <div>{t('users.noMatch')}</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="employee-table__pagination">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            previousLabel={t('common.previous')}
            nextLabel={t('common.next')}
            ariaLabel={t('users.pageOf', { page: currentPage, total: totalPages })}
          />
        </div>
          </section>
        </>
      ) : null}

      {activeTab === 'teams' ? (
        <section className="section-card employee-table__management-card" aria-labelledby="team-manager-title">
          <div className="section-card__header">
            <div>
              <h2 id="team-manager-title" className="section-card__title">Quản lý team</h2>

            </div>
            <button className="button button--ghost button--small" type="button" onClick={resetTeamForm}>Thêm team</button>
          </div>

          {teamError ? <div className="employee-table__inline-error empty-state empty-state--compact">{teamError}</div> : null}

          <div className="employee-table__management-layout">
            <section className="employee-table__role-list-panel">
              <div className="employee-table__role-panel-heading">
                <div><strong>Danh sách team</strong><span>{teams.length} team</span></div>
              </div>
              <div className="employee-table__role-list">
                {teams.length ? teams.map((team) => (
                  <div className={`employee-table__role-item${editingTeamId === team.id ? ' is-active' : ''}`} key={team.id}>
                    <button type="button" className="employee-table__role-edit" onClick={() => editTeam(team)}>
                      <span><span className="employee-table__role-name"><strong>{team.name}</strong></span></span>
                      <span>{team.user_count || 0} nhân viên</span>
                    </button>
                    {isAdmin ? <button className="button button--ghost button--small button--danger" type="button" onClick={() => handleDeleteTeam(team)}>Xóa</button> : null}
                  </div>
                )) : <div className="empty-state empty-state--compact">Chưa có team.</div>}
              </div>
            </section>

            <form className="employee-table__role-form" onSubmit={handleTeamSubmit}>
              <div className="employee-table__manager-form-heading">
                <strong>{editingTeamId ? 'Sửa tên team' : 'Tạo team mới'}</strong>
                 <span>{editingTeamId ? 'Tên mới sẽ được cập nhật trên báo cáo.' : ''}</span>
              </div>
              <div className="field">
                <label htmlFor="content-team-name">Tên team</label>
                <input
                  id="content-team-name"
                  value={teamForm.name}
                  required
                  maxLength={120}
                  onChange={(event) => setTeamForm({ name: event.target.value })}
                  placeholder="Ví dụ: Content MKT"
                />
              </div>
              <div className="actions">
                {editingTeamId ? <button className="button button--ghost" type="button" onClick={resetTeamForm}>Hủy sửa</button> : null}
                <button className="button" type="submit" disabled={teamSaving}>
                  {teamSaving ? 'Đang lưu…' : editingTeamId ? 'Cập nhật' : 'Thêm team'}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {activeTab === 'roles' ? (
        <section className="section-card employee-table__management-card" aria-labelledby="role-manager-title">
          <div className="section-card__header">
            <div>
              <h2 id="role-manager-title" className="section-card__title">{t('users.manageRoles')}</h2>
            </div>
            <button className="button button--small" type="button" onClick={resetRoleForm}>{t('users.addRole')}</button>
          </div>

          {roleError ? <div className="employee-table__inline-error empty-state empty-state--compact">{roleError}</div> : null}

          <div className="employee-table__management-layout">
            <section className="employee-table__role-list-panel">
              <div className="employee-table__role-panel-heading">
                <div><strong>{t('users.roleList')}</strong><span>{t('users.roleCount', { count: roles.length })}</span></div>
              </div>
              {roles.length ? (
                <div className="employee-table__role-list">
                  {roles.map((role) => (
                    <div className={`employee-table__role-item${editingRoleKey === role.key ? ' is-active' : ''}`} key={role.key}>
                      <button
                        type="button"
                        className="employee-table__role-edit"
                        onClick={() => editRole(role)}
                        disabled={role.is_system}
                        aria-label={role.is_system ? t('users.systemRoleNotEditable') : `Sửa vai trò ${role.label}`}
                        title={role.is_system ? t('users.systemRoleNotEditable') : undefined}
                      >
                        <span>
                          <span className="employee-table__role-name">
                            <strong>{role.label}</strong>

                          </span>
                          {role.is_system ? null : role.permissions?.length ? (
                            <span className="employee-table__role-permissions">
                              {role.permissions.map((permission) => {
                                const labelKey = permissionLabelKey(permission);
                                return labelKey ? (
                                  <span className={`employee-table__permission-badge employee-table__permission-badge--${permission}`} key={permission}>{t(labelKey)}</span>
                                ) : null;
                              })}
                            </span>
                          ) : (
                            <span className="employee-table__role-permissions">
                              <span className="employee-table__role-permission-labels">{t('users.noRolePermissions')}</span>
                            </span>
                          )}
                        </span>
                        <span>{t('users.userCount', { count: role.user_count || 0 })}</span>
                      </button>
                      {role.is_system ? (
                        <span className="employee-table__role-lock" title={t('users.systemRoleLocked')} aria-label={t('users.systemRoleLocked')}>
                          <Lock size={14} aria-hidden="true" />
                        </span>
                      ) : isAdmin ? (
                        <button
                          className="employee-table__role-delete"
                          type="button"
                          onClick={() => handleDeleteRole(role)}
                          disabled={(role.user_count || 0) > 0}
                          aria-label={(role.user_count || 0) > 0 ? t('users.roleInUse', { count: role.user_count }) : `Xóa vai trò ${role.label}`}
                          title={(role.user_count || 0) > 0 ? t('users.roleInUse', { count: role.user_count }) : t('users.delete')}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : <div className="empty-state empty-state--compact">Chưa có vai trò nào.</div>}
            </section>

            <form className="employee-table__role-form" onSubmit={handleRoleSubmit}>
              <div className="employee-table__manager-form-heading">
                <strong>{editingRoleKey ? 'Sửa vai trò' : 'Tạo vai trò mới'}</strong>
                {editingRoleKey ? <span>{t('users.roleKeyHint', { key: editingRoleKey })}</span> : null}
              </div>
              <div className="field">
                <label htmlFor="role-label">{t('users.roleName')}</label>
                <input
                  id="role-label"
                  value={roleForm.label}
                  required
                  onChange={(event) => setRoleForm((current) => ({
                    ...current,
                    label: event.target.value,
                    key: editingRoleKey ? current.key : createRoleKey(event.target.value),
                  }))}
                  placeholder={t('users.rolePlaceholder')}
                />
              </div>
              <div className="field">
                <span className="employee-table__role-permissions-label">{t('users.rolePermissions')}</span>
                <div className="employee-table__permission-grid">
                  {PERMISSIONS.map((permission) => (
                    <label className={`employee-table__permission-item employee-table__permission-item--${permission.key}${roleForm.permissions.includes(permission.key) ? ' is-checked' : ''}`} key={permission.key}>
                      <input
                        type="checkbox"
                        checked={roleForm.permissions.includes(permission.key)}
                        disabled={roleForm.isSystem}
                        onChange={(event) => toggleRolePermission(permission.key, event.target.checked)}
                      />
                      <span>{t(permission.labelKey)}</span>
                    </label>
                  ))}
                </div>

              </div>
              <div className="actions">
                {editingRoleKey ? <button className="button button--ghost" type="button" onClick={resetRoleForm}>{t('users.cancelEdit')}</button> : null}
                <button className="button" type="submit" disabled={roleSaving}>{roleSaving ? t('users.saving') : (editingRoleKey ? t('users.save') : t('users.createRole'))}</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      <EmployeeOverlays
        bookingDrawerUser={bookingDrawerUser}
        closeBookingsDrawer={closeBookingsDrawer}
        closeEditor={closeEditor}
        confirm={confirm}
        confirmPending={confirmPending}
        editingUser={editingUser}
        error={error}
        form={form}
        getRoleLabel={getRoleLabel}
        handleBackdropClick={handleBackdropClick}
        handleChange={handleChange}
        handleReassignAllBookings={handleReassignAllBookings}
        handleSubmit={handleSubmit}
        handleUnassignAllBookings={handleUnassignAllBookings}
        handleUnassignSingleBooking={handleUnassignSingleBooking}
        isEditorOpen={isEditorOpen}
        roleOptions={roleOptions}
        runConfirm={runConfirm}
        saving={saving}
        setConfirm={setConfirm}
        setTargetReassignStaffId={setTargetReassignStaffId}
        t={t}
        targetReassignStaffId={targetReassignStaffId}
        teams={teams}
        toast={toast}
        userBookings={userBookings}
        userBookingsBusy={userBookingsBusy}
        userBookingsError={userBookingsError}
        userBookingsLoading={userBookingsLoading}
        users={users}
      />
    </div>
  );
};

export default EmployeeTable;
