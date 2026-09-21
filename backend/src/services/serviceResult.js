const captureServiceResult = async (handler, request) => {
  const result = { status: 200, headers: {}, body: undefined, redirect: null };
  const response = {
    status(status) {
      result.status = status;
      return response;
    },
    json(body) {
      result.body = body;
      return result;
    },
    setHeader(name, value) {
      result.headers[name] = value;
      return response;
    },
    set(name, value) {
      result.headers[name] = value;
      return response;
    },
    redirect(location) {
      result.redirect = location;
      return result;
    },
  };
  await handler(request, response);
  return result;
};

const attachExecutor = (service) => {
  service.execute = (action, request) => {
    const handler = service[action];
    if (typeof handler !== 'function') throw new Error(`Unknown service action: ${action}`);
    return captureServiceResult(handler, request);
  };
  return service;
};

module.exports = { attachExecutor, captureServiceResult };
