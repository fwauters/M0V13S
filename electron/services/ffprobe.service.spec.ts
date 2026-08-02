/**
 * Tests du parsing de la sortie ffprobe (fixtures réalistes, pas de spawn).
 */
import { describe, expect, it } from 'vitest';

import { parseFfprobeOutput } from './ffprobe.service';

/** Sortie ffprobe typique d'un MKV film (extraits pertinents). */
const MKV_FIXTURE = JSON.stringify({
  streams: [
    { index: 0, codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080 },
    { index: 1, codec_type: 'audio', codec_name: 'dts', channels: 6 },
    { index: 2, codec_type: 'audio', codec_name: 'ac3', channels: 2 },
    { index: 3, codec_type: 'subtitle', codec_name: 'subrip' },
  ],
  format: { filename: 'film.mkv', duration: '7260.416000', size: '4700000000' },
});

describe('parseFfprobeOutput', () => {
  it('extrait durée, codecs et résolution du premier flux de chaque type', () => {
    expect(parseFfprobeOutput(MKV_FIXTURE)).toEqual({
      durationSec: 7260,
      videoCodec: 'hevc',
      audioCodec: 'dts',
      width: 1920,
      height: 1080,
    });
  });

  it('tolère les champs manquants (fichier audio seul, pas de format)', () => {
    const json = JSON.stringify({
      streams: [{ codec_type: 'audio', codec_name: 'mp3' }],
    });
    expect(parseFfprobeOutput(json)).toEqual({
      durationSec: null,
      videoCodec: null,
      audioCodec: 'mp3',
      width: null,
      height: null,
    });
  });

  it('durée illisible -> null (pas de NaN en base)', () => {
    const json = JSON.stringify({ format: { duration: 'N/A' }, streams: [] });
    expect(parseFfprobeOutput(json).durationSec).toBeNull();
  });

  it('JSON invalide -> lève (l appelant marquera le fichier non analysé)', () => {
    expect(() => parseFfprobeOutput('pas du json')).toThrow();
  });
});
