// Antibiotic / systemic-antifungal matcher (R2-13, LGS 226 / RIS 27).
// Used by the POS receta capture (receta retenida), the inventory item form
// and the CSV importers to keep antibiotics behind the requires_prescription
// barrier. Pure JS with no imports so tools/ Node scripts can load it too —
// keep it dependency-free.

// Systemic antibiotic/antifungal active principles sold in Mexico.
// Matched as substrings against the accent-stripped lowercase product name,
// so combos ("AMOXICILINA, A. CLAVULANICO 875/125") and salts
// ("BENCILPENICILINA", "BENZATINA BENCILPENICILINA") are covered.
const ANTIBIOTIC_PRINCIPLES = [
  // Penicilinas
  'amoxicilina', 'ampicilina', 'penicilina', 'benzatina',
  // Cefalosporinas
  'cefalexina', 'cefuroxima', 'ceftriaxona', 'cefixima', 'cefadroxilo',
  // Macrólidos
  'azitromicina', 'claritromicina', 'eritromicina',
  // Fluoroquinolonas
  'ciprofloxacino', 'levofloxacino', 'moxifloxacino', 'norfloxacino',
  // Sulfonamidas
  'sulfametoxazol', 'trimetoprima',
  // Tetraciclinas
  'doxiciclina', 'tetraciclina',
  // Lincosamidas
  'clindamicina',
  // Nitroimidazoles y otros antibacterianos
  'metronidazol', 'tinidazol', 'secnidazol', 'nitrofurantoina',
  // Aminoglucósidos
  'gentamicina',
  // Antifúngicos sistémicos (orales)
  'fluconazol', 'itraconazol', 'ketoconazol', 'terbinafina',
];

// Galenic forms that make the match topical (no receta retenida / no forced
// Rx flag): creams, vaginal ovules, eye drops, shampoos, etc.
const TOPICAL_FORM_PATTERN =
  /crema|ovulo|optico|optica|oftalmico|oftalmica|topico|topica|unguento|gel\b|shampoo|locion|gotas/i;

const normalizeName = (name) =>
  (name || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const isAntibioticName = (name) => {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  if (TOPICAL_FORM_PATTERN.test(normalized)) return false;
  return ANTIBIOTIC_PRINCIPLES.some((principle) => normalized.includes(principle));
};

export { ANTIBIOTIC_PRINCIPLES };
