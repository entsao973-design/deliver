(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AdminPhotoView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function showAllPhotosButtonText(enabled) {
    return enabled ? "關閉檢視照片" : "檢視所有照片";
  }

  function shouldRenderInlinePhoto(delivery, deleted, showAllPhotos) {
    return Boolean(showAllPhotos && !deleted && delivery.has_photo && delivery.status);
  }

  return {
    showAllPhotosButtonText,
    shouldRenderInlinePhoto,
  };
});
