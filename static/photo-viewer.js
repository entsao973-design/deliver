function createPhotoViewer(config) {
  const dialog = config.dialog || null;
  const image = config.image;
  const zoomIn = config.zoomIn;
  const zoomOut = config.zoomOut;
  const viewport = config.viewport;
  const useWindowResize = config.useWindowResize !== false;
  const MAX_SCALE = 5;
  const DOUBLE_TAP_DELAY_MS = 300;
  const DOUBLE_TAP_DISTANCE = 28;
  const TAP_MOVE_LIMIT = 12;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let tapStart = null;
  let lastTap = null;
  let suppressTap = false;
  let pinchState = null;
  let touchPinchState = null;
  let handlingTouchPinch = false;
  const pointers = new Map();

  function measureFit() {
    if (!image.naturalWidth || !image.naturalHeight || !viewport.clientWidth || !viewport.clientHeight) {
      return;
    }

    const fitScale = Math.min(
      viewport.clientWidth / image.naturalWidth,
      viewport.clientHeight / image.naturalHeight,
      1,
    );
    image.style.width = `${Math.max(1, Math.floor(image.naturalWidth * fitScale))}px`;
    image.style.height = `${Math.max(1, Math.floor(image.naturalHeight * fitScale))}px`;
    image.classList.add("viewer-ready");
  }

  function clampOffset(nextX = offsetX, nextY = offsetY, nextScale = scale) {
    const maxX = Math.max(0, (image.offsetWidth * nextScale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * nextScale - viewport.clientHeight) / 2);

    return {
      x: maxX > 0 ? Math.max(-maxX, Math.min(maxX, nextX)) : 0,
      y: maxY > 0 ? Math.max(-maxY, Math.min(maxY, nextY)) : 0,
    };
  }

  function applyTransform() {
    const clamped = clampOffset();
    offsetX = clamped.x;
    offsetY = clamped.y;
    image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    image.classList.toggle("zoomed", scale > 1.01);
    viewport.classList.toggle("has-zoom", scale > 1.01);
  }

  function setZoom(nextScale, focalPoint = null) {
    const previousScale = scale;
    scale = Math.max(1, Math.min(MAX_SCALE, nextScale));

    if (focalPoint && previousScale > 0 && scale > 1) {
      const rect = viewport.getBoundingClientRect();
      const focalX = focalPoint.x - rect.left - rect.width / 2;
      const focalY = focalPoint.y - rect.top - rect.height / 2;
      const ratio = scale / previousScale;
      offsetX = focalX - (focalX - offsetX) * ratio;
      offsetY = focalY - (focalY - offsetY) * ratio;
    }

    applyTransform();
  }

  function resetView() {
    pointers.clear();
    pinchState = null;
    touchPinchState = null;
    handlingTouchPinch = false;
    tapStart = null;
    lastTap = null;
    suppressTap = false;
    dragging = false;
    viewport.classList.remove("is-gesturing", "has-zoom");
    measureFit();
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    applyTransform();
  }

  function pointerList() {
    return Array.from(pointers.values());
  }

  function distance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function midpoint(first, second) {
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function toggleDoubleTapZoom(point) {
    if (scale >= MAX_SCALE - 0.01) {
      resetView();
      return;
    }

    setZoom(MAX_SCALE, point);
  }

  function startTap(event) {
    tapStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      moved: false,
    };
  }

  function markTapMoved(event) {
    if (!tapStart || tapStart.pointerId !== event.pointerId) {
      return;
    }

    if (distance(tapStart, { x: event.clientX, y: event.clientY }) > TAP_MOVE_LIMIT) {
      tapStart.moved = true;
    }
  }

  function handleTap(event) {
    const now = performance.now();
    if (!tapStart || tapStart.pointerId !== event.pointerId || tapStart.moved || now - tapStart.time > DOUBLE_TAP_DELAY_MS) {
      tapStart = null;
      return;
    }

    const currentTap = { x: event.clientX, y: event.clientY, time: now };
    const isDoubleTap = lastTap
      && now - lastTap.time <= DOUBLE_TAP_DELAY_MS
      && distance(lastTap, currentTap) <= DOUBLE_TAP_DISTANCE;

    if (!isDoubleTap) {
      lastTap = currentTap;
      tapStart = null;
      return;
    }

    event.preventDefault();
    lastTap = null;
    tapStart = null;
    toggleDoubleTapZoom({ x: event.clientX, y: event.clientY });
  }

  function startPinch() {
    const active = pointerList();
    if (active.length < 2) {
      pinchState = null;
      return;
    }

    pinchState = {
      distance: Math.max(1, distance(active[0], active[1])),
      scale,
    };
    dragging = false;
    viewport.classList.add("is-gesturing");
  }

  function touchList(event) {
    return Array.from(event.touches).map((touch) => ({
      x: touch.clientX,
      y: touch.clientY,
    }));
  }

  function startTouchPinch(event) {
    const active = touchList(event);
    if (active.length < 2) {
      touchPinchState = null;
      return;
    }

    touchPinchState = {
      distance: Math.max(1, distance(active[0], active[1])),
      scale,
    };
    handlingTouchPinch = true;
    suppressTap = true;
    tapStart = null;
    lastTap = null;
    dragging = false;
    pointers.clear();
    viewport.classList.add("is-gesturing");
  }

  if (zoomIn) {
    zoomIn.addEventListener("click", () => setZoom(scale + 0.25));
  }
  if (zoomOut) {
    zoomOut.addEventListener("click", () => setZoom(scale - 0.25));
  }
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    setZoom(scale + (event.deltaY < 0 ? 0.2 : -0.2), { x: event.clientX, y: event.clientY });
  }, { passive: false });

  viewport.addEventListener("touchstart", (event) => {
    if (event.touches.length < 2) {
      return;
    }

    event.preventDefault();
    startTouchPinch(event);
  }, { passive: false });

  viewport.addEventListener("touchmove", (event) => {
    if (event.touches.length < 2 || !touchPinchState) {
      return;
    }

    event.preventDefault();
    const active = touchList(event);
    const nextDistance = Math.max(1, distance(active[0], active[1]));
    const center = midpoint(active[0], active[1]);
    setZoom(touchPinchState.scale * (nextDistance / touchPinchState.distance), center);
  }, { passive: false });

  viewport.addEventListener("touchend", (event) => {
    if (event.touches.length >= 2) {
      startTouchPinch(event);
      return;
    }

    touchPinchState = null;
    handlingTouchPinch = false;
    if (pointers.size === 0 && !dragging) {
      viewport.classList.remove("is-gesturing");
    }
  });

  viewport.addEventListener("touchcancel", () => {
    touchPinchState = null;
    handlingTouchPinch = false;
    if (pointers.size === 0 && !dragging) {
      viewport.classList.remove("is-gesturing");
    }
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" && handlingTouchPinch) {
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);

    if (pointers.size >= 2) {
      suppressTap = true;
      tapStart = null;
      lastTap = null;
      startPinch();
      return;
    }

    startTap(event);

    if (scale <= 1) {
      return;
    }
    dragging = true;
    viewport.classList.add("is-gesturing");
    startX = event.clientX - offsetX;
    startY = event.clientY - offsetY;
  });

  viewport.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && handlingTouchPinch) {
      return;
    }

    if (!pointers.has(event.pointerId)) {
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    markTapMoved(event);

    if (pointers.size >= 2 && pinchState) {
      event.preventDefault();
      const active = pointerList();
      const nextDistance = Math.max(1, distance(active[0], active[1]));
      const center = midpoint(active[0], active[1]);
      setZoom(pinchState.scale * (nextDistance / pinchState.distance), center);
      return;
    }

    if (!dragging) {
      return;
    }
    event.preventDefault();
    offsetX = event.clientX - startX;
    offsetY = event.clientY - startY;
    applyTransform();
  });

  function endPointer(event, allowTap = true) {
    const shouldCheckTap = allowTap && !suppressTap && pointers.size === 1;
    pointers.delete(event.pointerId);
    dragging = false;
    if (pointers.size >= 2) {
      startPinch();
    } else {
      pinchState = null;
      viewport.classList.remove("is-gesturing");
    }
    if (pointers.size === 0) {
      suppressTap = false;
    }
    if (shouldCheckTap) {
      handleTap(event);
    }
  }

  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", (event) => endPointer(event, false));
  viewport.addEventListener("lostpointercapture", (event) => endPointer(event, false));
  if (dialog) {
    dialog.addEventListener("close", resetView);
  }
  image.addEventListener("load", () => requestAnimationFrame(resetView));
  if (useWindowResize) {
    window.addEventListener("resize", resetView);
  }
  if ("ResizeObserver" in window) {
    new ResizeObserver(resetView).observe(viewport);
  }

  return { resetView };
}
