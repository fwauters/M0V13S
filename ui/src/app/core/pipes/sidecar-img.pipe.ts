import { Pipe, PipeTransform } from '@angular/core';

/**
 * Transforme un chemin RELATIF d'image sidecar (posterPath/backdropPath)
 * en URL du protocole local `m0v13s-img://` servi par le main process
 * (voir electron/main.ts — le renderer n'accède jamais au fs).
 * Deux variantes : `img` (originale, défaut) et `thumb` (miniature en
 * cache — grilles et rangées du browse).
 * Pipe PUR : conforme à la règle « aucun appel de méthode en template ».
 */
@Pipe({ name: 'sidecarImg' })
export class SidecarImgPipe implements PipeTransform {
  transform(relPath: string | null, variant: 'img' | 'thumb' = 'img'): string | null {
    return relPath === null ? null : `m0v13s-img://${variant}/${encodeURIComponent(relPath)}`;
  }
}
