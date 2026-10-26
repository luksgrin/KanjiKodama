/**
 * The images of the radicals the Java app draws instead of their characters ("Yurt", "Beggar"…):
 * `Subject.getTitleImageId` / `needsTitleImage` and the vector drawables `res/drawable/radical_<id>.xml`,
 * shown by `SubjectInfoButtonView` (headline tiles, cards, session question) and by
 * `WaniKaniTagHandler.TitleImageSpan` (toolbar titles, dashboard tables).
 *
 * The content builder converts the drawables (`scripts/content/titleImages.ts`) into the content file's
 * `title_image` table (`id` → JSON {@link TitleImage}); the app reads it once with {@link readTitleImages}
 * (content files built before the table existed simply have no images: the slug is shown instead).
 */
import type { Database } from 'sql.js';

/** The subject ids `Subject.getTitleImageId` maps to a drawable (radical_8762.xml exists but is unused). */
export const TITLE_IMAGE_IDS: readonly number[] = [
  56, 114, 8766, 8770, 8771, 8773, 8774, 8778, 8781, 8787, 8788, 8790, 8792, 8796, 8797, 8798, 8799, 9452,
];

/** One stroked path of a drawable (every one is `strokeLineCap="square"`, no fill), with its group's clip. */
export interface TitleImagePath {
  d: string;
  /** Stroke width in viewport units. */
  w: number;
  /** The enclosing `<group>`'s `<clip-path>` data, if any. */
  clip?: string;
}

/** A vector drawable as the app needs it: a square viewport and its paths in drawing order. */
export interface TitleImage {
  /** `viewportWidth` (= `viewportHeight`). */
  size: number;
  paths: TitleImagePath[];
}

let registered: ReadonlyMap<number, TitleImage> = new Map();

/** The `title_image` table of an open content file ({} when the file has none). */
export function readTitleImages(db: Database): Map<number, TitleImage> {
  const out = new Map<number, TitleImage>();
  const has = db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'title_image'");
  if (has.length === 0) return out;
  for (const [id, data] of db.exec('SELECT id, data FROM title_image ORDER BY id')[0]?.values ?? []) {
    try {
      out.set(Number(id), JSON.parse(String(data)) as TitleImage);
    } catch {
      // A broken row: the slug is shown instead.
    }
  }
  return out;
}

/** Makes the images of the loaded content file available to {@link titleImageOf} (done by `readContentFile`). */
export function registerTitleImages(images: ReadonlyMap<number, TitleImage>): void {
  registered = images;
}

/** `Subject.needsTitleImage() ? getTitleImageId() : 0`, as data: the radical's image, or null. */
export function titleImageOf(subject: { id: number; object: string }): TitleImage | null {
  if (subject.object !== 'radical') return null;
  return registered.get(subject.id) ?? null;
}
