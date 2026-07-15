import { useMemo, useState } from 'react';
import { COMPANION_CATS, type CompanionCat } from '../scenes/cardBattle/companionCats';
import { getCatCardFrameByIndex } from '../scenes/cardBattle/catCardFrames';

type CardTrophyViewProps = {
  onClose: () => void;
};

type CatFrame = {
  image: string;
  frame: number;
  columns: number;
  rows: number;
};

type DeckCard = {
  suit: 'water' | 'leaf' | 'sakura' | 'ghost';
  rank: number;
};
type DeckUpgrade = { holographic: boolean; seals: string[] };

const DECK_SUITS: DeckCard['suit'][] = ['water', 'leaf', 'sakura', 'ghost'];
const DECK_CARDS: DeckCard[] = DECK_SUITS.flatMap((suit) =>
  Array.from({ length: 13 }, (_, index) => ({ suit, rank: index + 2 })),
);

const getFrame = (index: number): CatFrame => getCatCardFrameByIndex(index);

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

const readStringList = (key: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

function HoloOverlay() {
  return <img src="cards/holo-cards.gif" alt="Holographic" style={styles.holoOverlay} />;
}

function CatCardSprite({ index, locked, holographic = false, maxWidth = 59 }: { index: number; locked: boolean; holographic?: boolean; maxWidth?: number }) {
  const frame = getFrame(index);
  const column = frame.frame % frame.columns;
  const row = Math.floor(frame.frame / frame.columns);
  return (
    <div style={{
      width: '100%',
      position: 'relative',
      maxWidth,
      aspectRatio: '59 / 91',
      flexShrink: 0,
      borderRadius: 0,
      backgroundImage: `url('${frame.image}')`,
      backgroundSize: `${frame.columns * 100}% ${frame.rows * 100}%`,
      backgroundPosition: `${frame.columns > 1 ? column / (frame.columns - 1) * 100 : 0}% ${frame.rows > 1 ? row / (frame.rows - 1) * 100 : 0}%`,
      imageRendering: 'pixelated',
      filter: locked ? 'brightness(0) opacity(0.28)' : 'none',
      boxShadow: locked ? 'inset 0 0 0 1px #111827' : '3px 3px 0 rgba(0, 255, 238, 0.24)',
    }}>{holographic && !locked && <HoloOverlay />}</div>
  );
}

function DeckCardSprite({ card, holographic = false, seals = [], maxWidth = 59 }: { card: DeckCard; holographic?: boolean; seals?: string[]; maxWidth?: number }) {
  const column = card.rank - 2;
  const row = DECK_SUITS.indexOf(card.suit);
  return (
    <div style={{
      width: '100%',
      position: 'relative',
      maxWidth,
      aspectRatio: '59 / 91',
      flexShrink: 0,
      borderRadius: 0,
      backgroundImage: "url('cards/deck-cards.png')",
      backgroundSize: '1300% 400%',
      backgroundPosition: `${column / 12 * 100}% ${row / 3 * 100}%`,
      imageRendering: 'pixelated',
      boxShadow: '3px 3px 0 rgba(250, 204, 21, 0.22)',
    }}>
      {seals.map((seal) => {
        const image = { gold: 'gold-seal.png', red: 'mult-seal.png', purple: 'nips-seal.png' }[seal];
        return image ? <img key={seal} src={`cards/${image}`} alt={`${seal} seal`} style={styles.sealOverlay} /> : null;
      })}
      {holographic && <HoloOverlay />}
    </div>
  );
}

const readDeckUpgrades = (): Map<string, DeckUpgrade> => {
  const upgrades = new Map<string, DeckUpgrade>();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('player_card_deck') ?? '[]');
    if (!Array.isArray(parsed)) return upgrades;
    parsed.forEach((value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
      const suit = 'suit' in value && typeof value.suit === 'string' ? value.suit : 'family' in value ? value.family : null;
      const rank = 'rank' in value && typeof value.rank === 'number' ? value.rank : 'number' in value ? value.number : null;
      if (typeof suit !== 'string' || typeof rank !== 'number') return;
      const key = `${suit}-${rank}`;
      const previous = upgrades.get(key) ?? { holographic: false, seals: [] };
      const seals = 'seals' in value && Array.isArray(value.seals)
        ? value.seals.filter((seal: unknown): seal is string => typeof seal === 'string')
        : [];
      upgrades.set(key, {
        holographic: previous.holographic || ('holographic' in value && value.holographic === true),
        seals: [...new Set([...previous.seals, ...seals])],
      });
    });
  } catch {
    return upgrades;
  }
  return upgrades;
};

