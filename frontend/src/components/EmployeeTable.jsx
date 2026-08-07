import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck, Lock, Trash2, X } from 'lucide-react';
import {
  createContentTeam,
  createRole,
  createUser,
  deleteContentTeam,
  deleteRole,
  deleteUser,
  fetchContentTeams,
  fetchRoles,
  fetchUsers,
  updateContentTeam,
  updateRole,
  updateUser,
} from '../lib/api';
import { useI18n } from '../lib/language';
import { isAdminSession } from '../lib/session';
import { useSession } from '../lib/useSession';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, PERMISSIONS, permissionLabelKey } from '../lib/permissions';
import AppAvatar from './AppAvatar';
import Pagination from './Pagination';
import '../styles/pages/admin.css';

const PAGE_SIZE = 20;

const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'member',
  content_team_id: '',
  content_hashtags: '',
};

const fallbackRoles = [
  { key: 'member', label: 'Member', permissions: DEFAULT_PERMISSIONS },
  { key: 'leader', label: 'Leader', permissions: DEFAULT_PERMISSIONS },
  { key: 'koc', label: 'KOC', permissions: DEFAULT_PERMISSIONS },
  { key: 'admin', label: 'Admin', is_system: true, permissions: ALL_PERMISSIONS },
];

const createInitialForm = () => ({ ...initialForm });

const createRoleKey = (label) => String(label || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 64);

