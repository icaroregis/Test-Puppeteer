export function textoNormalizado(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase();
}
