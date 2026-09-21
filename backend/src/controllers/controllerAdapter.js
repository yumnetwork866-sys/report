const sendServiceResult = (res, result = {}) => {
  for (const [name, value] of Object.entries(result.headers || {})) {
    res.setHeader(name, value);
  }
  if (result.redirect) return res.redirect(result.redirect);
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
