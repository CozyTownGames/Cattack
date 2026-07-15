export const PLAYER_PROFILE_VERSION = 1;

export const PLAYER_PROFILE_KEYS = [
  'player_card_coins',
  'player_total_xp',
  'player_total_wins',
  'player_lifetime_cat_cards',
  'player_card_deck',
  'player_unlocked_cards',
  'player_owned_companion_cats',
  'player_companion_cats',
  'player_holographic_companion_cats',
  'player_holographic_deck_cards',
  'player_owned_board_skins',
  'player_equipped_board_skin',
  'player_owned_card_skins',
  'player_equipped_card_skin',
  'player_starter_pack_opened',
  'cattack_first_battle_tutorial',
] as const;

export type PlayerProfileKey = typeof PLAYER_PROFILE_KEYS[number];
export type PlayerProfileValues = Partial<Record<PlayerProfileKey, string>>;

export type StoredPlayerProfile = {
  version: typeof PLAYER_PROFILE_VERSION;
  updatedAt: number;
  values: PlayerProfileValues;
};
