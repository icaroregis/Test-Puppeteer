export function textNormalizado(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase();
}
