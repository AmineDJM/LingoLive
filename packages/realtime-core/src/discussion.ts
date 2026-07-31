import {
  dedupeTargetLanguages,
  defaultRotationsFor,
  isRtlLanguage,
  normalizeLanguageTag,
  rotateClockwise,
  type DiscussParticipantCount,
  type Rotation,
} from '@lingolive/contracts';

/**
 * The DISCUSS canvas: one device lying on a table, 2–4 people around it, each
 * with their own tile, their own reading language and their own orientation.
 *
 * This module is pure state — no React, no styling — so the exact same logic
 * backs the web canvas, the mobile canvas and the tests.
 */

export interface DiscussionTile {
  readonly id: string;
  readonly position: number;
  /** Language this person READS in. */
  readonly readingLanguage: string;
  /** `auto` unless pinned in the advanced (long-press) setting. */
  readonly spokenLanguageHint: string;
  readonly rotation: Rotation;
  readonly displayName: string | null;
  readonly direction: 'ltr' | 'rtl';
}

export interface DiscussionState {
  readonly tiles: readonly DiscussionTile[];
  /** Exactly one speaker at a time — overlapping mics ruin transcription. */
  readonly activeSpeakerTileId: string | null;
  readonly participantCount: DiscussParticipantCount;
}

/**
 * Physical layout around a device flat on a table.
 *
 * `rotation` is how much the tile's content is rotated so that it reads
 * upright for the person on that side:
 *   - 0°   → the person on the near side (holding the phone);
 *   - 180° → the person opposite them;
 *   - 90° / 270° → the people on the sides.
 */
export function createDiscussionState(
  count: DiscussParticipantCount,
  languages: readonly string[],
): DiscussionState {
  const rotations = defaultRotationsFor(count);
  const tiles: DiscussionTile[] = [];
  for (let position = 0; position < count; position++) {
    const language = normalizeLanguageTag(languages[position] ?? (position === 0 ? 'en' : 'fr'));
    tiles.push({
      id: `tile-${position}`,
      position,
      readingLanguage: language,
      spokenLanguageHint: 'auto',
      rotation: rotations[position] ?? 0,
      displayName: null,
      direction: isRtlLanguage(language) ? 'rtl' : 'ltr',
    });
  }
  return { tiles, activeSpeakerTileId: null, participantCount: count };
}

export function rotateTile(state: DiscussionState, tileId: string): DiscussionState {
  return {
    ...state,
    tiles: state.tiles.map((tile) =>
      tile.id === tileId ? { ...tile, rotation: rotateClockwise(tile.rotation) } : tile,
    ),
  };
}

export function setTileRotation(
  state: DiscussionState,
  tileId: string,
  rotation: Rotation,
): DiscussionState {
  return {
    ...state,
    tiles: state.tiles.map((tile) => (tile.id === tileId ? { ...tile, rotation } : tile)),
  };
}

export function setTileLanguage(
  state: DiscussionState,
  tileId: string,
  language: string,
): DiscussionState {
  const normalized = normalizeLanguageTag(language);
  return {
    ...state,
    tiles: state.tiles.map((tile) =>
      tile.id === tileId
        ? {
            ...tile,
            readingLanguage: normalized,
            direction: isRtlLanguage(normalized) ? 'rtl' : 'ltr',
          }
        : tile,
    ),
  };
}

export function setTileSpokenLanguage(
  state: DiscussionState,
  tileId: string,
  spokenLanguageHint: string,
): DiscussionState {
  return {
    ...state,
    tiles: state.tiles.map((tile) =>
      tile.id === tileId ? { ...tile, spokenLanguageHint } : tile,
    ),
  };
}

/**
 * Starts a turn. Returns the state unchanged when someone else already holds
 * the microphone — the UI disables the other buttons, and this is the
 * server-side-of-the-client guarantee behind it.
 */
