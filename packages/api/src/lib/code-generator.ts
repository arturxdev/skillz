// Alphabet excludes 0, O, 1, I, L to avoid visual ambiguity.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Rejection sampling bound so every index has equal probability.
const BYTE_LIMIT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function generateAuthCode(): string {
  const chars: string[] = [];
  // Over-sample so the rejection loop almost never needs a second pass.
  while (chars.length < 12) {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (chars.length === 12) break;
      if (b >= BYTE_LIMIT) continue;
      chars.push(ALPHABET[b % ALPHABET.length]!);
    }
  }
  return `SKLZ-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}
