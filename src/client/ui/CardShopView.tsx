import { useMemo, useState } from 'react';
import { COMPANION_CATS, type CompanionCatId } from '../scenes/cardBattle/companionCats';
import { getCatCardFrame } from '../scenes/cardBattle/catCardFrames';
import { changePlayerGold, reportPlayerProgress } from '../playerProgress';
import {
  BOARD_SKINS,
  CARD_SKINS,
  isBoardSkinId,
  isCardSkinId,
  type BoardSkin,
  type BoardSkinId,
  type CardSkin,
  type CardSkinId,
} from '../../shared/cosmetics';

type CardShopViewProps = {
  onClose: () => void;
};

type Pack = {
  id: 'basic' | 'epic';
  name: string;
  cardCount: number;
  price: number;
  color: string;
  image: string;
};

const PACKS: Pack[] = [
  { id: 'basic', name: 'Basic Booster', cardCount: 3, price: 100, color: '#06b6d4', image: 'cards/basic-pack.png' },
  { id: 'epic', name: 'Epic Booster', cardCount: 5, price: 200, color: '#a855f7', image: 'cards/epic-pack.png' },
];

const CAT_IDS = Object.values(COMPANION_CATS).map((cat) => cat.id);
const DECK_SUITS = ['sakura', 'ghost', 'leaf', 'water'] as const;
type BoosterReward =
  | { kind: 'cat'; catId: CompanionCatId }
  | { kind: 'holoCat'; catId: CompanionCatId }
  | { kind: 'holoDeck'; suit: typeof DECK_SUITS[number]; rank: number }
  | { kind: 'sealedDeck'; suit: typeof DECK_SUITS[number]; rank: number; seal: 'gold' | 'red' | 'purple' };

type ShopTab = 'boosters' | 'boards' | 'cards';
const BOARD_SKINS_PER_PAGE = 2;
const CARD_SKINS_PER_PAGE = 3;
const SHOP_TABS: { id: ShopTab; label: string }[] = [
  { id: 'boosters', label: 'BOOSTERS' },
  { id: 'boards', label: 'BOARD SKINS' },
  { id: 'cards', label: 'CARD SKINS' },
];

