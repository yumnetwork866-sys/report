export const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', status: 'active', description: 'Primary platform' },
  { key: 'youtube', label: 'YouTube', status: 'placeholder', description: 'Coming soon' },
];

export function getPlatformLabel(platform) {
  return PLATFORMS.find((item) => item.key === platform)?.label || platform || 'Unknown';
}
