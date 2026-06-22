(function (root) {
  async function request(path, options = {}) {
    const response = await root.fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error || "系統發生錯誤");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  const api = { request };
  root.DriverApi = api;
  if (root.window) {
    root.window.DriverApi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
