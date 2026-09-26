// Phone-side proof: a GPS fix and a camera photo, shrunk before upload so it sends fast on mobile data.

export type Fix = { lat: number; lng: number; accuracy_m: number; captured_at: string };

/** One fresh, high-accuracy GPS fix. Rejects with a readable message when the worker blocks location. */
export function getFix(timeoutMs = 20_000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This phone can't share location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy), captured_at: new Date(p.timestamp).toISOString() }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow it for Scrappy in your browser settings." : "Couldn't get a GPS fix. Step outside or near a window and try again.")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** A cheaper fix for finding nearby tasks (a few minutes old is fine). */
export function getRoughFix(): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy), captured_at: new Date(p.timestamp).toISOString() }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

/** Camera photo -> JPEG data URL, longest side at most `max` px (keeps uploads well under the API's 2.5 MB cap). */
export async function shrinkPhoto(file: File, max = 1600, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("That file isn't a photo we can read. Take a new one.");
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

/** Great-circle distance in metres (same formula the API uses). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${m} m`);

const NEARBY_KEY = "scrappy.nearby";
export const nearbyEnabled = () => {
  try {
    return localStorage.getItem(NEARBY_KEY) === "1";
  } catch {
    return false;
  }
};
export const setNearbyEnabled = (on: boolean) => {
  try {
    localStorage.setItem(NEARBY_KEY, on ? "1" : "0");
  } catch {}
};
