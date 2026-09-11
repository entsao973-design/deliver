(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AdminArchiveDownload = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  function defaultWait(milliseconds) {
    return new Promise((resolve) => root.setTimeout(resolve, milliseconds));
  }

  async function fetchAndSaveFile(name, requestUrl, options = {}) {
    const fetchImpl = options.fetchImpl || root.fetch.bind(root);
    const documentRef = options.documentRef || root.document;
    const urlApi = options.urlApi || root.URL;
    const schedule = options.schedule || root.setTimeout.bind(root);
    const response = await fetchImpl(requestUrl, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error(`${name} 下載失敗（HTTP ${response.status}）`);
    }
    const blob = await response.blob();
    const objectUrl = urlApi.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = objectUrl;
    link.download = name;
    documentRef.body.append(link);
    link.click();
    link.remove();
    schedule(() => urlApi.revokeObjectURL(objectUrl), 1000);
  }

  async function downloadInBatches(names, downloadOne, options = {}) {
    const batchSize = options.batchSize || 8;
    const batchDelayMs = options.batchDelayMs ?? 1000;
    const wait = options.wait || defaultWait;
    const onProgress = options.onProgress || (() => {});
    const failures = [];
    let successCount = 0;

    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      try {
        await downloadOne(name);
        successCount += 1;
      } catch (error) {
        failures.push({ name, error });
      }

      onProgress({
        completed: index + 1,
        total: names.length,
        successCount,
        failureCount: failures.length,
      });

      const batchCompleted = (index + 1) % batchSize === 0;
      if (batchCompleted && index + 1 < names.length) {
        await wait(batchDelayMs);
      }
    }

    return {
      total: names.length,
      successCount,
      failures,
    };
  }

  return { downloadInBatches, fetchAndSaveFile };
});
