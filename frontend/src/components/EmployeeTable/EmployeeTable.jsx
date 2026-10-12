import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  LoaderCircle,
  Lock,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import AppAvatar from '../AppAvatar';
import Pagination from '../Pagination';
import { PERMISSIONS, permissionLabelKey } from '../../lib/permissions';
import { EmployeeOverlays } from './components/EmployeeOverlays';
import { useEmployeeManagement } from './hooks/useEmployeeManagement';
import { createRoleKey } from './utils/employeeUtils';
import '../../styles/pages/admin.css';

const normalizeHashtags = (values) => [...new Map(
  values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().replace(/^#+/, ''))
    .filter(Boolean)
    .map((value) => [value.toLocaleLowerCase(), value]),
).values()];

const getRoleTone = (role = '') => {
  const normalizedRole = String(role).toLowerCase();
  if (normalizedRole === 'admin' || normalizedRole === 'administrator') return 'admin';
  if (['manager', 'editor', 'leader'].includes(normalizedRole)) return 'manager';
  return 'member';
};

const InlineSaveStatus = ({ status }) => {
  if (!status) return null;
  return (
    <span className={`employee-table__save-status is-${status}`} role="status">
      {status === 'saving' ? <LoaderCircle size={13} aria-hidden="true" /> : null}
      {status === 'saved' ? <Check size={13} aria-hidden="true" /> : null}
      {status === 'saving' ? 'Đang lưu' : status === 'saved' ? 'Đã lưu' : 'Lỗi lưu'}
    </span>
  );
};

const SortableHeader = ({ active, direction, label, onClick }) => (
  <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button className="employee-table__sort-button" type="button" onClick={onClick}>
      <span>{label}</span>
      {active && direction === 'asc' ? <ChevronUp size={14} aria-hidden="true" /> : null}
      {active && direction === 'desc' ? <ChevronDown size={14} aria-hidden="true" /> : null}
      {!active ? <ChevronsUpDown size={14} aria-hidden="true" /> : null}
    </button>
  </th>
);

const HashtagEditor = ({ suggestions, user, onSave, status, t }) => {
  const sourceTags = useMemo(
    () => normalizeHashtags(user.content_attribution?.hashtags || []),
    [user.content_attribution?.hashtags],
  );
  const [tags, setTags] = useState(sourceTags);
  const [draft, setDraft] = useState('');
  const listId = `employee-hashtag-suggestions-${user.id}`;

  useEffect(() => {
    setTags(sourceTags);
  }, [sourceTags]);

  const persist = (nextTags) => {
    const normalized = normalizeHashtags(nextTags);
    setTags(normalized);
    if (normalized.join(',') !== sourceTags.join(',')) {
      onSave(user, 'content_hashtags', normalized.join(', '));
    }
  };

  const addDraft = () => {
    if (!draft.trim()) return;
    persist([...tags, draft]);
    setDraft('');
  };

  return (
    <div className="employee-table__hashtag-editor">
      <div className="employee-table__tag-input-wrap">
        {tags.map((tag) => (
          <span className="employee-table__editable-tag" key={tag.toLocaleLowerCase()}>
            #{tag}
            <button
              type="button"
              aria-label={`Xóa hashtag ${tag}`}
              disabled={status === 'saving'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => persist(tags.filter((item) => item !== tag))}
            >
              <X size={11} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          list={listId}
          disabled={status === 'saving'}
          aria-label={`${t('users.hashtags')}: ${user.name}`}
          placeholder={tags.length ? 'Thêm…' : t('users.hashtagsPlaceholder')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={addDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addDraft();
            }
          }}
        />
        <datalist id={listId}>
          {suggestions.filter((tag) => !tags.includes(tag)).map((tag) => (
            <option value={tag} key={tag} />
          ))}
        </datalist>
      </div>
      <InlineSaveStatus status={status} />
    </div>
  );
};

const EmployeeTable = ({ heroSubtitle }) => {
  const {
    activeFilters,
    activeTab,
    allPageSelected,
    attributionStatus,
    bulkAssignTeam,
    bulkBusy,
    bulkChangeRole,
    closeEditor,
    closeTeamEditor,
    confirm,
    confirmBulkDelete,
    confirmPending,
    currentPage,
    deletingId,
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
    handleRoleSubmit,
    handleSubmit,
    handleTeamSubmit,
    handleToggleActive,
    isAdmin,
    isEditorOpen,
    isTeamEditorOpen,
    loading,
    openCreateModal,
    openEditModal,
    openTeamCreate,
    pageRows,
    pageSize,
    queryInput,
    resetRoleForm,
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
    setPageSize,
    setQueryInput,
    setRoleFilter,
    setRoleForm,
    setSelectedIds,
    setStatusFilter,
    setTeamFilter,
    setTeamForm,
    statusFilter,
    sortConfig,
    t,
    teamError,
    teamFilter,
    teamForm,
    teamSaveStatus,
    teamSaving,
    teams,
    toast,
    toggleRolePermission,
    toggleSort,
    toggleSelect,
    toggleSelectAll,
    togglingId,
    totalPages,
    users,
  } = useEmployeeManagement();
  const [teamQuery, setTeamQuery] = useState('');
  const [teamSort, setTeamSort] = useState('name-asc');
  const [teamScope, setTeamScope] = useState('all');
  const hashtagSuggestions = useMemo(() => normalizeHashtags(
    users.flatMap((user) => user.content_attribution?.hashtags || []),
  ).sort((left, right) => left.localeCompare(right, 'vi')), [users]);
  const visibleTeams = useMemo(() => {
    const query = teamQuery.trim().toLocaleLowerCase('vi');
    const foldedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return teams
      .filter((team) => {
        const count = Number(team.user_count) || 0;
        if (teamScope === 'empty' && count !== 0) return false;
        if (teamScope === 'active' && count === 0) return false;
        if (!query) return true;
        const name = String(team.name || '').toLocaleLowerCase('vi');
        return name.includes(query) || name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(foldedQuery);
      })
      .sort((left, right) => {
        if (teamSort.startsWith('count')) {
          const comparison = (Number(left.user_count) || 0) - (Number(right.user_count) || 0);
          return teamSort === 'count-asc' ? comparison : -comparison;
        }
        const comparison = String(left.name || '').localeCompare(String(right.name || ''), 'vi', { sensitivity: 'base' });
        return teamSort === 'name-desc' ? -comparison : comparison;
      });
  }, [teamQuery, teamScope, teamSort, teams]);
  const teamMemberCount = useMemo(
    () => teams.reduce((total, team) => total + (Number(team.user_count) || 0), 0),
    [teams],
  );
  return (
    <div className="page employee-table-page">
      {heroSubtitle ? (
        <section className="page__hero admin-page__hero employee-table__hero">
          <div className="employee-table__hero-copy">
            <p className="page__subtitle">{heroSubtitle}</p>
          </div>
        </section>
      ) : null}

      <nav className="employee-table__tabs" aria-label="Quản lý hệ thống">
        {[
          { key: 'users', label: 'Người dùng', count: users.length },
          { key: 'teams', label: 'Team', count: teams.length },
          { key: 'roles', label: 'Vai trò', count: roles.length },
        ].map((tab) => (
          <button
            className={`employee-table__tab${activeTab === tab.key ? ' is-active' : ''}`}
            type="button"
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
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

      {activeTab === 'users' ? (
        <>
          {error && !isEditorOpen ? (
            <section className="section-card empty-state empty-state--compact">
              <div>{error}</div>
            </section>
          ) : null}

          <section className="section-card employee-table__table-card">
            <div className="employee-table__toolbar">
              <div className="employee-table__search">
                <Search className="employee-table__search-icon" size={16} aria-hidden="true" />
                <label className="sr-only" htmlFor="user-search">{t('users.search')}</label>
                <input
                  id="user-search"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  placeholder={t('users.searchPlaceholder')}
                />
                {queryInput ? (
                  <button
                    type="button"
                    className="employee-table__search-clear"
                    onClick={() => setQueryInput('')}
                    aria-label={t('users.clearSearch')}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="employee-table__status-filter employee-table__select-wrap">
                <label className="sr-only" htmlFor="user-status-filter">{t('users.filterStatus')}</label>
                <select
                  id="user-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">{t('users.allStatuses')}</option>
                  <option value="active">{t('users.statusActive')}</option>
                  <option value="disabled">{t('users.statusDisabled')}</option>
                </select>
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
                <label className="sr-only" htmlFor="user-team-filter">{t('users.filterTeam')}</label>
                <select
                  id="user-team-filter"
                  value={teamFilter}
                  onChange={(event) => setTeamFilter(event.target.value)}
                >
                  <option value="all">{t('users.allTeams')}</option>
                  <option value="unassigned">{t('users.unassignedTeam')}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={String(team.id)}>{team.name}</option>
                  ))}
                </select>
              </div>

              {activeFilters ? (
                <button
                  className="button button--ghost button--small employee-table__clear-filters"
                  type="button"
                  onClick={() => {
                    setQueryInput('');
                    setStatusFilter('all');
                    setRoleFilter('all');
                    setTeamFilter('all');
                  }}
                  disabled={!activeFilters}
                >
                  {t('users.clearFilter')}
                </button>
              ) : null}

              <button
                className="button employee-table__create-btn"
                type="button"
                onClick={openCreateModal}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{t('users.create')}</span>
              </button>
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
                <SortableHeader active={sortConfig.key === 'name'} direction={sortConfig.direction} label={t('users.account')} onClick={() => toggleSort('name')} />
                <SortableHeader active={sortConfig.key === 'role'} direction={sortConfig.direction} label={t('users.role')} onClick={() => toggleSort('role')} />
                <SortableHeader active={sortConfig.key === 'status'} direction={sortConfig.direction} label={t('users.status')} onClick={() => toggleSort('status')} />
                <SortableHeader active={sortConfig.key === 'team'} direction={sortConfig.direction} label="Team" onClick={() => toggleSort('team')} />
                <th>{t('users.hashtags')}</th>
                <th className="cell-actions employee-table__sticky-actions">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={7}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('users.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : pageRows.length ? (
                pageRows.map((user) => (
                  <tr
                    key={user.id}
                    className={`${user.is_active === false ? 'is-disabled' : ''}${selectedIds.has(user.id) ? ' is-selected' : ''}`.trim() || undefined}
                    onDoubleClick={(event) => {
                      if (!event.target.closest('button, input, select, label')) openEditModal(user);
                    }}
                  >
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
                          <button className="employee-table__account-button row-title" type="button" onClick={() => openEditModal(user)}>
                            {user.name}
                          </button>
                          <span className="row-subtitle">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`chip employee-table__role-chip employee-table__role-chip--${getRoleTone(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td>
                      <label
                        className={`employee-table__switch ${user.is_active === false ? 'is-disabled' : 'is-active'}`}
                        title={user.is_active === false ? t('users.enable') : t('users.disable')}
                      >
                        <input
                          type="checkbox"
                          checked={user.is_active !== false}
                          disabled={togglingId === user.id}
                          onChange={() => handleToggleActive(user)}
                          aria-label={`${t('users.status')}: ${user.name}`}
                        />
                        <span className="employee-table__switch-track" aria-hidden="true">
                          <span className="employee-table__switch-thumb" />
                        </span>
                        {togglingId === user.id ? (
                          <span className="employee-table__switch-label">{t('users.saving')}</span>
                        ) : user.is_active === false ? (
                          <span className="employee-table__status-pill is-disabled">{t('users.statusDisabled')}</span>
                        ) : null}
                      </label>
                    </td>
                    <td className="employee-table__attribution-cell">
                      <div className="employee-table__inline-field">
                        <select
                          className="employee-table__inline-select"
                          value={user.content_attribution?.team?.id ? String(user.content_attribution.team.id) : ''}
                          disabled={attributionStatus[`${user.id}:content_team_id`] === 'saving'}
                          aria-label={`${t('users.team')}: ${user.name}`}
                          onChange={(event) => handleAttributionChange(user, 'content_team_id', event.target.value)}
                        >
                          <option value="">{t('users.unassignedTeam')}</option>
                          {teams.map((team) => <option key={team.id} value={String(team.id)}>{team.name}</option>)}
                        </select>
                        <InlineSaveStatus status={attributionStatus[`${user.id}:content_team_id`]} />
                      </div>
                    </td>
                    <td>
                      <HashtagEditor
                        suggestions={hashtagSuggestions}
                        user={user}
                        onSave={handleAttributionChange}
                        status={attributionStatus[`${user.id}:content_hashtags`]}
                        t={t}
                      />
                    </td>
                    <td className="cell-actions employee-table__sticky-actions">
                      <div className="employee-table__row-actions">
                        <button
                          type="button"
                          className="employee-table__action-button"
                          aria-label={`${t('users.edit')}: ${user.name}`}
                          title={t('users.edit')}
                          onClick={() => openEditModal(user)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="employee-table__action-button employee-table__action-button--danger"
                            aria-label={`${t('users.delete')}: ${user.name}`}
                            title={t('users.delete')}
                            onClick={() => handleDelete(user)}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id
                              ? <LoaderCircle size={15} aria-hidden="true" />
                              : <Trash2 size={15} aria-hidden="true" />}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={7}>
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
          <div className="employee-table__pagination-summary">
            <span className="employee-table__pagination-meta">
              {t('users.showing', { visible: pageRows.length, total: filteredRows.length })}
            </span>
            <label className="employee-table__page-size">
              <span>Số dòng</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 25, 50].map((size) => <option value={size} key={size}>{size}</option>)}
              </select>
            </label>
          </div>
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
        <>
        <section className="section-card employee-table__management-card employee-table__team-manager" aria-labelledby="team-manager-title">
          <div className="section-card__header employee-table__team-header">
            <div>
              <h2 id="team-manager-title" className="section-card__title">Quản lý team</h2>
              <p className="section-card__meta">{teams.length} team · {teamMemberCount} nhân viên đã phân nhóm</p>
            </div>
            <button className="button button--small" type="button" onClick={openTeamCreate}>
              <Plus size={15} aria-hidden="true" />
              Thêm team
            </button>
          </div>

          <section className="employee-table__role-list-panel employee-table__team-list-panel">
              <div className="employee-table__team-toolbar">
                <div className="employee-table__team-search">
                  <Search size={15} aria-hidden="true" />
                  <label className="sr-only" htmlFor="team-search">Tìm team</label>
                  <input
                    id="team-search"
                    value={teamQuery}
                    onChange={(event) => setTeamQuery(event.target.value)}
                    placeholder="Tìm theo tên team…"
                  />
                  {teamQuery ? (
                    <button type="button" onClick={() => setTeamQuery('')} aria-label="Xóa tìm kiếm team">
                      <X size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <label className="employee-table__team-filter-control">
                  <span className="sr-only">Lọc team</span>
                  <select value={teamScope} onChange={(event) => setTeamScope(event.target.value)}>
                    <option value="all">Tất cả team</option>
                    <option value="active">Có nhân viên</option>
                    <option value="empty">Team trống</option>
                  </select>
                </label>
                <label className="employee-table__team-filter-control">
                  <span className="sr-only">Sắp xếp team</span>
                  <select value={teamSort} onChange={(event) => setTeamSort(event.target.value)}>
                    <option value="name-asc">Tên A–Z</option>
                    <option value="name-desc">Tên Z–A</option>
                    <option value="count-desc">Nhiều nhân viên nhất</option>
                    <option value="count-asc">Ít nhân viên nhất</option>
                  </select>
                </label>
              </div>
              <div className="employee-table__team-list" aria-live="polite">
                {visibleTeams.length ? visibleTeams.map((team) => (
                  <article className={`employee-table__team-card${editingTeamId === team.id ? ' is-active' : ''}`} key={team.id}>
                    {editingTeamId === team.id ? (
                      <form className="employee-table__team-inline-form" onSubmit={handleTeamSubmit}>
                        <input
                          value={teamForm.name}
                          required
                          autoFocus
                          maxLength={120}
                          onChange={(event) => setTeamForm({ name: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') closeTeamEditor();
                          }}
                          aria-label={`Tên team ${team.name}`}
                        />
                        <div className="employee-table__team-inline-actions">
                          <button type="button" onClick={closeTeamEditor} disabled={teamSaving} aria-label="Hủy sửa" title="Hủy">
                            <X size={15} aria-hidden="true" />
                          </button>
                          <button className="is-save" type="submit" disabled={teamSaving} aria-label="Lưu thay đổi" title="Lưu">
                            {teamSaving ? <LoaderCircle size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
                          </button>
                        </div>
                        <InlineSaveStatus status={teamSaveStatus === 'idle' ? null : teamSaveStatus} />
                      </form>
                    ) : (
                      <>
                        <button type="button" className="employee-table__team-card-main" onClick={() => editTeam(team)}>
                          <span className="employee-table__team-avatar" aria-hidden="true">
                            {String(team.name || 'T').trim().slice(0, 2).toLocaleUpperCase('vi')}
                          </span>
                          <span className="employee-table__team-card-copy">
                            <strong>{team.name}</strong>
                            <span><UsersRound size={13} aria-hidden="true" /> {team.user_count || 0} nhân viên</span>
                          </span>
                        </button>
                        <div className="employee-table__team-card-actions">
                          <button type="button" onClick={() => editTeam(team)} aria-label={`Sửa team ${team.name}`} title="Sửa team">
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          {isAdmin ? (
                            <button className="is-danger" type="button" onClick={() => handleDeleteTeam(team)} aria-label={`Xóa team ${team.name}`} title="Xóa team">
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </article>
                )) : (
                  <div className="employee-table__team-empty">
                    <span className="employee-table__team-empty-icon"><UsersRound size={22} aria-hidden="true" /></span>
                    <strong>{teams.length ? 'Không tìm thấy team phù hợp' : 'Chưa có team nào'}</strong>
                    <p>{teams.length ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Tạo team để nhóm nhân viên và theo dõi báo cáo dễ hơn.'}</p>
                    {teams.length ? (
                      <button className="button button--ghost button--small" type="button" onClick={() => { setTeamQuery(''); setTeamScope('all'); }}>Xóa bộ lọc</button>
                    ) : (
                      <button className="button button--small" type="button" onClick={openTeamCreate}><Plus size={14} aria-hidden="true" /> Tạo team đầu tiên</button>
                    )}
                  </div>
                )}
              </div>
          </section>
        </section>
        {isTeamEditorOpen ? createPortal(
          <div
            className="modal-backdrop"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget && !teamSaving) closeTeamEditor();
            }}
          >
            <form
              className="modal-card employee-table__team-editor-modal"
              role="dialog"
              aria-modal="true"
              aria-label={editingTeamId ? 'Chỉnh sửa team' : 'Tạo team mới'}
              onSubmit={handleTeamSubmit}
            >
              <div className="employee-table__team-editor-close-row">
                <button className="employee-table__modal-close" type="button" onClick={closeTeamEditor} disabled={teamSaving} aria-label="Đóng">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="employee-table__team-editor-body">
                {teamError ? <div className="employee-table__inline-error empty-state empty-state--compact" role="alert">{teamError}</div> : null}
                <div className="field">
                  <label htmlFor="content-team-name">Tên team</label>
                  <input
                    id="content-team-name"
                    value={teamForm.name}
                    required
                    autoFocus
                    maxLength={120}
                    onChange={(event) => setTeamForm({ name: event.target.value })}
                    placeholder="Ví dụ: Content MKT"
                  />
                </div>
                <div className="employee-table__team-save-feedback">
                  <InlineSaveStatus status={teamSaveStatus === 'idle' ? null : teamSaveStatus} />
                </div>
              </div>
              <div className="actions employee-table__team-editor-actions">
                <button className="button button--ghost" type="button" onClick={closeTeamEditor} disabled={teamSaving}>Hủy</button>
                <button className="button" type="submit" disabled={teamSaving}>
                  {teamSaving ? <LoaderCircle size={15} aria-hidden="true" /> : null}
                  {teamSaving ? 'Đang lưu…' : editingTeamId ? 'Lưu thay đổi' : 'Tạo team'}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        ) : null}
        </>
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
        closeEditor={closeEditor}
        confirm={confirm}
        confirmPending={confirmPending}
        editingUser={editingUser}
        error={error}
        form={form}
        getRoleLabel={getRoleLabel}
        handleBackdropClick={handleBackdropClick}
        handleChange={handleChange}
        handleSubmit={handleSubmit}
        isEditorOpen={isEditorOpen}
        roleOptions={roleOptions}
        runConfirm={runConfirm}
        saving={saving}
        setConfirm={setConfirm}
        t={t}
        teams={teams}
        toast={toast}
      />
    </div>
  );
};

export default EmployeeTable;