const readStringList = (key: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readDeckCards = (): Record<string, unknown>[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('player_card_deck') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
};

const deckCardKey = (card: Record<string, unknown>): string | null => {
  const suit = typeof card.suit === 'string' ? card.suit : card.family;
  const rank = typeof card.rank === 'number' ? card.rank : card.number;
  return typeof suit === 'string' && typeof rank === 'number' ? `${suit}-${rank}` : null;
};

const readCoins = (): number => {
  const value = Number(localStorage.getItem('player_card_coins') ?? '0');
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

const readOwnedCats = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('player_owned_companion_cats') ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
};

export function CardShopView({ onClose }: CardShopViewProps) {
  const [activeTab, setActiveTab] = useState<ShopTab>('boosters');
  const [skinPage, setSkinPage] = useState(0);
  const [coins, setCoins] = useState(readCoins);
  const [ownedCats, setOwnedCats] = useState(readOwnedCats);
  const [deckCards, setDeckCards] = useState(readDeckCards);
  const [openedRewards, setOpenedRewards] = useState<BoosterReward[]>([]);
  const [openingPack, setOpeningPack] = useState<Pack | null>(null);
  const [packRevealed, setPackRevealed] = useState(false);
  const [selectedRewardIndex, setSelectedRewardIndex] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [ownedBoardSkins, setOwnedBoardSkins] = useState<BoardSkinId[]>(() => [
    'classic',
    ...readStringList('player_owned_board_skins').filter(isBoardSkinId),
  ]);
  const [ownedCardSkins, setOwnedCardSkins] = useState<CardSkinId[]>(() => [
    'classic',
    ...readStringList('player_owned_card_skins').filter(isCardSkinId),
  ]);
  const [equippedBoardSkin, setEquippedBoardSkin] = useState<BoardSkinId>(() => {
    const stored = localStorage.getItem('player_equipped_board_skin');
    return isBoardSkinId(stored) ? stored : 'classic';
  });
  const [equippedCardSkin, setEquippedCardSkin] = useState<CardSkinId>(() => {
    const stored = localStorage.getItem('player_equipped_card_skin');
    return isCardSkinId(stored) ? stored : 'classic';
  });

  const catNames = useMemo(() => {
    const names = new Map<string, string>();
    Object.values(COMPANION_CATS).forEach((cat) => names.set(cat.id, cat.name));
    return names;
  }, []);

  const duplicateCounts = useMemo(() => {
    const seen = new Set<string>();
    let cats = 0;
    ownedCats.forEach((catId) => {
      if (seen.has(catId)) cats++;
      else seen.add(catId);
    });
    const seenDeckCards = new Set<string>();
    let deck = 0;
    deckCards.forEach((card) => {
      const key = deckCardKey(card);
      if (!key) return;
      if (seenDeckCards.has(key)) deck++;
      else seenDeckCards.add(key);
    });
    return { cats, deck, total: cats + deck };
  }, [deckCards, ownedCats]);

  const buyPack = (pack: Pack) => {
    if (coins < pack.price) {
      setMessage(`You need ${pack.price - coins} more gold.`);
      return;
    }

    const rewards: BoosterReward[] = Array.from({ length: pack.cardCount }, () => {
      const roll = Math.random();
      const index = Math.floor(Math.random() * CAT_IDS.length);
      const catId = CAT_IDS[index] ?? 'c1';
      if (roll < 0.35) return { kind: 'cat', catId };
      if (roll < 0.6) {
        return {
          kind: 'holoDeck',
          suit: DECK_SUITS[Math.floor(Math.random() * DECK_SUITS.length)] ?? 'sakura',
          rank: Math.floor(Math.random() * 13) + 2,
        };
      }
      if (roll < 0.9) {
        const seals: ('gold' | 'red' | 'purple')[] = ['gold', 'red', 'purple'];
        return {
          kind: 'sealedDeck',
          suit: DECK_SUITS[Math.floor(Math.random() * DECK_SUITS.length)] ?? 'sakura',
          rank: Math.floor(Math.random() * 13) + 2,
          seal: seals[Math.floor(Math.random() * seals.length)] ?? 'gold',
        };
      }
      return { kind: 'holoCat', catId };
    });
    const nextCoins = coins - pack.price;
    changePlayerGold(-pack.price);
    setCoins(nextCoins);
    setOpenedRewards(rewards);
    setOpeningPack(pack);
    setPackRevealed(false);
    setSelectedRewardIndex(null);
    setMessage('');
  };

  const claimPack = () => {
    if (selectedRewardIndex === null) return;
    const reward = openedRewards[selectedRewardIndex];
    if (!reward) return;

    if (reward.kind === 'cat' || reward.kind === 'holoCat') {
      const wasOwned = ownedCats.includes(reward.catId);
      const nextOwnedCats = reward.kind === 'cat'
        ? [...ownedCats, reward.catId]
        : wasOwned ? ownedCats : [...ownedCats, reward.catId];
      localStorage.setItem('player_owned_companion_cats', JSON.stringify(nextOwnedCats));
      setOwnedCats(nextOwnedCats);
      if (reward.kind === 'holoCat') {
        const holographicCats = new Set(readStringList('player_holographic_companion_cats'));
        holographicCats.add(reward.catId);
        localStorage.setItem('player_holographic_companion_cats', JSON.stringify([...holographicCats]));
      }
      if (!wasOwned) reportPlayerProgress({ catsCollected: 1, xp: 25 });
    } else if (reward.kind === 'holoDeck') {
      const holographicDeck = new Set(readStringList('player_holographic_deck_cards'));
      holographicDeck.add(`${reward.suit}-${reward.rank}`);
      localStorage.setItem('player_holographic_deck_cards', JSON.stringify([...holographicDeck]));
      try {
        const rawDeck: unknown = JSON.parse(localStorage.getItem('player_card_deck') ?? '[]');
        if (Array.isArray(rawDeck)) {
          const upgradedDeck = rawDeck.map((card) => {
            if (!isRecord(card)) return card;
            const suit = typeof card.suit === 'string' ? card.suit : card.family;
            const rank = typeof card.rank === 'number' ? card.rank : card.number;
            return suit === reward.suit && rank === reward.rank ? { ...card, holographic: true } : card;
          });
          localStorage.setItem('player_card_deck', JSON.stringify(upgradedDeck));
        }
      } catch {
        console.error('[shop] Failed to apply holographic deck upgrade');
      }
    } else {
      const matchingIndex = deckCards.findIndex((card) => deckCardKey(card) === `${reward.suit}-${reward.rank}`);
      const nextDeck = deckCards.map((card, index) => {
        if (index !== matchingIndex) return card;
        const existingSeals = Array.isArray(card.seals)
          ? card.seals.filter((seal): seal is string => typeof seal === 'string')
          : [];
        return { ...card, seals: [...new Set([...existingSeals, reward.seal])] };
      });
      if (matchingIndex < 0) {
        nextDeck.push({
          suit: reward.suit,
          family: reward.suit,
          rank: reward.rank,
          number: reward.rank,
          holographic: false,
          seals: [reward.seal],
        });
      }
      localStorage.setItem('player_card_deck', JSON.stringify(nextDeck));
      setDeckCards(nextDeck);
    }

    reportPlayerProgress({ cardsClaimed: 1 });

    setOpeningPack(null);
    setPackRevealed(false);
    setOpenedRewards([]);
    setSelectedRewardIndex(null);
  };

  const rewardPreviewStyle = (reward: BoosterReward) => {
    if (reward.kind === 'holoDeck' || reward.kind === 'sealedDeck') {
      const row = { water: 0, leaf: 1, sakura: 2, ghost: 3 }[reward.suit];
      return {
        backgroundImage: "url('cards/deck-cards.png')",
        backgroundPosition: `${-(reward.rank - 2) * 59}px ${-row * 91}px`,
        backgroundRepeat: 'no-repeat',
      };
    }
    const frame = getCatCardFrame(reward.catId);
    return {
      backgroundImage: `url('${frame.image}')`,
      backgroundPosition: `${-(frame.frame % frame.columns) * 59}px ${-Math.floor(frame.frame / frame.columns) * 91}px`,
    };
  };

  const rewardName = (reward: BoosterReward) => {
    if (reward.kind === 'holoDeck') return `HOLO ${reward.suit.toUpperCase()} ${reward.rank}`;
    if (reward.kind === 'sealedDeck') return `${reward.seal.toUpperCase()} SEAL ${reward.suit.toUpperCase()} ${reward.rank}`;
    const name = catNames.get(reward.catId) ?? reward.catId;
    return reward.kind === 'holoCat' ? `HOLO ${name}` : name;
  };

  const rewardDescription = (reward: BoosterReward) => {
    if (reward.kind === 'holoDeck') return 'HOLO: This deck card permanently gains +5 Mult whenever it scores.';
    if (reward.kind === 'sealedDeck') {
      if (reward.seal === 'gold') return 'GOLD SEAL: Permanently grants 10 Gold whenever this card scores.';
      if (reward.seal === 'red') return 'RED SEAL: Permanently adds +4 Mult whenever this card scores.';
      return 'PURPLE SEAL: Permanently adds +20 Nips to this card’s base value.';
    }
    const perk = COMPANION_CATS[reward.catId]?.description ?? 'A mysterious Cat card perk.';
    return reward.kind === 'holoCat' ? `${perk} HOLO: Also adds +5 Mult.` : perk;
  };

  const rewardOverlayImage = (reward: BoosterReward): string | null => {
    if (reward.kind === 'holoDeck' || reward.kind === 'holoCat') return 'cards/holo-cards.gif';
    if (reward.kind !== 'sealedDeck') return null;
    return `cards/${{ gold: 'gold-seal.png', red: 'mult-seal.png', purple: 'nips-seal.png' }[reward.seal]}`;
  };

  const renderRewardArt = (reward: BoosterReward, detailed = false) => {
    const overlayImage = rewardOverlayImage(reward);
    return (
      <div
        style={{
          ...styles.rewardCardArt,
          ...(detailed ? styles.detailCardArt : {}),
          ...rewardPreviewStyle(reward),
          ...(reward.kind === 'holoDeck' || reward.kind === 'holoCat' ? styles.holoCardArt : {}),
        }}
      >
        {overlayImage && (
          <img
            src={overlayImage}
            alt=""
            aria-hidden="true"
            style={{
              ...styles.rewardEffectOverlay,
              ...(reward.kind === 'holoDeck' || reward.kind === 'holoCat' ? styles.rewardHoloOverlay : {}),
            }}
          />
        )}
      </div>
    );
  };

  const sellDuplicates = () => {
    if (duplicateCounts.total === 0) {
      setMessage('You have no duplicate cards to sell.');
      return;
    }

    const seen = new Set<string>();
    const originals = ownedCats.filter((catId) => {
      if (seen.has(catId)) return false;
      seen.add(catId);
      return true;
    });
    const seenDeckCards = new Set<string>();
    const originalDeckCards = deckCards.filter((card) => {
      const key = deckCardKey(card);
      if (!key) return true;
      if (seenDeckCards.has(key)) return false;
      seenDeckCards.add(key);
      return true;
    });
    const payout = duplicateCounts.cats * 10 + duplicateCounts.deck * 5;
    const nextCoins = coins + payout;
    localStorage.setItem('player_owned_companion_cats', JSON.stringify(originals));
    localStorage.setItem('player_card_deck', JSON.stringify(originalDeckCards));
    changePlayerGold(payout);
    setOwnedCats(originals);
    setDeckCards(originalDeckCards);
    setCoins(nextCoins);
    setOpenedRewards([]);
    setMessage(`Sold ${duplicateCounts.total} duplicate card${duplicateCounts.total === 1 ? '' : 's'} for ${payout} gold.`);
  };

  const selectBoardSkin = (skin: BoardSkin) => {
    if (ownedBoardSkins.includes(skin.id)) {
      localStorage.setItem('player_equipped_board_skin', skin.id);
      setEquippedBoardSkin(skin.id);
      setMessage(`${skin.name} equipped.`);
      return;
    }
    if (coins < skin.price) {
      setMessage(`You need ${skin.price - coins} more gold.`);
      return;
    }
    const nextOwned = [...ownedBoardSkins, skin.id];
    changePlayerGold(-skin.price);
    setCoins(coins - skin.price);
    setOwnedBoardSkins(nextOwned);
    setEquippedBoardSkin(skin.id);
    localStorage.setItem('player_owned_board_skins', JSON.stringify(nextOwned));
    localStorage.setItem('player_equipped_board_skin', skin.id);
    setMessage(`${skin.name} purchased and equipped.`);
  };

  const selectCardSkin = (skin: CardSkin) => {
    if (ownedCardSkins.includes(skin.id)) {
      localStorage.setItem('player_equipped_card_skin', skin.id);
      setEquippedCardSkin(skin.id);
      setMessage(`${skin.name} equipped.`);
      return;
    }
    if (coins < skin.price) {
      setMessage(`You need ${skin.price - coins} more gold.`);
      return;
    }
    const nextOwned = [...ownedCardSkins, skin.id];
    changePlayerGold(-skin.price);
    setCoins(coins - skin.price);
    setOwnedCardSkins(nextOwned);
    setEquippedCardSkin(skin.id);
    localStorage.setItem('player_owned_card_skins', JSON.stringify(nextOwned));
    localStorage.setItem('player_equipped_card_skin', skin.id);
    setMessage(`${skin.name} purchased and equipped.`);
  };

  const title = activeTab === 'boosters'
    ? 'BOOSTER SHOP'
    : activeTab === 'boards'
      ? 'BOARD SKINS'
      : 'CARD SKINS';
  const subtitle = activeTab === 'boosters'
    ? 'SELECT A PACK // CLAIM THE UNKNOWN'
    : 'BUY ONCE // EQUIP ANY TIME';
  const boardSkinsOnPage = BOARD_SKINS.slice(
    skinPage * BOARD_SKINS_PER_PAGE,
    (skinPage + 1) * BOARD_SKINS_PER_PAGE
  );
  const cardSkinsOnPage = CARD_SKINS.slice(
    skinPage * CARD_SKINS_PER_PAGE,
    (skinPage + 1) * CARD_SKINS_PER_PAGE
  );
  const skinPageCount = Math.ceil(
    activeTab === 'boards'
      ? BOARD_SKINS.length / BOARD_SKINS_PER_PAGE
      : CARD_SKINS.length / CARD_SKINS_PER_PAGE
  );

  const changeTab = (tab: ShopTab) => {
    setActiveTab(tab);
    setSkinPage(0);
    setMessage('');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel} className="shop-terminal-panel">
        <div style={styles.topRail}>
          <span>CATALOG // ONLINE</span>
          <span>SUPPLY NODE 04</span>
        </div>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>{title}</div>
            <div style={styles.subtitle}>{subtitle}</div>
          </div>
          <div style={styles.headerActions}>
            <div style={styles.coins}>◆ {coins.toLocaleString()} GOLD</div>
            <button style={styles.close} onClick={onClose} aria-label="Close shop">×</button>
          </div>
        </div>

        <div style={styles.tabs}>
          {SHOP_TABS.map(({ id, label }) => (
            <button
              key={id}
              style={{ ...styles.tab, ...(activeTab === id ? styles.activeTab : {}) }}
              onClick={() => changeTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'boosters' && (
          <>
            <div style={styles.packGrid}>
              {PACKS.map((pack) => (
            <div key={pack.id} className="shop-pack-card" style={{ ...styles.pack, borderColor: pack.color }}>
              <div style={{ ...styles.packCode, color: pack.color }}>
                {pack.id === 'basic' ? 'PACK_01' : 'PACK_02'}
              </div>
              <div style={styles.packImageStage}>
                <div style={{ ...styles.packGlow, background: pack.color }} />
                <img
                  src={pack.image}
                  alt={pack.name}
                  className="shop-pack-image"
                  style={{
                    ...styles.packImage,
                    filter: pack.id === 'epic'
                      ? 'drop-shadow(0 0 8px #a855f7)'
                      : 'drop-shadow(0 0 8px #06b6d4)',
                  }}
                />
              </div>
              <div style={{ ...styles.packName, color: pack.color }}>{pack.name.toUpperCase()}</div>
              <div style={styles.description}>{pack.cardCount} MIXED CARD REWARDS</div>
              <button
                className="shop-action-button"
                style={{
                  ...styles.buy,
                  borderColor: coins >= pack.price ? pack.color : '#475569',
                  color: coins >= pack.price ? '#ffffff' : '#94a3b8',
                }}
                onClick={() => buyPack(pack)}
              >
                BUY // {pack.price} GOLD
              </button>
            </div>
              ))}
            </div>

            <button
              className="shop-action-button"
              style={{
                ...styles.sell,
                borderColor: duplicateCounts.total > 0 ? '#ffbb00' : '#475569',
                color: duplicateCounts.total > 0 ? '#ffbb00' : '#94a3b8',
              }}
              onClick={sellDuplicates}
            >
              SELL DUPLICATES // {duplicateCounts.cats} CAT × 10 + {duplicateCounts.deck} DECK × 5
            </button>
          </>
        )}

        {activeTab === 'boards' && (
          <div style={styles.skinGrid}>
            {boardSkinsOnPage.map((skin) => {
              const owned = ownedBoardSkins.includes(skin.id);
              const equipped = equippedBoardSkin === skin.id;
              return (
                <div key={skin.id} className="shop-pack-card" style={styles.skinCard}>
                  <img src={skin.image} alt={skin.name} style={styles.boardPreview} />
                  <div style={styles.skinName}>{skin.name.toUpperCase()}</div>
                  <div style={styles.skinStatus}>{equipped ? 'EQUIPPED' : owned ? 'OWNED' : `${skin.price} GOLD`}</div>
                  <button
                    className="shop-action-button"
                    style={{ ...styles.skinButton, borderColor: equipped ? '#39ff14' : '#00ffee' }}
                    onClick={() => selectBoardSkin(skin)}
                    disabled={equipped}
                  >
                    {equipped ? 'ACTIVE' : owned ? 'EQUIP' : `BUY // ${skin.price}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'cards' && (
          <div style={{ ...styles.skinGrid, ...styles.cardSkinGrid }}>
            {cardSkinsOnPage.map((skin) => {
              const owned = ownedCardSkins.includes(skin.id);
              const equipped = equippedCardSkin === skin.id;
              return (
                <div key={skin.id} className="shop-pack-card" style={{ ...styles.skinCard, ...styles.cardSkinCard }}>
                  <div
                    style={{
                      ...styles.cardPreview,
                      backgroundImage: `url('${skin.image}')`,
                      backgroundPosition: `${-(skin.frame ?? 0) * 59}px 0`,
                    }}
                    aria-label={skin.name}
                  />
                  <div style={styles.skinName}>{skin.name.toUpperCase()}</div>
                  <div style={styles.skinStatus}>{equipped ? 'EQUIPPED' : owned ? 'OWNED' : `${skin.price} GOLD`}</div>
                  <button
                    className="shop-action-button"
                    style={{ ...styles.skinButton, ...styles.cardSkinButton, borderColor: equipped ? '#39ff14' : '#ff00ff' }}
                    onClick={() => selectCardSkin(skin)}
                    disabled={equipped}
                  >
                    {equipped ? 'ACTIVE' : owned ? 'EQUIP' : `BUY // ${skin.price}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab !== 'boosters' && (
          <div style={styles.pagination}>
            <button
              className="shop-action-button"
              style={styles.pageButton}
              onClick={() => setSkinPage((page) => Math.max(0, page - 1))}
              disabled={skinPage === 0}
            >
              BACK
            </button>
            <span style={styles.pageNumber}>PAGE {skinPage + 1} / {skinPageCount}</span>
            <button
              className="shop-action-button"
              style={styles.pageButton}
              onClick={() => setSkinPage((page) => Math.min(skinPageCount - 1, page + 1))}
              disabled={skinPage >= skinPageCount - 1}
            >
              NEXT PAGE
            </button>
          </div>
        )}

        {message && <div style={styles.message}><span style={styles.prompt}>&gt;</span> {message}</div>}
      </div>

      {openingPack && (
        <div style={styles.packOpeningOverlay}>
          <div style={styles.packOpeningStage} className={packRevealed ? 'shop-pack-stage-revealed' : ''}>
            {!packRevealed ? (
              <button
                style={styles.openPackButton}
                className="shop-pack-to-open"
                onClick={() => {
                  setPackRevealed(true);
                }}
                aria-label={`Open ${openingPack.name}`}
              >
                <div style={styles.openingPrompt}>CLICK PACK TO OPEN</div>
                <img
                  src={openingPack.image}
                  alt={openingPack.name}
                  style={{
                    ...styles.openingPackImage,
                    filter: openingPack.id === 'epic'
                      ? 'drop-shadow(0 0 20px #a855f7)'
                      : 'drop-shadow(0 0 20px #06b6d4)',
                  }}
                />
                <div style={{ ...styles.openingPackName, color: openingPack.color }}>
                  {openingPack.name.toUpperCase()}
                </div>
              </button>
            ) : (
              <>
                <div style={styles.burstCenter}>
                  {Array.from({ length: 24 }, (_, index) => (
                    <span key={index} className="shop-pack-particle" />
                  ))}
                </div>
                <div style={styles.revealTitle}>PACK OPENED!</div>
                <div style={styles.pickInstruction}>CHOOSE ONE REWARD</div>
                {selectedRewardIndex === null ? (
                  <div style={styles.revealedCards}>
                    {openedRewards.map((reward, index) => (
                    <button
                      type="button"
                      key={`${reward.kind}-${index}`}
                      style={{
                        ...styles.revealedReward,
                        ...(selectedRewardIndex === index ? styles.selectedReward : {}),
                      }}
                      className="shop-revealed-reward"
                      onClick={() => setSelectedRewardIndex(index)}
                      aria-pressed={selectedRewardIndex === index}
                    >
                      {renderRewardArt(reward)}
                      <div style={styles.rewardName}>{rewardName(reward)}</div>
                    </button>
                    ))}
                  </div>
                ) : (() => {
                  const reward = openedRewards[selectedRewardIndex];
                  if (!reward) return null;
                  const previousIndex = (selectedRewardIndex - 1 + openedRewards.length) % openedRewards.length;
                  const nextIndex = (selectedRewardIndex + 1) % openedRewards.length;
                  return (
                    <div style={styles.rewardDetail}>
                      <button
                        type="button"
                        style={styles.detailClose}
                        onClick={() => setSelectedRewardIndex(null)}
                        aria-label="Return to all cards"
                      >
                        ×
                      </button>
                      <button
                        type="button"
                        style={{ ...styles.detailArrow, left: 10 }}
                        onClick={() => setSelectedRewardIndex(previousIndex)}
                        aria-label="Previous card"
                      >
                        ‹
                      </button>
                      <div style={styles.detailCardArea}>
                        <div style={styles.detailArtFrame}>
                          {renderRewardArt(reward, true)}
                        </div>
                        <div style={styles.detailRewardName}>{rewardName(reward).toUpperCase()}</div>
                        <div style={styles.detailDescription}>{rewardDescription(reward)}</div>
                        <button className="shop-action-button" style={styles.claimButton} onClick={claimPack}>
                          CLAIM THIS CARD
                        </button>
                      </div>
                      <button
                        type="button"
                        style={{ ...styles.detailArrow, right: 10 }}
                        onClick={() => setSelectedRewardIndex(nextIndex)}
                        aria-label="Next card"
                      >
                        ›
                      </button>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 12000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    backgroundColor: 'rgba(2, 4, 14, 0.94)',
    backgroundImage: "linear-gradient(rgba(2,4,14,0.82), rgba(2,4,14,0.92)), url('cards/booster-bg.png')",
    backgroundRepeat: 'repeat',
    imageRendering: 'pixelated' as const,
    pointerEvents: 'auto' as const,
    touchAction: 'none' as const,
  },
  panel: {
    position: 'relative' as const,
    width: 'min(94vw, 600px)',
    maxHeight: '92vh',
    overflow: 'hidden' as const,
    padding: '0 16px 16px',
    border: '3px solid #00ffee',
    borderRadius: 0,
    background: 'rgba(5, 8, 18, 0.98)',
    boxShadow: '6px 6px 0 rgba(255, 0, 255, 0.65), -4px -4px 0 rgba(255, 187, 0, 0.5)',
    fontFamily: 'monospace',
    color: '#ffffff',
  },
  topRail: {
    display: 'flex', justifyContent: 'space-between', gap: 12, margin: '0 -16px 14px', padding: '5px 9px',
    background: '#00ffee', color: '#050812', fontSize: '9px', fontWeight: 'bold' as const,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { color: '#ffff00', fontSize: '22px', fontWeight: 'bold' as const, textShadow: '1px 0 rgba(255,0,255,0.55), -1px 0 rgba(0,255,238,0.55)' },
  subtitle: { color: '#94a3b8', fontSize: '9px', marginTop: 5 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  coins: { color: '#ffbb00', fontSize: '12px', padding: '6px 8px', border: '1px solid #ffbb00', background: '#0b1020', whiteSpace: 'nowrap' as const },
  close: {
    width: '30px', height: '30px', border: '2px solid #ff0055', borderRadius: 0,
    background: '#130817', color: '#ff5c93', fontSize: '21px', cursor: 'pointer', fontFamily: 'monospace',
  },
  tabs: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginTop: 14 },
  tab: {
    padding: '8px 4px', border: '1px solid #334155', borderRadius: 0, background: '#090d1a',
    color: '#94a3b8', fontFamily: 'monospace', fontSize: '9px', fontWeight: 'bold' as const, cursor: 'pointer',
  },
  activeTab: { borderColor: '#00ffee', background: '#102033', color: '#00ffee', boxShadow: '2px 2px 0 rgba(255,0,255,0.45)' },
  packGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '16px' },
  pack: {
    position: 'relative' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '6px',
    padding: '10px 8px 9px', border: '2px solid', borderRadius: 0, background: '#090d1a', overflow: 'hidden' as const,
  },
  packCode: { alignSelf: 'stretch', fontSize: '8px', textAlign: 'left' as const, letterSpacing: 1 },
  packImageStage: { position: 'relative' as const, width: 100, height: 126, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  packGlow: { position: 'absolute' as const, width: 54, height: 84, opacity: 0.16, filter: 'blur(14px)' },
  packImage: { position: 'relative' as const, width: '76px', height: '120px', imageRendering: 'pixelated' as const, objectFit: 'contain' as const },
  packName: { fontSize: '13px', fontWeight: 'bold' as const, textAlign: 'center' as const },
  description: { color: '#cbd5e1', fontSize: '9px', textAlign: 'center' as const },
  buy: {
    width: '100%', marginTop: '4px', padding: '9px 6px', border: '2px solid',
    borderRadius: 0, background: '#111827', fontFamily: 'monospace', fontWeight: 'bold' as const, fontSize: '10px', cursor: 'pointer',
  },
  sell: {
    width: '100%', marginTop: '12px', padding: '10px', border: '2px solid',
    borderRadius: 0, background: '#111827', fontFamily: 'monospace', fontWeight: 'bold' as const, fontSize: '10px', cursor: 'pointer',
  },
  message: { marginTop: '12px', padding: '8px 10px', borderLeft: '3px solid #00ffee', background: '#070b16', color: '#fbbf24', fontSize: '10px', textAlign: 'left' as const },
  prompt: { color: '#00ffee', fontWeight: 'bold' as const },
  skinGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 14 },
  cardSkinGrid: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 },
  skinCard: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6,
    padding: 9, border: '2px solid #334155', background: '#090d1a',
  },
  cardSkinCard: { gap: 4, padding: '7px 5px' },
  boardPreview: {
    display: 'block', width: '100%', aspectRatio: '240 / 148', objectFit: 'fill' as const,
    imageRendering: 'pixelated' as const, border: '1px solid #00ffee', background: '#050812',
  },
  cardPreview: {
    width: 59, height: 91,
    backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' as const, transform: 'scale(0.9)', transformOrigin: 'center',
  },
  skinName: { color: '#ffffff', fontSize: '11px', fontWeight: 'bold' as const, textAlign: 'center' as const },
  skinStatus: { color: '#ffbb00', fontSize: '8px' },
  skinButton: {
    width: '100%', padding: '8px 5px', border: '2px solid', borderRadius: 0, background: '#111827',
    color: '#ffffff', fontFamily: 'monospace', fontSize: '9px', fontWeight: 'bold' as const, cursor: 'pointer',
  },
  cardSkinButton: { padding: '6px 3px', fontSize: '8px' },
  pagination: {
    display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginTop: 12,
  },
  pageButton: {
    padding: '8px 5px', border: '2px solid #00ffee', borderRadius: 0, background: '#111827',
    color: '#ffffff', fontFamily: 'monospace', fontSize: '9px', fontWeight: 'bold' as const, cursor: 'pointer',
  },
  pageNumber: { color: '#ffbb00', fontSize: '9px', whiteSpace: 'nowrap' as const },
  packOpeningOverlay: {
    position: 'fixed' as const, inset: 0, zIndex: 13000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 12, background: 'rgba(2, 3, 12, 0.96)', imageRendering: 'pixelated' as const,
  },
  packOpeningStage: {
    position: 'relative' as const, width: 'min(94vw, 620px)', height: 'min(88vh, 500px)', overflow: 'hidden' as const,
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
    border: '3px solid #00ffee', background: "linear-gradient(rgba(4,6,18,0.75), rgba(4,6,18,0.92)), url('cards/booster-bg.png')",
    boxShadow: '7px 7px 0 #ff00ff, -5px -5px 0 rgba(255,187,0,0.75)',
  },
  openPackButton: {
    border: 0, background: 'transparent', color: '#ffffff', fontFamily: 'monospace', cursor: 'pointer',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 12,
  },
  openingPrompt: { color: '#00ffee', fontSize: '14px', fontWeight: 'bold' as const, textShadow: '2px 2px #ff00ff' },
  openingPackImage: { width: 168, height: 308, objectFit: 'contain' as const, imageRendering: 'pixelated' as const },
  openingPackName: { fontSize: '16px', fontWeight: 'bold' as const, textShadow: '2px 2px #050812' },
  burstCenter: { position: 'absolute' as const, left: '50%', top: '43%', width: 1, height: 1, pointerEvents: 'none' as const },
  revealTitle: { color: '#ffff00', fontSize: '24px', fontWeight: 'bold' as const, textShadow: '2px 2px #ff00ff', marginBottom: 5 },
  pickInstruction: { color: '#00ffee', fontSize: '10px', fontWeight: 'bold' as const, marginBottom: 16 },
  revealedCards: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 4, width: '100%', padding: '0 4px' },
  revealedReward: {
    width: 56, minHeight: 108, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2,
    padding: '5px 2px', border: '2px solid transparent', borderRadius: 0, background: 'rgba(9, 13, 26, 0.78)', cursor: 'pointer',
  },
  selectedReward: { borderColor: '#ffff00', background: 'rgba(255, 0, 255, 0.2)', boxShadow: '0 0 12px #ff00ff' },
  rewardCardArt: {
    position: 'relative' as const, width: 59, height: 91, flex: '0 0 auto', overflow: 'hidden' as const,
    backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' as const,
    boxShadow: '0 0 0 2px #ffffff, 4px 4px 0 rgba(0,0,0,0.75)', transform: 'scale(0.84)', margin: '-7px -4px',
  },
  rewardEffectOverlay: {
    position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'fill' as const,
    imageRendering: 'pixelated' as const, pointerEvents: 'none' as const,
  },
  rewardHoloOverlay: { opacity: 0.62, mixBlendMode: 'screen' as const },
  holoCardArt: { boxShadow: '0 0 0 2px #67e8f9, 0 0 14px #ff00ff, 4px 4px 0 rgba(0,0,0,0.75)' },
  rewardName: { color: '#ffffff', fontSize: '8px', lineHeight: 1.1, textAlign: 'center' as const, textShadow: '1px 1px #000000' },
  rewardDetail: {
    position: 'relative' as const, width: 'min(92%, 430px)', minHeight: 330, display: 'flex', alignItems: 'center',
    justifyContent: 'center', border: '2px solid #ff00ff', background: 'rgba(5, 8, 18, 0.97)',
    boxShadow: '5px 5px 0 #ffbb00', padding: '12px 52px',
  },
  detailClose: {
    position: 'absolute' as const, top: 7, right: 8, width: 30, height: 30, border: '2px solid #ff0055',
    background: '#160817', color: '#ffffff', fontFamily: 'monospace', fontSize: '22px', cursor: 'pointer', zIndex: 2,
  },
  detailArrow: {
    position: 'absolute' as const, top: '50%', transform: 'translateY(-50%)', width: 38, height: 58,
    border: '2px solid #00ffee', background: '#0b1020', color: '#ffff00', fontFamily: 'monospace',
    fontSize: '34px', lineHeight: 1, cursor: 'pointer',
  },
  detailCardArea: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', width: '100%', gap: 7,
  },
  detailArtFrame: {
    width: 112, height: 164, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  detailCardArt: { transform: 'scale(1.72)', margin: 0 },
  detailRewardName: {
    color: '#ffff00', fontSize: '15px', fontWeight: 'bold' as const, textAlign: 'center' as const,
    textShadow: '2px 2px #ff00ff',
  },
  detailDescription: {
    minHeight: 34, maxWidth: 330, color: '#ffffff', fontSize: '11px', lineHeight: 1.35,
    textAlign: 'center' as const,
  },
  claimButton: {
    width: 190, marginTop: 5, padding: '11px 10px', border: '3px solid #00ffee', borderRadius: 0,
    background: '#ff0055', color: '#ffffff', fontFamily: 'monospace', fontSize: '15px', fontWeight: 'bold' as const, cursor: 'pointer',
    boxShadow: '5px 5px 0 #ffbb00',
  },
};
