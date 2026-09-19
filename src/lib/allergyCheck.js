// ── ALLERGY CROSS-CHECK (NOM-004 6.2 / patient safety) ─────
// Matches medication names against the patient's recorded allergies
// before a receta is saved. Matching is lowercase, accent-insensitive
// and token-based (tokens < 4 chars ignored) with substring matching
// in both directions, so an allergy 'PENICILINA' catches
// 'BENCILPENICILINA...' and med 'AMOXICILINA 500 MG TABLETA' matches
// a recorded 'amoxicilina' allergy.

const normalizeText = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const tokenize = (s) =>
  normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);

// Builds the matchable allergy list from:
// - historyEntries: customers.medical_history.alergias entries
//   ({ label, value, status }); entries with status 'denied' are ignored.
// - freeText: the receta's own alergias field (may hold typed additions).
// Returns [{ display, matchText }] deduped by normalized display text.
export const collectAllergyStrings = (historyEntries, freeText) => {
  const out = [];
  const seen = new Set();
  const push = (display, matchText) => {
    const key = normalizeText(display).replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ display, matchText });
  };
  (Array.isArray(historyEntries) ? historyEntries : [])
    .filter((e) => e && e.status !== 'denied')
    .forEach((e) => {
      const label = (e.label || '').trim();
      const value = (e.value || '').trim();
      if (!label) return;
      push(value ? `${label}: ${value}` : label, `${label} ${value}`);
    });
  (freeText || '')
    .split(/[;\n]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => push(p, p));
  return out;
};

// One-line summary of the recorded allergies, for prefilling the
// receta's alergias field when it is empty.
export const summarizeAllergies = (historyEntries) =>
  collectAllergyStrings(historyEntries, '')
    .map((a) => a.display)
    .join('; ');

// Returns one { medication, allergy } entry per med↔allergy conflict.
export const findAllergyConflicts = (medicationNames, historyEntries, freeText) => {
  const allergies = collectAllergyStrings(historyEntries, freeText)
    .map((a) => ({ ...a, tokens: tokenize(a.matchText) }))
    .filter((a) => a.tokens.length > 0);
  const conflicts = [];
  (medicationNames || []).forEach((med) => {
    const name = (med || '').trim();
    if (!name) return;
    const medTokens = tokenize(name);
    allergies.forEach((a) => {
      const hit = medTokens.some((mt) =>
        a.tokens.some((at) => mt.includes(at) || at.includes(mt)));
      if (hit) conflicts.push({ medication: name, allergy: a.display });
    });
  });
  return conflicts;
};

// Line appended to the conflicting med's notes when the doctor
// confirms the override, so the decision is printed on the receta.
export const allergyOverrideNote = (medication, allergy) =>
  `Se prescribió ${medication} pese a alergia registrada (${allergy}) — confirmado por el médico.`;
