import { useEffect, useMemo, useRef, useState } from 'react';
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
  fetchUserBookings,
  unassignUserBookings,
  updateContentTeam,
  updateRole,
  updateUser,
} from '../../../lib/api';
import { useI18n } from '../../../lib/language';
import { isAdminSession } from '../../../lib/session';
import { useSession } from '../../../lib/useSession';
import {
  PAGE_SIZE,
  fallbackRoles,
  initialForm,
} from '../constants';
import { createInitialForm } from '../utils/employeeUtils';

export const useEmployeeManagement = () => {
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
  const [bookingDrawerUser, setBookingDrawerUser] = useState(null);
  const [userBookings, setUserBookings] = useState([]);
  const [userBookingsLoading, setUserBookingsLoading] = useState(false);
  const [userBookingsError, setUserBookingsError] = useState('');
  const [userBookingsBusy, setUserBookingsBusy] = useState(false);
  const [targetReassignStaffId, setTargetReassignStaffId] = useState('');
  
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
      message: `Xóa team ${team.name}? Nhân viên trong team sẽ chuyển về Chưa có team.`,
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
  
  const openBookingsDrawer = async (user) => {
    setBookingDrawerUser(user);
    setUserBookings([]);
    setUserBookingsLoading(true);
    setUserBookingsError('');
    setTargetReassignStaffId('');
    try {
      const response = await fetchUserBookings(user.id);
      setUserBookings(response.bookings || []);
    } catch (err) {
      setUserBookingsError(err.message || t('users.loadError'));
    } finally {
      setUserBookingsLoading(false);
    }
  };
  
  const closeBookingsDrawer = () => {
    if (userBookingsBusy) return;
    setBookingDrawerUser(null);
    setUserBookings([]);
    setUserBookingsError('');
  };
  
  const handleUnassignSingleBooking = async (booking) => {
    if (!bookingDrawerUser) return;
    if (!window.confirm(t('users.unassignSingleConfirm'))) return;
    try {
      setUserBookingsBusy(true);
      await unassignUserBookings(bookingDrawerUser.id, { bookingIds: [booking.id] });
      setUserBookings((current) => current.filter((item) => item.id !== booking.id));
      showToast(t('users.unassignSuccess'));
    } catch (err) {
      setUserBookingsError(err.message || t('users.updateError'));
      showToast(err.message || t('users.updateError'), 'error');
    } finally {
      setUserBookingsBusy(false);
    }
  };
  
  const handleUnassignAllBookings = async () => {
    if (!bookingDrawerUser || !userBookings.length) return;
    if (!window.confirm(t('users.unassignAllConfirm', { count: userBookings.length }))) return;
    try {
      setUserBookingsBusy(true);
      await unassignUserBookings(bookingDrawerUser.id);
      setUserBookings([]);
      showToast(t('users.unassignAllSuccess'));
    } catch (err) {
      setUserBookingsError(err.message || t('users.updateError'));
      showToast(err.message || t('users.updateError'), 'error');
    } finally {
      setUserBookingsBusy(false);
    }
  };
  
  const handleReassignAllBookings = async () => {
    if (!bookingDrawerUser || !userBookings.length || !targetReassignStaffId) return;
    const targetUser = users.find((u) => String(u.id) === String(targetReassignStaffId));
    if (!window.confirm(t('users.reassignConfirm', { count: userBookings.length }))) return;
    try {
      setUserBookingsBusy(true);
      await unassignUserBookings(bookingDrawerUser.id, { targetStaffId: Number(targetReassignStaffId) });
      setUserBookings([]);
      showToast(
        targetUser
          ? `${t('users.reassignAllSuccess')} (${targetUser.name})`
          : t('users.reassignAllSuccess'),
      );
    } catch (err) {
      setUserBookingsError(err.message || t('users.updateError'));
      showToast(err.message || t('users.updateError'), 'error');
    } finally {
      setUserBookingsBusy(false);
    }
  };
  
  const handleBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    closeEditor();
  };
  

  return {
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
  };
};
