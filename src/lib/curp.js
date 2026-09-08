// CURP validation (Clave Única de Registro de Población, México)
// Format per RENAPO: 4 letters + YYMMDD + sex (H/M) + 2-letter state code
// + 3 internal consonants + homoclave (1 char) + verification digit.

const CURP_REGEX =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[BCDFGHJKLMNÑOPQRSTVWXYZ]{3}[0-9A-Z]\d$/;

// Official alphabet used to compute the verification digit.
const CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

/**
 * Validate a CURP string: 18-char official format + checksum digit.
 * Case-insensitive; surrounding whitespace is ignored.
 * @param {string} curp
 * @returns {boolean}
 */
export const isValidCurp = (curp) => {
  if (typeof curp !== 'string') return false;
  const normalized = curp.trim().toUpperCase();
  if (!CURP_REGEX.test(normalized)) return false;

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += CHECKSUM_CHARS.indexOf(normalized[i]) * (18 - i);
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(normalized[17]);
};
