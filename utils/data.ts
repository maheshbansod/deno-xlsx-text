/**
 * Lil endian gang reading of some bytes
 */
export function readBytesAsNumber(
  buffer: Uint8Array,
  offset: number,
  n: number,
) {
  let value = 0;
  for (let i = 0; i < n; i++) {
    const idx = offset + i;
    value += buffer[idx] * Math.pow(256, i);
  }
  return value;
}

export function readBytesAsString(
  buffer: Uint8Array,
  offset: number,
  n: number,
) {
  return new TextDecoder().decode(buffer.subarray(offset, offset + n));
}
