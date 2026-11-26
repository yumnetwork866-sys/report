import { initialForm } from '../constants';

export const createInitialForm = () => ({
  ...initialForm,
  content_attributions: (initialForm.content_attributions || [{ team_id: '', hashtags: '' }]).map((row) => ({ ...row })),
});

export const createRoleKey = (label) => String(label || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 64);
