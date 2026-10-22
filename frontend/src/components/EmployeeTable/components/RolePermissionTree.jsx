import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '../../../lib/permissions';

const DEPENDENT_VIEWS = {
  'shop.affiliate.invite': 'shop.affiliate.discovery.view',
  'shop.affiliate.message': 'shop.affiliate.discovery.view',
  'shop.bookings.manage': 'shop.bookings.video.view',
  'admin.users.manage': 'admin.users.view',
};

const DEPENDENT_ACTIONS = {
  'shop.affiliate.discovery.view': ['shop.affiliate.invite', 'shop.affiliate.message'],
  'shop.bookings.video.view': ['shop.bookings.manage'],
  'admin.users.view': ['admin.users.manage'],
};

const TreeCheckbox = ({ checked, indeterminate, disabled, onChange, id, title }) => {
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      id={id}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      title={title}
      className="employee-table__tree-checkbox"
    />
  );
};

export const RolePermissionTree = ({
  permissions = [],
  disabled = false,
  onChange,
  onTogglePermission,
  t,
}) => {
  const allGroupKeys = useMemo(() => PERMISSION_GROUPS.map((g) => g.key), []);

  const [expandedGroups, setExpandedGroups] = useState(() => new Set(allGroupKeys));
  const [expandedPages, setExpandedPages] = useState(() => new Set());

  const toggleGroupExpand = (groupKey) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const togglePageExpand = (pageCompositeKey) => {
    setExpandedPages((current) => {
      const next = new Set(current);
      if (next.has(pageCompositeKey)) next.delete(pageCompositeKey);
      else next.add(pageCompositeKey);
      return next;
    });
  };

  // Group toggle
  const handleGroupToggle = (group, checked) => {
    if (disabled || !onChange) return;
    const groupKeys = group.items.flatMap((item) => item.permissions.map((p) => p.key));
    if (checked) {
      const next = new Set([...permissions, ...groupKeys]);
      groupKeys.forEach((key) => {
        if (DEPENDENT_VIEWS[key]) next.add(DEPENDENT_VIEWS[key]);
      });
      onChange([...next]);
    } else {
      const toRemove = new Set(groupKeys);
      groupKeys.forEach((key) => {
        (DEPENDENT_ACTIONS[key] || []).forEach((action) => toRemove.add(action));
      });
      onChange(permissions.filter((p) => !toRemove.has(p)));
    }
  };

  // Page toggle
  const handlePageToggle = (item, checked) => {
    if (disabled || !onChange) return;
    const itemKeys = item.permissions.map((p) => p.key);
    if (checked) {
      const next = new Set([...permissions, ...itemKeys]);
      itemKeys.forEach((key) => {
        if (DEPENDENT_VIEWS[key]) next.add(DEPENDENT_VIEWS[key]);
      });
      onChange([...next]);
    } else {
      const toRemove = new Set(itemKeys);
      itemKeys.forEach((key) => {
        (DEPENDENT_ACTIONS[key] || []).forEach((action) => toRemove.add(action));
      });
      onChange(permissions.filter((p) => !toRemove.has(p)));
    }
  };

  const totalSelectedCount = permissions.length;
  const totalCount = ALL_PERMISSIONS.length;

  return (
    <div className="employee-table__permission-tree-container">
      {/* Summary status bar */}
      <div className="employee-table__tree-status-bar">
        <span className="employee-table__tree-badge-total">
          <Shield size={13} />
          {t('rolePermissions.selectedSummary', { selected: totalSelectedCount, total: totalCount }) ||
            `Đã chọn ${totalSelectedCount}/${totalCount} quyền`}
        </span>
        {disabled ? (
          <span className="employee-table__tree-disabled-hint">
            (Vai trò hệ thống - không thể sửa quyền)
          </span>
        ) : null}
      </div>

      {/* Tree Node Hierarchy (Branch Lines without folder icons) */}
      <div className="employee-table__tree-scroll-area">
        <div className="employee-table__tree-root">
          {PERMISSION_GROUPS.map((group) => {
              const isGroupExpanded = expandedGroups.has(group.key);
              const groupAllKeys = group.items.flatMap((item) =>
                item.permissions.map((p) => p.key),
              );
              const groupSelectedKeys = groupAllKeys.filter((k) => permissions.includes(k));
              const isGroupAllChecked =
                groupSelectedKeys.length === groupAllKeys.length && groupAllKeys.length > 0;
              const isGroupIndeterminate =
                groupSelectedKeys.length > 0 && groupSelectedKeys.length < groupAllKeys.length;

              return (
                <div
                  className={`employee-table__tree-group-node employee-table__tree-group-node--${group.key} ${isGroupExpanded ? 'is-expanded' : 'is-collapsed'}`}
                  key={group.key}
                >
                  {/* Group Row (Level 1) */}
                  <div className="employee-table__tree-row employee-table__tree-row--group">
                    <button
                      type="button"
                      className="employee-table__tree-chevron-btn"
                      onClick={() => toggleGroupExpand(group.key)}
                      aria-label={isGroupExpanded ? 'Thu gọn nhóm' : 'Mở rộng nhóm'}
                    >
                      {isGroupExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>

                    <label className="employee-table__tree-checkbox-wrap">
                      <TreeCheckbox
                        id={`tree-group-${group.key}`}
                        checked={isGroupAllChecked}
                        indeterminate={isGroupIndeterminate}
                        disabled={disabled}
                        onChange={(e) => handleGroupToggle(group, e.target.checked)}
                      />
                    </label>

                    <div
                      className="employee-table__tree-label-wrap"
                      onClick={() => toggleGroupExpand(group.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') toggleGroupExpand(group.key);
                      }}
                    >
                      <span className={`employee-table__tree-group-pill employee-table__tree-group-pill--${group.key}`} />
                      <strong className="employee-table__tree-title">{t(group.labelKey)}</strong>
                    </div>

                    <span
                      className={`employee-table__tree-count-badge ${isGroupAllChecked ? 'is-full' : isGroupIndeterminate ? 'is-partial' : ''}`}
                    >
                      {groupSelectedKeys.length}/{groupAllKeys.length}
                    </span>
                  </div>

                  {/* Group Children (Pages / Level 2) */}
                  {isGroupExpanded ? (
                    <div className="employee-table__tree-children employee-table__tree-children--group">
                      {group.items.map((item) => {
                        const pageCompositeKey = `${group.key}:${item.key}`;
                        const isPageExpanded = expandedPages.has(pageCompositeKey);
                        const pageAllKeys = item.permissions.map((p) => p.key);
                        const pageSelectedKeys = pageAllKeys.filter((k) => permissions.includes(k));
                        const isPageAllChecked =
                          pageSelectedKeys.length === pageAllKeys.length && pageAllKeys.length > 0;
                        const isPageIndeterminate =
                          pageSelectedKeys.length > 0 &&
                          pageSelectedKeys.length < pageAllKeys.length;

                        return (
                          <div
                            className={`employee-table__tree-page-node ${isPageExpanded ? 'is-expanded' : 'is-collapsed'}`}
                            key={item.key}
                          >
                            {/* Page Row (Level 2) */}
                            <div className="employee-table__tree-row employee-table__tree-row--page">
                              <button
                                type="button"
                                className="employee-table__tree-chevron-btn"
                                onClick={() => togglePageExpand(pageCompositeKey)}
                                aria-label={isPageExpanded ? 'Thu gọn trang' : 'Mở rộng trang'}
                              >
                                {isPageExpanded ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                              </button>

                              <label className="employee-table__tree-checkbox-wrap">
                                <TreeCheckbox
                                  id={`tree-page-${pageCompositeKey}`}
                                  checked={isPageAllChecked}
                                  indeterminate={isPageIndeterminate}
                                  disabled={disabled}
                                  onChange={(e) => handlePageToggle(item, e.target.checked)}
                                />
                              </label>

                              <div
                                className="employee-table__tree-label-wrap"
                                onClick={() => togglePageExpand(pageCompositeKey)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ')
                                    togglePageExpand(pageCompositeKey);
                                }}
                              >
                                <span className="employee-table__tree-page-title">
                                  {t(item.labelKey)}
                                </span>
                              </div>

                              <span
                                className={`employee-table__tree-count-badge is-sub ${isPageAllChecked ? 'is-full' : isPageIndeterminate ? 'is-partial' : ''}`}
                              >
                                {pageSelectedKeys.length}/{pageAllKeys.length}
                              </span>
                            </div>

                            {/* Page Children (Leaf Permissions / Level 3) */}
                            {isPageExpanded ? (
                              <div className="employee-table__tree-children employee-table__tree-children--page">
                                {item.permissions.map((perm) => {
                                  const isChecked = permissions.includes(perm.key);
                                  const isManageAction =
                                    perm.key.endsWith('.manage') ||
                                    perm.key.endsWith('.invite') ||
                                    perm.key.endsWith('.message');

                                  return (
                                    <label
                                      className={`employee-table__tree-row employee-table__tree-row--leaf ${isChecked ? 'is-checked' : ''}`}
                                      key={perm.key}
                                      htmlFor={`tree-leaf-${perm.key}`}
                                    >
                                      <div className="employee-table__tree-checkbox-wrap">
                                        <input
                                          type="checkbox"
                                          id={`tree-leaf-${perm.key}`}
                                          checked={isChecked}
                                          disabled={disabled}
                                          onChange={(e) =>
                                            onTogglePermission?.(perm.key, e.target.checked)
                                          }
                                          className="employee-table__tree-checkbox"
                                        />
                                      </div>

                                      <div className="employee-table__tree-leaf-label-wrap">
                                        <span className={`employee-table__tree-leaf-type-dot ${isManageAction ? 'is-action' : 'is-view'}`} />
                                        <span className="employee-table__tree-leaf-title">
                                          {t(perm.labelKey)}
                                        </span>
                                        <span
                                          className={`employee-table__tree-leaf-type-badge ${isManageAction ? 'is-action' : 'is-view'}`}
                                        >
                                          {isManageAction ? 'Ghi' : 'Đọc'}
                                        </span>
                                      </div>

                                      <code className="employee-table__tree-leaf-key">
                                        {perm.key}
                                      </code>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
