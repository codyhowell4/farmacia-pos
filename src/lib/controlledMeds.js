// ── CONTROLLED SUBSTANCES (LGS arts. 245-255) ───────────────
// Grupo II (estupefacientes) and Grupo III (psicotrópicos) may only be
// prescribed on official COFEPRIS foliada paper recetas — never on the
// portal's electronic receta. Inventory items flagged with
// controlled_group are blocked from every e-receta flow.

export const CONTROLLED_MED_MESSAGE =
  'Requiere receta foliada COFEPRIS — no puede emitirse por vía electrónica';

const normalizeMedName = (name) =>
  (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Returns the first controlled inventory item whose name matches any of
// medicationNames (normalized), or null when no controlled med is referenced.
export const findControlledMed = (medicationNames, inventoryList) => {
  const names = (Array.isArray(medicationNames) ? medicationNames : [medicationNames])
    .map(normalizeMedName)
    .filter(Boolean);
  if (names.length === 0) return null;
  return (inventoryList || []).find(item =>
    item?.controlled_group && names.includes(normalizeMedName(item.name))
  ) || null;
};

// Message naming the blocked med, for toasts and inline hints.
export const controlledMedMessage = (item) =>
  item?.name ? `${item.name}: ${CONTROLLED_MED_MESSAGE}` : CONTROLLED_MED_MESSAGE;