export function startSpeaking(state: DiscussionState, tileId: string): DiscussionState {
  if (state.activeSpeakerTileId !== null && state.activeSpeakerTileId !== tileId) return state;
  if (!state.tiles.some((tile) => tile.id === tileId)) return state;
  return { ...state, activeSpeakerTileId: tileId };
}

export function stopSpeaking(state: DiscussionState, tileId?: string): DiscussionState {
  if (tileId && state.activeSpeakerTileId !== tileId) return state;
  return { ...state, activeSpeakerTileId: null };
}

export function canSpeak(state: DiscussionState, tileId: string): boolean {
  return state.activeSpeakerTileId === null || state.activeSpeakerTileId === tileId;
}

export function findTile(state: DiscussionState, tileId: string): DiscussionTile | undefined {
  return state.tiles.find((tile) => tile.id === tileId);
}

/**
 * The set of translations one utterance actually requires.
 *
 * This is the DISCUSS-mode expression of the product's central cost rule:
 * transcribe once, translate once per distinct target language, reuse
 * everywhere. Four people with two shared languages cost two translations.
 */
export function targetLanguagesForTurn(
  state: DiscussionState,
  speakerTileId: string,
  detectedSourceLanguage?: string | null,
): string[] {
  const speaker = findTile(state, speakerTileId);
  const source =
    detectedSourceLanguage && detectedSourceLanguage !== 'auto'
      ? detectedSourceLanguage
      : (speaker?.readingLanguage ?? null);

  const targets = state.tiles
    .filter((tile) => tile.id !== speakerTileId)
    .map((tile) => tile.readingLanguage);

  return dedupeTargetLanguages(targets, source);
}

/** Every distinct reading language currently on the table. */
export function activeLanguages(state: DiscussionState): string[] {
  return dedupeTargetLanguages(state.tiles.map((tile) => tile.readingLanguage));
}

/**
 * CSS/RN transform for a tile.
 *
 * The rotation applies to the tile only — never to the whole screen — and the
 * text direction is preserved independently, which is what keeps Arabic
 * readable in a 90°-rotated tile sitting next to French tiles.
 */
export function tileTransform(tile: DiscussionTile): {
  rotateDeg: number;
  direction: 'ltr' | 'rtl';
  /** A 90°/270° tile swaps its logical width and height. */
  isQuarterTurn: boolean;
} {
  return {
    rotateDeg: tile.rotation,
    direction: tile.direction,
    isQuarterTurn: tile.rotation === 90 || tile.rotation === 270,
  };
}

/**
 * Grid placement for each layout. Coordinates are 1-based CSS-grid lines on a
 * 2×2 grid; the mobile canvas maps them onto flex rows.
 */
export interface TilePlacement {
  readonly tileId: string;
  readonly column: number;
  readonly row: number;
  readonly columnSpan: number;
  readonly rowSpan: number;
}

export function layoutPlacements(state: DiscussionState): TilePlacement[] {
  const [t0, t1, t2, t3] = state.tiles;
  switch (state.participantCount) {
    case 2:
      // Two halves facing each other.
      return [
        { tileId: t0!.id, column: 1, row: 2, columnSpan: 2, rowSpan: 1 },
        { tileId: t1!.id, column: 1, row: 1, columnSpan: 2, rowSpan: 1 },
      ];
    case 3:
      // One person on the far side, two on the near side.
      return [
        { tileId: t0!.id, column: 1, row: 2, columnSpan: 2, rowSpan: 1 },
        { tileId: t1!.id, column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
        { tileId: t2!.id, column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
      ];
    case 4:
      // One person per side of the table.
      return [
        { tileId: t0!.id, column: 1, row: 2, columnSpan: 1, rowSpan: 1 },
        { tileId: t1!.id, column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
        { tileId: t2!.id, column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
        { tileId: t3!.id, column: 2, row: 2, columnSpan: 1, rowSpan: 1 },
      ];
  }
}
