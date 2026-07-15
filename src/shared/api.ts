export type InitResponse = {
  type: "init";
  postId: string;
  count?: number;
  username: string;
};

export type IncrementResponse = {
  type: "increment";
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: "decrement";
  postId: string;
  count: number;
};

export type LeaderboardEntry = {
  member: string;
  score: number;
};

export type LeaderboardResponse = {
  status: 'success';
  leaderboard: LeaderboardEntry[];
  userRank: number | null;
  userBest: number | null;
  username?: string;
};
