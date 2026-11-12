// Input validation for everything a browser can send to the API.
// Every check returns a plain-words message that is shown next to the field.

export const GAMERTAG_PATTERN = /^[A-Za-z0-9_]{3,12}$/;
export const PIN_PATTERN = /^[0-9]{4}$/;
export const ROOM_PATTERN = /^[A-Z]{4}$/;

// Returns null if the gamertag is fine, otherwise the reason it is not.
// Only letters, digits and _ are allowed, so a gamertag can never start a
// spreadsheet formula (= + - @) or contain HTML.
export function gamertagProblem(gamertag) {
  if (typeof gamertag !== 'string') return 'Enter a gamertag.';
  if (gamertag.length < 3) return 'Gamertag is too short: use 3 to 12 characters.';
  if (gamertag.length > 12) return 'Gamertag is too long: use 3 to 12 characters.';
  if (!GAMERTAG_PATTERN.test(gamertag)) return 'Use only letters, numbers and _ in a gamertag.';
  return null;
}

export function pinProblem(pin) {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) return 'The PIN must be exactly 4 digits.';
  return null;
}

export const isRoomCode = (code) => typeof code === 'string' && ROOM_PATTERN.test(code);
export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
// The phone's Skip on the match intro carries nothing but its type.
export const isSkip = (msg) => isPlainObject(msg) && msg.t === 'skip' && Object.keys(msg).length === 1;