const EmployeeTable = ({ heroTitle, heroSubtitle }) => {
  const { t } = useI18n();
  const session = useSession();
  const isAdmin = isAdminSession(session);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(fallbackRoles);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingUser, setEditingUser] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('users');
  const [teamForm, setTeamForm] = useState({ name: '' });
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [roleForm, setRoleForm] = useState({ key: '', label: '', description: '', permissions: [], isSystem: false });
  const [editingRoleKey, setEditingRoleKey] = useState(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [openActions, setOpenActions] = useState({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
  const [error, setError] = useState('');
  const [queryInput, setQueryInput] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [toast, setToast] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadData = async (signal) => {
    const [loadedUsers, loadedRoles, loadedTeams] = await Promise.all([
      fetchUsers(signal),
      fetchRoles(signal),
      fetchContentTeams(signal),
    ]);
    setUsers(loadedUsers);
    setRoles(loadedRoles);
    setTeams(loadedTeams);
  };

  const roleOptions = roles.map((role) => role.key);
  const getRoleLabel = (key) => roles.find((role) => role.key === key)?.label || key;

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadData(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || t('users.loadError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    if (!isEditorOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsEditorOpen(false);
        setEditingUser(null);
        setForm(initialForm);
        setError('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen]);

  useEffect(() => {
    const closeActions = (event) => {
      if (!event.target.closest('.employee-table__action-menu, .employee-table__action-menu-panel')) {
        setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
      }
    };
    const closeActionsOnViewportChange = () => {
      setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
    };

    document.addEventListener('click', closeActions);
    window.addEventListener('resize', closeActionsOnViewportChange);
    window.addEventListener('scroll', closeActionsOnViewportChange, true);
    return () => {
      document.removeEventListener('click', closeActions);
      window.removeEventListener('resize', closeActionsOnViewportChange);
      window.removeEventListener('scroll', closeActionsOnViewportChange, true);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, roleFilter, teamFilter]);

  useEffect(() => {
    if (!confirm) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setConfirm(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirm]);

  const activeUsers = useMemo(() => users.filter((user) => user.is_active !== false), [users]);
  const disabledUsers = useMemo(() => users.filter((user) => user.is_active === false), [users]);
  const rows = useMemo(
    () => (activeTab === 'disabled' ? disabledUsers : activeUsers),
    [activeTab, activeUsers, disabledUsers],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((user) => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const userTeamId = String(user.content_attribution?.team_id || '');
      const matchesTeam = teamFilter === 'all'
        || (teamFilter === 'unassigned' ? !userTeamId : userTeamId === teamFilter);
      const matchesQuery = !normalizedQuery
        || [
          user.name,
          user.email,
          user.content_attribution?.team?.name,
          ...(user.content_attribution?.hashtags || []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return matchesRole && matchesTeam && matchesQuery;
    });
  }, [query, roleFilter, rows, teamFilter]);

  const activeFilters = Number(Boolean(query.trim()))
    + Number(roleFilter !== 'all')
    + Number(teamFilter !== 'all');

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const page = Math.min(currentPage, totalPages);
    return filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [currentPage, filteredRows, totalPages]);

  const pageSelectedCount = pageRows.filter((user) => selectedIds.has(user.id)).length;
  const allPageSelected = pageRows.length > 0 && pageSelectedCount === pageRows.length;
  const selectAllRef = useRef(null);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = pageSelectedCount > 0 && !allPageSelected;
    }
  }, [allPageSelected, pageSelectedCount]);

  const toggleSelect = (userId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allPageSelected) pageRows.forEach((user) => next.delete(user.id));
      else pageRows.forEach((user) => next.add(user.id));
      return next;
    });
  };

  const showToast = (message, status = 'success') => {
    const id = Date.now();
    setToast({ message, status, id });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3200);
  };

  const runBulk = async (apply, successMessage) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => apply(id)));
      await loadData();
      setSelectedIds(new Set());
      showToast(successMessage);
    } catch (err) {
      const message = err.message || 'Thao tác hàng loạt thất bại.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkChangeRole = (role) => {
    if (!role) return;
    runBulk((userId) => updateUser(userId, { role }), t('users.bulkRoleDone', { count: selectedIds.size }));
  };

  const bulkAssignTeam = (teamId) => {
    if (!teamId) return;
    runBulk((userId) => {
      const user = users.find((item) => item.id === userId);
      return updateUser(userId, {
        content_team_id: teamId === 'unassigned' ? null : teamId,
        content_hashtags: (user?.content_attribution?.hashtags || []).join(', '),
      });
    }, t('users.bulkTeamDone', { count: selectedIds.size }));
  };

  const confirmBulkDelete = () => {
    const count = selectedIds.size;
    setConfirm({
      title: t('users.bulkDeleteTitle', { count }),
      message: t('users.bulkDeleteMessage', { count }),
      confirmLabel: t('users.delete'),
      onConfirm: () => runBulk((userId) => deleteUser(userId), t('users.bulkDeleteDone', { count })),
    });
  };

  const runConfirm = async () => {
    const action = confirm?.onConfirm;
    if (!action) return;
    setConfirmPending(true);
    try {
      await action();
    } finally {
      setConfirmPending(false);
      setConfirm(null);
    }
  };

  const toggleActionsMenu = (userId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === userId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }

      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 130 && spaceAbove > spaceBelow ? 'up' : 'down';

      return {
        id: userId,
        direction,
        top: Math.min(window.innerHeight - 12, rect.bottom + 8),
        bottom: Math.max(12, window.innerHeight - rect.top + 8),
        right: Math.max(12, window.innerWidth - rect.right),
      };
    });
  };

  const openCreateModal = () => {
    setError('');
    setEditingUser(null);
    setForm(createInitialForm());
    setIsEditorOpen(true);
  };

  const resetRoleForm = () => {
    setEditingRoleKey(null);
    setRoleForm({ key: '', label: '', description: '', permissions: [], isSystem: false });
    setRoleError('');
  };

  const resetTeamForm = () => {
    setEditingTeamId(null);
    setTeamForm({ name: '' });
    setTeamError('');
  };

  const editTeam = (team) => {
    setEditingTeamId(team.id);
    setTeamForm({ name: team.name });
    setTeamError('');
  };

  const handleTeamSubmit = async (event) => {
    event.preventDefault();
    try {
      setTeamSaving(true);
      setTeamError('');
      const payload = { name: teamForm.name.trim() };
      if (editingTeamId) await updateContentTeam(editingTeamId, payload);
      else await createContentTeam(payload);
      await loadData();
      resetTeamForm();
      showToast(editingTeamId ? 'Đã cập nhật team' : 'Đã tạo team');
    } catch (err) {
      const message = err.message || 'Không lưu được team.';
      setTeamError(message);
      showToast(message, 'error');
    } finally {
      setTeamSaving(false);
    }
  };

  const handleDeleteTeam = (team) => {
    setConfirm({
      title: 'Xóa team?',
      message: `Xóa team ${team.name}? Nhân viên trong team sẽ chuyển về Chưa phân team.`,
      confirmLabel: t('users.delete'),
      onConfirm: async () => {
        try {
          setTeamError('');
          await deleteContentTeam(team.id);
          await loadData();
          if (teamFilter === String(team.id)) setTeamFilter('all');
          resetTeamForm();
          showToast(`Đã xóa team ${team.name}`);
        } catch (err) {
          const message = err.message || 'Không xóa được team.';
          setTeamError(message);
          showToast(message, 'error');
        }
      },
    });
  };

  const editRole = (role) => {
    setEditingRoleKey(role.key);
    setRoleForm({
      key: role.key,
      label: role.label,
      description: role.description || '',
      permissions: role.permissions || [],
      isSystem: Boolean(role.is_system),
    });
    setRoleError('');
  };

  const toggleRolePermission = (key, checked) => {
    if (roleForm.isSystem) return;
    setRoleForm((current) => ({
      ...current,
      permissions: checked
        ? [...new Set([...current.permissions, key])]
        : current.permissions.filter((permission) => permission !== key),
    }));
  };

  const handleRoleSubmit = async (event) => {
    event.preventDefault();
    try {
      setRoleSaving(true);
      setRoleError('');
      const payload = {
        label: roleForm.label.trim(),
        description: roleForm.description.trim(),
        permissions: roleForm.isSystem || editingRoleKey === 'admin'
          ? [...ALL_PERMISSIONS]
          : (roleForm.permissions.length ? [...roleForm.permissions] : [...DEFAULT_PERMISSIONS]),
      };
      if (editingRoleKey) await updateRole(editingRoleKey, payload);
      else await createRole({ ...payload, key: roleForm.key.trim().toLowerCase() });
      setRoles(await fetchRoles());
      resetRoleForm();
      showToast(t('users.roleSavedToast'));
    } catch (err) {
      const message = err.message || t('users.roleSaveError');
      setRoleError(message);
      showToast(message, 'error');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleDeleteRole = (role) => {
    setConfirm({
      title: t('users.deleteTitle'),
      message: t('users.roleDeleteConfirm', { name: role.label }),
      confirmLabel: t('users.delete'),
      onConfirm: async () => {
        try {
          setRoleError('');
          await deleteRole(role.key);
          setRoles(await fetchRoles());
          if (roleFilter === role.key) setRoleFilter('all');
          resetRoleForm();
          showToast(t('users.roleDeletedToast', { name: role.label }));
        } catch (err) {
          const message = err.message || t('users.roleDeleteError');
          setRoleError(message);
          showToast(message, 'error');
        }
      },
    });
  };

  const openEditModal = (user) => {
    setError('');
    setEditingUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'member',
      content_team_id: user.content_attribution?.team?.id ? String(user.content_attribution.team.id) : '',
      content_hashtags: (user.content_attribution?.hashtags || []).join(', '),
    });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingUser(null);
    setForm(createInitialForm());
    setError('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleAttributionChange = async (user, field, value) => {
    const payload = field === 'content_team_id'
      ? { content_team_id: value || null }
      : { content_hashtags: value };
    try {
      setError('');
      await updateUser(user.id, payload);
      await loadData();
      showToast(t('users.updatedToast'));
    } catch (err) {
      const message = err.message || t('users.updateError');
      setError(message);
      showToast(message, 'error');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');

      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        content_team_id: form.content_team_id || null,
        content_hashtags: form.content_hashtags.trim(),
      };

      if (form.password.trim()) {
        payload.password = form.password;
      }

      if (editingUser) {
        await updateUser(editingUser.id, payload);
      } else {
        await createUser({
          ...payload,
          password: form.password,
        });
      }

      closeEditor();
      await loadData();
      showToast(editingUser ? t('users.updatedToast') : t('users.createdToast'));
    } catch (err) {
      setError(err.message || t(editingUser ? 'users.updateError' : 'users.createError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (user) => {
    setConfirm({
      title: t('users.deleteTitle'),
      message: t('users.deleteConfirm', { name: user.name, email: user.email }),
      confirmLabel: t('users.delete'),
      onConfirm: async () => {
        try {
          setDeletingId(user.id);
          setError('');
          await deleteUser(user.id);
          await loadData();
          showToast(t('users.deleteDone', { name: user.name }));
        } catch (err) {
          const message = err.message || t('users.deleteError');
          setError(message);
          showToast(message, 'error');
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleToggleActive = async (user) => {
    const nextActive = user.is_active === false;
    try {
      setTogglingId(user.id);
      setError('');
      const updatedUser = await updateUser(user.id, { is_active: nextActive });
      setUsers((current) => current.map((item) => (item.id === user.id ? updatedUser : item)));
      setSelectedIds((current) => {
        if (!current.has(user.id)) return current;
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
      showToast(nextActive ? t('users.enabledToast', { name: user.name }) : t('users.disabledToast', { name: user.name }));
    } catch (err) {
      const message = err.message || 'Không cập nhật được trạng thái.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    closeEditor();
  };

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
              <option value="unassigned">Chưa phân team</option>
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

    </div>
  );
};

export default EmployeeTable;
