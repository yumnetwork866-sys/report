import React, { useEffect, useMemo, useState } from 'react';

const generatedAvatarUrl = (seed) => (
  `https://api.dicebear.com/10.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e6f7f5`
);

const AppAvatar = ({
  src,
  sources = [],
  seed,
  name,
  className = 'creator-identity__avatar',
  fallbackClassName = 'creator-identity__avatar--fallback',
  alt = '',
  generated = true,
}) => {
  const identity = String(seed || name || 'user').trim() || 'user';
  const initial = String(name || seed || 'U')
    .trim()
    .replace(/^@/, '')
    .charAt(0)
    .toUpperCase() || 'U';
  const candidates = useMemo(() => [...new Set([
    src,
    ...sources,
    generated ? generatedAvatarUrl(identity) : null,
  ].filter(Boolean))], [generated, identity, sources, src]);
  const sourceKey = candidates.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => setSourceIndex(0), [sourceKey]);

  if (!candidates[sourceIndex]) {
    return <span className={`${className} ${fallbackClassName}`.trim()} aria-hidden="true">{initial}</span>;
  }

  return (
    <img
      className={className}
      src={candidates[sourceIndex]}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((current) => current + 1)}
    />
  );
};

export default AppAvatar;
