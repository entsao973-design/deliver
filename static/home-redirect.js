(function (root) {
  function normalizePathname(pathname) {
    const value = String(pathname || "/");
    const normalized = value.replace(/\/+$/, "");
    return normalized || "/";
  }

  function entryPathForDevice(device = {}) {
    const userAgent = String(device.userAgent || "").toLowerCase();
    const maxTouchPoints = Number(device.maxTouchPoints || 0);
    const viewportWidth = Number(device.viewportWidth || 0);
    const isKnownMobileOrTablet = /android|webos|iphone|ipad|ipod|blackberry|windows phone|mobile|tablet|kindle|silk|playbook/.test(userAgent);
    const isIpadDesktopMode = /macintosh/.test(userAgent) && maxTouchPoints > 1 && viewportWidth > 0 && viewportWidth <= 1366;
    const isTouchTablet = /touch/.test(userAgent) && maxTouchPoints > 1 && viewportWidth > 0 && viewportWidth <= 1024;

    return (isKnownMobileOrTablet || isIpadDesktopMode || isTouchTablet) ? "/driver" : "/admin";
  }

  function readDevice(env = root) {
    const navigator = env.navigator || {};
    const screen = env.screen || {};
    return {
      userAgent: navigator.userAgent || "",
      maxTouchPoints: navigator.maxTouchPoints || 0,
      viewportWidth: screen.width || env.innerWidth || 0,
    };
  }

  function redirectHomeByDevice(env = root) {
    const location = env.location;
    if (!location || normalizePathname(location.pathname) !== "/") {
      return "";
    }

    const target = entryPathForDevice(readDevice(env));
    if (typeof location.replace === "function") {
      location.replace(target);
    } else {
      location.href = target;
    }
    return target;
  }

  const api = {
    entryPathForDevice,
    redirectHomeByDevice,
  };

  root.HomeRedirect = api;
  if (root.window) {
    root.window.HomeRedirect = api;
  }

  if (root.document && root.location) {
    redirectHomeByDevice(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
