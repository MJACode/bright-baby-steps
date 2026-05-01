// The canonical public URL of this app.
// Set VITE_APP_URL in .env once you have a production domain.
// Falls back to window.location.origin for local development.
export const APP_URL =
  import.meta.env.VITE_APP_URL || window.location.origin;
