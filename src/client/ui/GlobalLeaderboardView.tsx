import { useEffect, useState } from 'react';
import { getLevelProgress } from '../playerProgress';

type Entry = { rank: number; username: string; score: number };
type LeaderboardData = {
  status: string;
  wins?: Entry[];
  xp?: Entry[];
  cats?: Entry[];
};

type Board = 'wins' | 'xp' | 'cats';

const BOARD_TABS: { id: Board; code: string; label: string }[] = [
  { id: 'wins', code: '01', label: 'MOST WINS' },
  { id: 'xp', code: '02', label: 'HIGHEST LEVEL' },
  { id: 'cats', code: '03', label: 'CAT COLLECTOR' },
];

const rankColor = (rank: number): string => {
  if (rank === 1) return '#ffff00';
  if (rank === 2) return '#00ffee';
  if (rank === 3) return '#ff00ff';
  return '#64748b';
};

export function GlobalLeaderboardView({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<Board>('wins');
  const [data, setData] = useState<LeaderboardData | null>(null);

  useEffect(() => {
    fetch('/api/global-leaderboards')
      .then((response) => response.json())
      .then((response: LeaderboardData) => setData(response))
      .catch(() => setData({ status: 'error' }));
  }, []);

  const entries = data?.[board] ?? [];
  const valueLabel = board === 'wins' ? 'WINS' : board === 'cats' ? 'CATS' : 'LEVEL / XP';

  return (
    <div style={styles.overlay}>
      <div style={styles.panel} className="leaderboard-terminal-panel">
        <div style={styles.topRail}>
          <span>GALACTIC RECORDS // LIVE</span>
          <span>CAT-OS RANK NODE</span>
        </div>

        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>SEASON // ALL TIME</div>
            <div style={styles.title}>GLOBAL LEADERBOARD</div>
          </div>
          <button className="leaderboard-close" style={styles.close} onClick={onClose} aria-label="Close leaderboard">×</button>
        </div>

        <div style={styles.tabs}>
          {BOARD_TABS.map(({ id, code, label }) => (
            <button
              key={id}
              className="leaderboard-tab"
              style={{ ...styles.tab, ...(board === id ? styles.activeTab : {}) }}
              onClick={() => setBoard(id)}
            >
              <span style={styles.tabCode}>{code}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div style={styles.boardStatus}>
          <span>RANKED PILOTS</span>
          <span style={styles.statusLight}>● SIGNAL ONLINE</span>
        </div>
        <div style={styles.columnHeader}><span>RANK // PLAYER</span><span>{valueLabel}</span></div>

        <div style={styles.list}>
          {!data && <div style={styles.empty}>LOADING...</div>}
          {data?.status === 'error' && <div style={styles.empty}>FAILED TO LOAD</div>}
          {data?.status === 'success' && entries.length === 0 && <div style={styles.empty}>NO SCORES YET</div>}
          {entries.map((entry) => (
            <div
              key={`${board}-${entry.username}`}
              className="leaderboard-row"
              style={{ ...styles.row, borderLeftColor: rankColor(entry.rank) }}
            >
              <div style={styles.playerCell}>
                <span style={{ ...styles.rank, color: rankColor(entry.rank), borderColor: rankColor(entry.rank) }}>
                  {String(entry.rank).padStart(2, '0')}
                </span>
                <div style={styles.playerName}>{entry.username}</div>
              </div>
              <div style={styles.valueCell}>
                <span style={styles.score}>
                  {board === 'xp'
                    ? `LV ${getLevelProgress(entry.score).level} · ${entry.score.toLocaleString()} XP`
                    : entry.score.toLocaleString()}
                </span>
                <span style={styles.valueCaption}>{valueLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.footerRail}>
          <span>TOP PILOTS UPDATE LIVE</span>
          <span>{entries.length.toString().padStart(2, '0')} RECORDS</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 13000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: 'rgba(2,4,14,0.94)',
    backgroundImage: "linear-gradient(rgba(2,4,14,0.82), rgba(2,4,14,0.94)), url('cards/booster-bg.png')",
    imageRendering: 'pixelated' as const,
    pointerEvents: 'auto' as const,
    touchAction: 'none' as const,
  },
  panel: {
    position: 'relative' as const,
    width: 'min(94vw, 620px)',
    maxHeight: '90vh',
    overflow: 'hidden' as const,
    padding: '0 16px 14px',
    border: '3px solid #00ffee',
    borderRadius: 0,
    background: 'rgba(5,8,18,0.98)',
    boxShadow: '7px 7px 0 rgba(255,0,255,0.72), -5px -5px 0 rgba(255,187,0,0.62)',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  topRail: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    margin: '0 -16px 14px',
    padding: '5px 9px',
    background: '#00ffee',
    color: '#050812',
    fontSize: '8px',
    fontWeight: 'bold' as const,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#ff00ff', fontSize: '8px', letterSpacing: 1, marginBottom: 3 },
  title: {
    color: '#ffff00',
    fontSize: '23px',
    fontWeight: 'bold' as const,
    textShadow: '1px 0 #ff00ff, -1px 0 #00ffee',
  },
  close: {
    width: 32,
    height: 32,
    border: '2px solid #ff0055',
    borderRadius: 0,
    background: '#130817',
    color: '#ff5c93',
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  tabs: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginTop: 15 },
  tab: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '9px 4px',
    border: '1px solid #334155',
    borderRadius: 0,
    background: '#090d1a',
    color: '#94a3b8',
    fontFamily: 'monospace',
    fontSize: '9px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  activeTab: {
    borderColor: '#00ffee',
    background: '#102033',
    color: '#ffffff',
    boxShadow: '3px 3px 0 rgba(255,0,255,0.48)',
  },
  tabCode: { color: '#ffbb00', fontSize: '8px' },
  boardStatus: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    padding: '6px 9px',
    borderLeft: '3px solid #ff00ff',
    background: '#070b16',
    color: '#cbd5e1',
    fontSize: '8px',
  },
  statusLight: { color: '#39ff14' },
  columnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 9px 5px',
    color: '#64748b',
    fontSize: '8px',
  },
  list: {
    maxHeight: '48vh',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    paddingRight: 3,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 54,
    padding: '7px 9px',
    border: '1px solid #25344d',
    borderLeft: '4px solid',
    borderRadius: 0,
    background: '#0b1220',
    fontSize: '11px',
  },
  playerCell: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  rank: {
    width: 31,
    height: 31,
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid',
    background: '#050812',
    fontSize: '13px',
    fontWeight: 'bold' as const,
  },
  playerName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 'bold' as const,
  },
  valueCell: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 2, flex: '0 0 auto' },
  score: { color: '#ffbb00', textAlign: 'right' as const, fontSize: '12px', fontWeight: 'bold' as const },
  valueCaption: { color: '#64748b', fontSize: '7px' },
  empty: {
    padding: 35,
    border: '1px dashed #334155',
    textAlign: 'center' as const,
    color: '#94a3b8',
    fontSize: '10px',
  },
  footerRail: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
    paddingTop: 7,
    borderTop: '1px solid #1e3a5f',
    color: '#475569',
    fontSize: '7px',
  },
};
