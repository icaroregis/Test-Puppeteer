export function tipoNormalizado(tipo) {
  return String(tipo ?? '')
    .trim()
    .toLowerCase();
}
