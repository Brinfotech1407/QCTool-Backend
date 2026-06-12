export const CERTIFICATE_COMPANY_NAME = 'HINDALCO INDUSTRIES LIMITED';
export const CERTIFICATE_COMPANY_SUBTITLE = 'Copper Division, Waghodia, Gujarat, India';
export const CERTIFICATE_COMPANY_TAGLINE = 'Manufacturers of Wrought Copper Tubes';
export const CERTIFICATE_TITLE = 'MILL TEST CERTIFICATE';
export const CERTIFICATE_DEFAULT_REMARK =
  'Test specimen of tubes shall not show any gassing or open grain structure.';

export const CERTIFICATE_SECTION_TITLES = {
  chemical: 'CHEMICAL COMPOSITION (%)',
  dimension: 'DIMENSIONAL REPORT',
  mechanical: 'MECHANICAL TEST',
  metallurgical: 'METALLURGICAL TEST',
  ndt: 'NON-DESTRUCTIVE / VISUAL TESTS',
  remarks: 'REMARKS / DECLARATION',
} as const;

export const CERTIFICATE_DEFAULT_NDT_ROWS = [
  { test: 'Freedom From Defects', required: 'As per standard', observed: '-' },
  { test: 'Hydrostatic Test', required: 'No leakage', observed: '-' },
  { test: 'Eddy Current Test', required: 'No cracks', observed: '-' },
] as const;