export function CardTrophyView({ onClose }: CardTrophyViewProps) {
  const [ownedCats] = useState(readOwnedCats);
  const [holographicCats] = useState(() => new Set(readStringList('player_holographic_companion_cats')));
  const [holographicDeck] = useState(() => new Set(readStringList('player_holographic_deck_cards')));
  const [deckUpgrades] = useState(readDeckUpgrades);
  const [selectedCat, setSelectedCat] = useState<CompanionCat | null>(null);
  const [view, setView] = useState<'cat' | 'deck'>('cat');
  const [page, setPage] = useState(0);
  const cats = Object.values(COMPANION_CATS);
  const cardsPerPage = window.innerWidth <= 480 ? 12 : 21;
  const activeCardCount = view === 'cat' ? cats.length : DECK_CARDS.length;
  const pageCount = Math.ceil(activeCardCount / cardsPerPage);
  const visibleCats = cats.slice(page * cardsPerPage, (page + 1) * cardsPerPage);
  const visibleDeckCards = DECK_CARDS.slice(page * cardsPerPage, (page + 1) * cardsPerPage);
  const counts = useMemo(() => {
    const next = new Map<string, number>();
    ownedCats.forEach((id) => next.set(id, (next.get(id) ?? 0) + 1));
    return next;
  }, [ownedCats]);
  const uniqueOwned = cats.filter((cat) => counts.has(cat.id)).length;
  const completion = Math.round(uniqueOwned / cats.length * 100);

  return (
    <div style={styles.overlay}>
      <div style={styles.casePanel} className="trophy-terminal-panel">
      <div style={styles.topRail}>
        <span>COLLECTION ARCHIVE // ONLINE</span>
        <span>VAULT NODE 03</span>
      </div>
      <div style={styles.header} className="trophy-case-header">
        <div className="trophy-title-block">
          <div style={styles.eyebrow}>PERSONAL ARCHIVE</div>
          <div style={styles.title}>CARD TROPHY CASE</div>
          <div style={styles.progressLabel}>
            {view === 'cat' ? `COLLECTED: ${uniqueOwned} / ${cats.length} (${completion}%)` : `DEFAULT DECK: ${DECK_CARDS.length} / ${DECK_CARDS.length}`}
          </div>
        </div>
        <div style={styles.viewToggle} className="trophy-view-toggle">
          <button className="trophy-control" style={{ ...styles.toggleButton, ...(view === 'cat' ? styles.toggleActive : {}) }} onClick={() => { setView('cat'); setPage(0); }}>CAT CARDS</button>
          <button className="trophy-control" style={{ ...styles.toggleButton, ...(view === 'deck' ? styles.toggleActive : {}) }} onClick={() => { setView('deck'); setPage(0); }}>DECK</button>
        </div>
        <div style={styles.headerActions} className="trophy-header-actions">
          <button className="trophy-control" style={styles.pageButton} onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>‹</button>
          <span style={styles.pageLabel}>{page + 1} / {pageCount}</span>
          <button className="trophy-control" style={styles.pageButton} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page === pageCount - 1}>›</button>
          <button className="trophy-control trophy-close" style={styles.close} onClick={onClose} aria-label="Close trophy case">×</button>
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${view === 'cat' ? completion : 100}%` }} />
        </div>
      </div>

      <div style={styles.grid} className="trophy-card-grid">
        {view === 'cat' && visibleCats.map((cat, visibleIndex) => {
          const index = page * cardsPerPage + visibleIndex;
          const count = counts.get(cat.id) ?? 0;
          const owned = count > 0;
          return (
            <button
              key={cat.id}
              className="trophy-card-slot"
              style={{ ...styles.cardButton, borderColor: owned ? '#00ffee' : '#263247' }}
              onClick={() => owned && setSelectedCat(cat)}
              disabled={!owned}
            >
              {count > 1 && <span style={styles.count}>×{count}</span>}
              <CatCardSprite index={index} locked={!owned} holographic={holographicCats.has(cat.id)} />
              <span style={{ ...styles.cardName, color: owned ? '#a5f3fc' : '#475569' }}>
                {owned ? cat.name : '???'}
              </span>
            </button>
          );
        })}
        {view === 'deck' && visibleDeckCards.map((card) => {
          const rankName = card.rank === 11 ? 'Tabby' : card.rank === 12 ? 'Orange' : card.rank === 13 ? 'White' : card.rank === 14 ? 'Void' : String(card.rank);
          return (
            <div key={`${card.suit}-${card.rank}`} className="trophy-card-slot" style={{ ...styles.cardButton, borderColor: '#eab308' }}>
              <DeckCardSprite
                card={card}
                holographic={holographicDeck.has(`${card.suit}-${card.rank}`) || (deckUpgrades.get(`${card.suit}-${card.rank}`)?.holographic ?? false)}
                seals={deckUpgrades.get(`${card.suit}-${card.rank}`)?.seals ?? []}
              />
              <span style={{ ...styles.cardName, color: '#fde68a' }}>{card.suit.toUpperCase()} {rankName}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.bottomRail}>
        <span>{view === 'cat' ? 'CATALOG // COMPANIONS' : 'CATALOG // STANDARD DECK'}</span>
        <span>{String(activeCardCount).padStart(2, '0')} ARCHIVE SLOTS</span>
      </div>
      </div>

      {selectedCat && (
        <div style={styles.detailBackdrop} onClick={() => setSelectedCat(null)}>
          <div style={styles.detail} className="trophy-detail-panel" onClick={(event) => event.stopPropagation()}>
            <CatCardSprite index={cats.findIndex((cat) => cat.id === selectedCat.id)} locked={false} holographic={holographicCats.has(selectedCat.id)} maxWidth={118} />
            <div style={styles.detailName}>{selectedCat.name.toUpperCase()}</div>
            <div style={styles.description}>{selectedCat.description}</div>
            <div style={styles.ownedCount}>OWNED: {counts.get(selectedCat.id) ?? 0}</div>
            <button className="trophy-control" style={styles.detailClose} onClick={() => setSelectedCat(null)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  holoOverlay: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    borderRadius: 'inherit',
    opacity: 0.62,
    mixBlendMode: 'screen' as const,
    pointerEvents: 'none' as const,
  },
  sealOverlay: {
    position: 'absolute' as const, inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' as const,
    pointerEvents: 'none' as const,
  },
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 12000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(2,4,14,0.94)',
    backgroundImage: "linear-gradient(rgba(2,4,14,0.82), rgba(2,4,14,0.94)), url('cards/booster-bg.png')",
    color: '#ffffff',
    fontFamily: 'monospace',
    imageRendering: 'pixelated' as const,
    pointerEvents: 'auto' as const,
    touchAction: 'none' as const,
  },
  casePanel: {
    position: 'relative' as const,
    width: 'min(96vw, 760px)',
    height: 'min(92vh, 610px)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    padding: '0 12px 9px',
    border: '3px solid #00ffee',
    borderRadius: 0,
    background: 'rgba(5,8,18,0.98)',
    boxShadow: '7px 7px 0 rgba(255,0,255,0.72), -5px -5px 0 rgba(255,187,0,0.62)',
  },
  topRail: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    margin: '0 -12px 10px',
    padding: '5px 9px',
    background: '#00ffee',
    color: '#050812',
    fontSize: '8px',
    fontWeight: 'bold' as const,
  },
  header: {
    position: 'relative' as const,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: 12,
    alignItems: 'center',
    padding: '4px 2px 17px',
    borderBottom: '1px solid #1e3a5f',
    background: '#070b16',
  },
  eyebrow: { color: '#ff00ff', fontSize: '7px', letterSpacing: 1, marginBottom: 2 },
  title: {
    color: '#ffff00',
    fontSize: 'clamp(14px, 3vw, 21px)',
    fontWeight: 'bold' as const,
    textShadow: '1px 0 #ff00ff, -1px 0 #00ffee',
  },
  progressLabel: { marginTop: 3, color: '#94a3b8', fontSize: '8px', fontWeight: 'bold' as const },
  close: {
    width: 34,
    height: 34,
    border: '2px solid #ff0055',
    borderRadius: 0,
    background: '#130817',
    color: '#ff5c93',
    fontSize: 22,
    cursor: 'pointer',
  },
  viewToggle: {
    display: 'flex',
    gap: 4,
  },
  toggleButton: {
    minWidth: 58,
    height: 32,
    padding: '0 10px',
    border: '1px solid #334155',
    borderRadius: 0,
    background: '#090d1a',
    color: '#94a3b8',
    fontFamily: 'inherit',
    fontSize: 10,
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  toggleActive: { borderColor: '#00ffee', background: '#102033', color: '#00ffee', boxShadow: '3px 3px 0 rgba(255,0,255,0.42)' },
  headerActions: { display: 'flex', alignItems: 'center', gap: 6 },
  pageButton: {
    width: 32,
    height: 32,
    border: '1px solid #00ffee',
    borderRadius: 0,
    background: '#090d1a',
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
  },
  pageLabel: { minWidth: 36, color: '#ffbb00', fontSize: 9, fontWeight: 'bold' as const, textAlign: 'center' as const },
  progressTrack: {
    position: 'absolute' as const,
    left: 2,
    right: 2,
    bottom: 5,
    height: 4,
    overflow: 'hidden',
    background: '#263247',
  },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #ff00ff, #00ffee, #ffff00)' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
    flex: 1,
    minHeight: 0,
    gap: 'clamp(4px, 1vw, 8px)',
    padding: '10px 2px 7px',
    overflow: 'hidden',
  },
  cardButton: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    justifyContent: 'center',
    padding: '4px',
    border: '1.5px solid',
    borderRadius: 0,
    background: '#090d1a',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  count: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    zIndex: 1,
    padding: '2px 4px',
    borderRadius: 0,
    background: '#ff00ff',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold' as const,
  },
  cardName: {
    width: '100%',
    overflow: 'hidden',
    fontSize: 9,
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  detailBackdrop: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(2,4,14,0.94)',
  },
  detail: {
    width: 'min(88vw, 340px)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 11,
    padding: 22,
    border: '2px solid #00ffee',
    borderRadius: 0,
    background: '#070b16',
    boxShadow: '6px 6px 0 #ff00ff, -4px -4px 0 #ffbb00',
  },
  detailName: { color: '#ffff00', fontSize: 18, fontWeight: 'bold' as const, textAlign: 'center' as const },
  description: { color: '#e2e8f0', fontSize: 12, lineHeight: 1.5, textAlign: 'center' as const },
  ownedCount: { color: '#67e8f9', fontSize: 11, fontWeight: 'bold' as const },
  detailClose: {
    padding: '9px 24px',
    border: '2px solid #ffffff',
    borderRadius: 0,
    background: '#111827',
    color: '#ffffff',
    fontFamily: 'inherit',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  bottomRail: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '6px 4px 0',
    borderTop: '1px solid #1e3a5f',
    color: '#475569',
    fontSize: '7px',
  },
};
