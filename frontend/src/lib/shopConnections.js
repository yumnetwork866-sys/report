export const connectionAppType = (authorization) => (
  (authorization?.app?.app_type || authorization?.app_type) === 'custom' ? 'custom' : 'partner'
);

export const uniqueShopAuthorizations = (shop) => {
  const seen = new Set();
  return [shop?.authorization, shop?.orderAuthorization].filter((authorization) => {
    if (!authorization) return false;
    const key = authorization.id == null ? authorization : String(authorization.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
