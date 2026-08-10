import { formatDurationLabel } from './format-duration';

/** Tests du libellé court de position (boutons Reprendre). */
describe('formatDurationLabel', () => {
  it('affiche heures + minutes sur deux chiffres au-delà d une heure', () => {
    expect(formatDurationLabel(3600 + 23 * 60 + 45)).toBe('1 h 23');
    expect(formatDurationLabel(2 * 3600 + 5 * 60)).toBe('2 h 05');
  });

  it('affiche les minutes seules sous une heure', () => {
    expect(formatDurationLabel(42 * 60 + 30)).toBe('42 min');
    expect(formatDurationLabel(59)).toBe('0 min');
  });
});
