import type {
  CertificateItem,
  CertificateMatrixCell,
  CertificateMatrixLayout,
  CertificateMatrixRow,
  CertificateSections,
  CertificateSizeChunk,
  CertificateSizeReference,
  CertificateTableRow,
} from './certificate.types';

type SectionKey = 'dimensionRows' | 'mechanicalRows' | 'metallurgicalRows' | 'ndtRows';

const SECTION_KEYS: SectionKey[] = [
  'dimensionRows',
  'mechanicalRows',
  'metallurgicalRows',
  'ndtRows',
];

function formatSize(item: CertificateItem) {
  return `${item.od} x ${item.wt} x ${item.length ?? '-'}`;
}

function formatQty(item: CertificateItem) {
  return item.qty != null ? `${item.qty} Kg` : '-';
}

function formatPcs(item: CertificateItem) {
  return item.pcs != null ? String(item.pcs) : '-';
}

function getDimensionRequired(row: CertificateTableRow & { min?: string; max?: string }) {
  const min = row.min && row.min !== '-' ? row.min : null;
  const max = row.max && row.max !== '-' ? row.max : null;

  if (min && max) {
    return `${min} - ${max}`;
  }
  if (min) {
    return `Min ${min}`;
  }
  if (max) {
    return `Max ${max}`;
  }

  return row.required || '-';
}

function getRequiredValue(sectionKey: SectionKey, row: any) {
  if (sectionKey === 'dimensionRows') {
    return getDimensionRequired(row);
  }

  return row.required || '-';
}

function buildSectionRows(
  sectionKey: SectionKey,
  sizes: Array<CertificateSizeReference & { item: CertificateItem }>,
): CertificateMatrixRow[] {
  const testOrder: string[] = [];

  sizes.forEach(({ item }) => {
    const rows = item.certificateSections?.[sectionKey] ?? [];
    rows.forEach((row: CertificateTableRow) => {
      if (!testOrder.includes(row.test)) {
        testOrder.push(row.test);
      }
    });
  });

  return testOrder.map((test, index) => {
    const cells: CertificateMatrixCell[] = sizes.map(({ item }) => {
      const row = (item.certificateSections?.[sectionKey] ?? []).find(
        (candidate: CertificateTableRow) => candidate.test === test,
      ) as any;

      return {
        required: row ? getRequiredValue(sectionKey, row) : '-',
        observed: row?.observed ?? '-',
        result: row?.result ?? '-',
      };
    });

    return {
      sr: index + 1,
      test,
      cells,
    };
  });
}

export function buildCertificateMatrixLayout(
  items: CertificateItem[],
  chunkSize = 5,
): CertificateMatrixLayout {
  const sizeReferences = items.map((item, index) => ({
    key: `S${index + 1}`,
    sr: `S${index + 1}`,
    size: formatSize(item),
    condition: item.condition ?? '-',
    qty: formatQty(item),
    pcs: formatPcs(item),
  }));

  const sizeChunks: CertificateSizeChunk[] = [];

  for (let start = 0; start < items.length; start += chunkSize) {
    const chunkItems = items.slice(start, start + chunkSize);
    const chunkSizes = chunkItems.map((item, chunkIndex) => ({
      ...sizeReferences[start + chunkIndex],
      item,
    }));
    const startLabel = chunkSizes[0]?.sr ?? `S${start + 1}`;
    const endLabel =
      chunkSizes[chunkSizes.length - 1]?.sr ?? `S${start + chunkItems.length}`;

    sizeChunks.push({
      label: startLabel === endLabel ? startLabel : `${startLabel}-${endLabel}`,
      sizes: chunkSizes.map(({ item: _item, ...size }) => size),
      sections: {
        dimension: {
          rows: buildSectionRows('dimensionRows', chunkSizes),
        },
        mechanical: {
          rows: buildSectionRows('mechanicalRows', chunkSizes),
        },
        metallurgical: {
          rows: buildSectionRows('metallurgicalRows', chunkSizes),
        },
        ndt: {
          rows: buildSectionRows('ndtRows', chunkSizes),
        },
      },
    });
  }

  return {
    sizeReferences,
    sizeChunks,
  };
}
