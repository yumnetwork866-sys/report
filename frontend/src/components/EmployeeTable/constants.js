import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from '../../lib/permissions';

export const PAGE_SIZE = 20;

export const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'member',
  content_team_id: '',
  content_hashtags: '',
};

export const fallbackRoles = [
  { key: 'member', label: 'Member', permissions: DEFAULT_PERMISSIONS },
  { key: 'leader', label: 'Leader', permissions: DEFAULT_PERMISSIONS },
  { key: 'koc', label: 'KOC', permissions: DEFAULT_PERMISSIONS },
  { key: 'admin', label: 'Admin', is_system: true, permissions: ALL_PERMISSIONS },
];
