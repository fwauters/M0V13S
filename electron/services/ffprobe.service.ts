/**
 * Extraction des données techniques d'un fichier vidéo via ffprobe embarqué
 * (tools\ffprobe.exe, déposé par le script prepare-tools).
 *
 * Découpage testable : `parseFfprobeOutput` est PURE (JSON -> infos) et
 * couverte par fixtures ; `probeFile` est le fin wrapper d'exécution.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getFfprobePath } from './paths.service';

const execFileAsync = promisify(execFile);

/** Données techniques d'un fichier vidéo (null = non détecté). */
export interface MediaTechnicalInfo {
  durationSec: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  /** Langues des pistes audio (codes ISO 639-2 tels que tagués dans le
   *  conteneur, dédupliqués, ordre des pistes). Vide si non tagué. */
  audioLangs: string[];
  /** Langues des pistes de sous-titres (même convention). */
  subtitleLangs: string[];
}

/** Forme minimale de la sortie JSON de ffprobe qu'on exploite. */
interface FfprobeJson {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    /** Métadonnées de piste — `language` est un code ISO 639-2 (fre, eng…). */
    tags?: { language?: string };
  }>;
}

/**
 * Langues dédupliquées des pistes d'un type donné, dans l'ordre du
 * conteneur. `und` (undetermined) et les pistes non taguées sont
 * ignorées : mieux vaut ne rien afficher qu'afficher « inconnu ».
 */
function streamLanguages(
  streams: NonNullable<FfprobeJson['streams']>,
  codecType: 'audio' | 'subtitle',
): string[] {
  const langs: string[] = [];
  for (const stream of streams) {
    const lang = stream.tags?.language?.toLowerCase();
    if (
      stream.codec_type === codecType &&
      lang !== undefined &&
      lang !== '' &&
      lang !== 'und' &&
      !langs.includes(lang)
    ) {
      langs.push(lang);
    }
  }
  return langs;
}

/**
 * Transforme la sortie JSON de ffprobe en infos techniques.
 * Tolérant : un champ manquant donne null, un JSON illisible lève —
 * l'appelant décide (le scanner marque alors le fichier « non analysé »).
 */
export function parseFfprobeOutput(json: string): MediaTechnicalInfo {
  const data = JSON.parse(json) as FfprobeJson;
  const streams = data.streams ?? [];

  // Premier flux vidéo et premier flux audio = flux principaux
  // (convention ffprobe : ordre du conteneur).
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');

  const rawDuration = data.format?.duration;
  const duration = rawDuration === undefined ? NaN : Number.parseFloat(rawDuration);

  return {
    durationSec: Number.isFinite(duration) ? Math.round(duration) : null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    audioLangs: streamLanguages(streams, 'audio'),
    subtitleLangs: streamLanguages(streams, 'subtitle'),
  };
}

/**
 * Analyse un fichier sur disque avec le ffprobe embarqué.
 * @param absolutePath chemin ABSOLU du fichier (résolu par paths.service —
 *                     jamais un chemin relatif stocké tel quel)
 * @throws si ffprobe est absent, plante ou dépasse 30 s (fichier corrompu)
 */
export async function probeFile(absolutePath: string): Promise<MediaTechnicalInfo> {
  const { stdout } = await execFileAsync(
    getFfprobePath(),
    [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      absolutePath,
    ],
    { timeout: 30_000, windowsHide: true },
  );
  return parseFfprobeOutput(stdout);
}
