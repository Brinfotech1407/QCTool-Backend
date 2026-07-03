export function isNonDestructiveCategory(categoryName?: string) {
  const normalized = String(categoryName ?? '').trim().toLowerCase();
  return (
    normalized.includes('non-destructive') ||
    normalized.includes('visual tests') ||
    normalized.includes('visual')
  );
}

export function formatCertificateValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return '-';
  }

  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(normalized)) {
    return asNumber.toFixed(2);
  }

  return normalized;
}

export function formatObservedValue(value: unknown, categoryName?: string) {
  if (value === null || value === undefined || value === '') {
    return isNonDestructiveCategory(categoryName) ? 'Satisfactory' : '-';
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'yes' || normalized === 'no') {
    return 'Satisfactory';
  }

  return formatCertificateValue(value);
}

export function getIsoDeclarationText() {
  return `We Certify that Material Described above fully confirms to ISO 10773:${new Date().getFullYear()} Standards.`;
}
