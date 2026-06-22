(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AdminOperationState = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  async function runWithButtonLock(button, busyText, operation) {
    if (button?.disabled) {
      return undefined;
    }

    const originalText = button?.textContent || "";
    if (button) {
      button.disabled = true;
      button.textContent = busyText;
      button.setAttribute("aria-busy", "true");
    }

    try {
      return await operation();
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
        button.removeAttribute("aria-busy");
      }
    }
  }

  return { runWithButtonLock };
});
