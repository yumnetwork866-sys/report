const sendServiceResult = (res, result = {}) => {
  for (const [name, value] of Object.entries(result.headers || {})) {
    res.setHeader(name, value);
  }
  if (result.redirect) return res.redirect(result.redirect);
  const status = result.status || 200;
  if (Buffer.isBuffer(result.body)) {
    return res.status(status).send(result.body);
  }
  const contentType = String(result.headers?.['Content-Type'] || result.headers?.['content-type'] || '');
  if ((typeof result.body === 'string') && contentType.includes('text/')) {
    return res.status(status).send(result.body);
  }
  if (!result.status || result.status === 200) return res.json(result.body);
  return res.status(result.status).json(result.body);
};

const endpoint = (service, action) => async (req, res) => sendServiceResult(
  res,
  await service.execute(action, {
    params: req.params || {},
    query: req.query || {},
    body: req.body || {},
    session: req.session,
  }),
);

module.exports = { endpoint };
