/**
 * Formatage court d'une position/durée en secondes pour les libellés
 * (« Reprendre à 1 h 23 », « Reprendre à 42 min »). Volontairement
 * neutre en langue : chiffres + « h »/« min », lisible en fr comme en en.
 */
export function formatDurationLabel(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) {
    return `${hours} h ${String(minutes).padStart(2, '0')}`;
  }
  return `${minutes} min`;
}
