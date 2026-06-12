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
