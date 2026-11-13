const normalizeHashtag = (tag) => String(tag || '')
  .trim()
  .toLowerCase()
  .replace(/^#+/, '');

const extractHashtags = (text) => [...new Set(
  (String(text || '').match(/#[^\s#]+/g) || [])
    .map(normalizeHashtag)
    .filter(Boolean),
)];

const matchesHashtags = (text, configuredHashtags = []) => {
  const configured = (Array.isArray(configuredHashtags) ? configuredHashtags : [configuredHashtags])
    .map(normalizeHashtag)
    .filter(Boolean);
  if (!configured.length) return false;
  const textTags = extractHashtags(text);
  return textTags.some((tag) => (
    configured.includes(tag) || configured.some((candidate) => candidate && tag.endsWith(candidate))
  ));
};

module.exports = { extractHashtags, matchesHashtags, normalizeHashtag };
