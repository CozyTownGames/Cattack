export type BoardSkinId = 'classic' | 'cosmic' | 'gold' | 'lava';
export type CardSkinId = 'classic' | 'neon' | 'lava' | 'cosmic' | 'gold';

export type BoardSkin = {
  id: BoardSkinId;
  name: string;
  price: number;
  image: string;
  textureKey: string;
};

export type CardSkin = {
  id: CardSkinId;
  name: string;
  price: number;
  image: string;
  textureKey: string;
  frame?: number;
};

export const BOARD_SKINS: BoardSkin[] = [
  { id: 'classic', name: 'Classic Board', price: 0, image: 'cards/gameboard-bg.png', textureKey: 'gameboard_classic' },
  { id: 'cosmic', name: 'Cosmic Board', price: 1000, image: 'cards/gameboard-bg-cosmic.png', textureKey: 'gameboard_cosmic' },
  { id: 'gold', name: 'Gold Board', price: 2000, image: 'cards/gameboard-bg-gold.png', textureKey: 'gameboard_gold' },
  { id: 'lava', name: 'Lava Board', price: 1000, image: 'cards/gameboard-bg-lava.png', textureKey: 'gameboard_lava' },
];

export const CARD_SKINS: CardSkin[] = [
  { id: 'classic', name: 'Cosmic Paw', price: 0, image: 'cards/card-skins.png', textureKey: 'card_skins', frame: 0 },
  { id: 'neon', name: 'Neon Paw', price: 100, image: 'cards/card-skins.png', textureKey: 'card_skins', frame: 1 },
  { id: 'lava', name: 'Lava Card', price: 500, image: 'cards/card-skin-lava.PNG', textureKey: 'card_skin_lava' },
  { id: 'cosmic', name: 'Cosmic Card', price: 500, image: 'cards/card-skin-cosmic.PNG', textureKey: 'card_skin_cosmic' },
  { id: 'gold', name: 'Gold Card', price: 1000, image: 'cards/card-skin-gold.PNG', textureKey: 'card_skin_gold' },
];

export const isBoardSkinId = (value: unknown): value is BoardSkinId => (
  typeof value === 'string' && BOARD_SKINS.some((skin) => skin.id === value)
);

export const isCardSkinId = (value: unknown): value is CardSkinId => (
  typeof value === 'string' && CARD_SKINS.some((skin) => skin.id === value)
);

export const getBoardSkin = (id: BoardSkinId): BoardSkin => (
  BOARD_SKINS.find((skin) => skin.id === id) ?? BOARD_SKINS[0]!
);

export const getCardSkin = (id: CardSkinId): CardSkin => (
  CARD_SKINS.find((skin) => skin.id === id) ?? CARD_SKINS[0]!
);
