# Smart Photo Driver Design

## Goal

Add a driver-side smart photo entry point that uses the phone's current location to find undelivered delivery orders within 300 meters, then starts the existing photo workflow with normal delivery selected by default and abnormal delivery available as an option.

## Scope

- Add a `智慧拍照` button to the driver operation screen, immediately left of `重新整理`, with matching height.
- Use `navigator.geolocation.getCurrentPosition()` at the moment the button is pressed.
- Match only currently loaded, undelivered orders for the selected vehicle/date.
- Match only orders with `geocode_status === "success"` and numeric `geocode_lat` / `geocode_lng`.
- Use 300 meters as the default match radius.
- If no reliable location or no nearby order is found, return the driver to manual order selection with a clear message.
- Preserve the existing photo capture, upload, and offline queue flow.
- Do not add voice prompts.

## Driver Flow

1. Driver taps `智慧拍照`.
2. The browser requests current location.
3. If location is unavailable or accuracy is too low, show a message and do not block manual photo taking.
4. The app calculates distance from the phone location to each eligible order.
5. If exactly one order is within 300 meters, show a compact confirmation dialog.
6. If multiple orders are within 300 meters, show a compact selection dialog sorted by distance.
7. The delivery status defaults to `正常達交`; the driver can switch to `異常達交`.
8. Selecting/confirming an order calls the existing `startCapture(delivery, status)` function.

## Reliability Rules

- Maximum acceptable location accuracy: 300 meters.
- If `coords.accuracy > 300`, the app shows `定位精度不足，請自行選擇單號拍照`.
- If geolocation fails, the app shows `無法取得目前定位，請自行選擇單號拍照`.
- If no eligible orders are within range, the app shows `300公尺內查無單據，請自行選擇單號拍照`.
- If offline but the current loaded delivery list has GPS fields, smart matching can still work.

## UI Design

- The `智慧拍照` button lives in `.summary-actions`, left of `重新整理`.
- Button height matches `重新整理`.
- A new dialog is used only for smart photo candidate confirmation/selection.
- The dialog contains a normal/abnormal status choice and a list of candidate order buttons.
- Candidate text uses company name, invoice number, customer, and distance.

## Testing

- Unit-test distance calculation and candidate filtering in a small browser-global helper.
- Unit-test no-candidate, single-candidate, and multiple-candidate outcomes.
- Existing driver page tests should assert the button exists left of refresh and shares height styling.
- Existing upload/offline tests continue to cover the photo submission path.
