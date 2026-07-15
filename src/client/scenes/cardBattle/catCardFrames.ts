import type { CompanionCatId } from './companionCats';

export type CatCardFrame = {
  image: string;
  sheet: string;
  frame: number;
  columns: number;
  rows: number;
};

const STANDARD_FRAMES = [4, 0, 2, 1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const getCatCardFrameByIndex = (index: number): CatCardFrame => {
  if (index < STANDARD_FRAMES.length) {
    return {
      image: 'cards/standard-cat-cards.png',
      sheet: 'cat_cards_tiles',
      frame: STANDARD_FRAMES[index] ?? 4,
      columns: 5,
      rows: 3,
    };
  }

  return {
    image: 'cards/wild-cat-cards.png',
    sheet: 'wild_cat_cards_tiles',
    frame: Math.max(0, index - STANDARD_FRAMES.length),
    columns: 4,
    rows: 6,
  };
};

export const getCatCardFrame = (catId: CompanionCatId): CatCardFrame => {
  const index = Number(catId.slice(1)) - 1;
  return getCatCardFrameByIndex(Number.isFinite(index) ? index : 0);
};
