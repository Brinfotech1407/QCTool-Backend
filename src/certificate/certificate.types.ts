export type CertificateChemicalRow = {
  sr: number;
  element: string;
  requiredMin: string;
  requiredMax: string;
  observed: string;
  result: string;
};

export type CertificateTableRow = {
  sr: number;
  test: string;
  required: string;
  observed: string;
  result: string;
};

export type CertificateDimensionRow = CertificateTableRow & {
  size: string;
  condition: string;
  min: string;
  max: string;
};

export type CertificateSections = {
  dimensionRows: CertificateDimensionRow[];
  mechanicalRows: CertificateTableRow[];
  metallurgicalRows: CertificateTableRow[];
  ndtRows: CertificateTableRow[];
  remarks: string;
};

export type CategoryShape = {
  name: string;
  rules: Array<Record<string, any>>;
};

export type CertificateItem = {
  od: number;
  wt: number;
  qty?: number;
  pcs?: number;
  length?: number;
  condition?: string;
  status: string;
  categories: CategoryShape[];
  certificateSections?: CertificateSections;
};

export type CertificatePayload = {
  batch: {
    batchNumber: string;
    grade?: string;
    gradeId?: string;
  };
  customer: {
    name: string;
  };
  chemicalComposition?: unknown;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
};

export type CertificateSizeReference = {
  key: string;
  sr: string;
  size: string;
  condition: string;
  qty: string;
  pcs: string;
};

export type CertificateMatrixCell = {
  required: string;
  observed: string;
  result: string;
};

export type CertificateMatrixRow = {
  sr: number;
  test: string;
  cells: CertificateMatrixCell[];
};

export type CertificateMatrixSection = {
  rows: CertificateMatrixRow[];
};

export type CertificateSizeChunk = {
  label: string;
  sizes: CertificateSizeReference[];
  sections: {
    dimension: CertificateMatrixSection;
    mechanical: CertificateMatrixSection;
    metallurgical: CertificateMatrixSection;
    ndt: CertificateMatrixSection;
  };
};

export type CertificateMatrixLayout = {
  sizeReferences: CertificateSizeReference[];
  sizeChunks: CertificateSizeChunk[];
};
