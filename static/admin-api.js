(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AdminApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NETWORK_ERROR_MESSAGE = "網路中斷或服務未啟動，請確認服務後再試";
  const HTML_ERROR_MESSAGE = "伺服器回傳非預期頁面，請重新整理或重新登入後再試";
  const INVALID_JSON_MESSAGE = "伺服器回應格式錯誤，請重新整理後再試";
  const TOO_LARGE_MESSAGE = "Excel 檔案太大，上傳失敗，請縮小檔案後再試";

  async function request(path, options = {}, fetchImpl) {
    const activeFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!activeFetch) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    let response;
    try {
      response = await activeFetch(path, {
        method: options.method || "GET",
        headers: requestHeaders(options),
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throw makeError(payload.error || responseMessage(response, ""), response.status);
    }
    return payload;
  }

  function requestHeaders(options) {
    const headers = { ...(options.headers || {}) };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  async function readPayload(response) {
    const text = await response.text();
    if (!text.trim()) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      throw makeError(responseMessage(response, text), response.status);
    }
  }

  function responseMessage(response, text) {
    if (response.status === 413) {
      return TOO_LARGE_MESSAGE;
    }
    if (looksLikeHtml(text)) {
      if (response.status === 401) {
        return "登入已失效，請重新登入";
      }
      if (response.status === 403) {
        return "權限不足，請重新登入後再試";
      }
      if (response.status === 404) {
        return "伺服器找不到此功能，請重新整理後再試";
      }
      return HTML_ERROR_MESSAGE;
    }
    return INVALID_JSON_MESSAGE;
  }

  function looksLikeHtml(text) {
    return /^\s*<(?:!doctype|html)\b/i.test(text);
  }

  function makeError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  return {
    request,
    responseMessage,
  };
});
