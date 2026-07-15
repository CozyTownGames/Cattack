export type WeaponId = 'default';

export type Weapon = {
  id: WeaponId;
  name: string;
  damage: number;
  attackSpeed: number; // Attacks per second
  hitboxSize: { width: number; height: number };
};

export const WEAPONS: Record<WeaponId, Weapon> = {
  default: {
    id: 'default',
    name: 'Blaster',
    damage: 2,
    attackSpeed: 1.5,
    hitboxSize: { width: 4, height: 4 },
  },
};
