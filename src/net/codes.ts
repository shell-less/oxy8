/**
 * Room codes: four letters, without look-alikes (no I, L or O next to 1 and 0), so a code read
 * out loud or copied from a phone still works. 23^4 is about 280,000 codes.
 */
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

/** A new code from a source of random numbers in [0, 1). The server passes a cryptographic one. */
export function newRoomCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}

/** Normalises what a player typed: upper case, spaces removed. Null when it cannot be a code. */
export function normaliseRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/\s+/g, '');
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((c) => CODE_LETTERS.includes(c)) ? code : null;
}
