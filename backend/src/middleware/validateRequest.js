const buildValidationMiddleware = (source) => (schema) => (req, res, next) => {
  const result = schema.safeParse(req[source] || {});
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return res.status(400).json({
      message: 'Invalid request.',
      errors: issues,
    });
  }

  req[source] = result.data;
  return next();
};

const validateBody = buildValidationMiddleware('body');
const validateParams = buildValidationMiddleware('params');
const validateQuery = buildValidationMiddleware('query');

module.exports = { validateBody, validateParams, validateQuery };
