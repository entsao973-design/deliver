function createPhotoViewer(config) {
  const dialog = config.dialog;
  const image = config.image;
  const zoomIn = config.zoomIn;
  const zoomOut = config.zoomOut;
  const reset = config.reset;
  const viewport = config.viewport;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let pinchState = null;
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
  }

  function setZoom(nextScale, focalPoint = null) {
    const previousScale = scale;
    scale = Math.max(1, Math.min(5, nextScale));

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
    dragging = false;
    viewport.classList.remove("is-gesturing");
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

  zoomIn.addEventListener("click", () => setZoom(scale + 0.25));
  zoomOut.addEventListener("click", () => setZoom(scale - 0.25));
  reset.addEventListener("click", resetView);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    setZoom(scale + (event.deltaY < 0 ? 0.2 : -0.2), { x: event.clientX, y: event.clientY });
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);

    if (pointers.size >= 2) {
      startPinch();
      return;
    }

    if (scale <= 1) {
      return;
    }
    dragging = true;
    viewport.classList.add("is-gesturing");
    startX = event.clientX - offsetX;
    startY = event.clientY - offsetY;
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) {
      return;
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

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

  function endPointer(event) {
    pointers.delete(event.pointerId);
    dragging = false;
    if (pointers.size >= 2) {
      startPinch();
    } else {
      pinchState = null;
      viewport.classList.remove("is-gesturing");
    }
  }

  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("lostpointercapture", endPointer);
  dialog.addEventListener("close", resetView);
  image.addEventListener("load", () => requestAnimationFrame(resetView));
  window.addEventListener("resize", resetView);
  if ("ResizeObserver" in window) {
    new ResizeObserver(resetView).observe(viewport);
  }

  return { resetView };
}
