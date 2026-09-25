// Edad derivada de la fecha de nacimiento. En menores de 18 años la
// precisión clínica importa (dosis pediátricas, desarrollo), así que se
// muestra con años y meses; en adultos solo los años cumplidos.
export function formatAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0 || years > 130) return '';
  if (years >= 18) return `${years} años`;
  if (years === 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `${years} ${years === 1 ? 'año' : 'años'}${months > 0 ? ` ${months} ${months === 1 ? 'mes' : 'meses'}` : ''}`;
}
