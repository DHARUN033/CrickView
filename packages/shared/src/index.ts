import { z } from "zod";

// Roles
export const UserRole = {
  ADMIN: "ADMIN",
  SCORER: "SCORER",
  VIEWER: "VIEWER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// Match Format
export const MatchFormat = {
  T20: "T20",
  ODI: "ODI",
  CUSTOM: "CUSTOM",
} as const;
export type MatchFormat = (typeof MatchFormat)[keyof typeof MatchFormat];

// Match Status
export const MatchStatus = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  ABANDONED: "ABANDONED",
  NO_RESULT: "NO_RESULT",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

// Toss Decision
export const TossDecision = {
  BAT: "BAT",
  BOWL: "BOWL",
} as const;
export type TossDecision = (typeof TossDecision)[keyof typeof TossDecision];

// Innings Status
export const InningsStatus = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  DECLARED: "DECLARED",
} as const;
export type InningsStatus = (typeof InningsStatus)[keyof typeof InningsStatus];

// Dismissal Type
export const DismissalType = {
  BOWLED: "BOWLED",
  CAUGHT: "CAUGHT",
  LBW: "LBW",
  RUN_OUT: "RUN_OUT",
  STUMPED: "STUMPED",
  HIT_WICKET: "HIT_WICKET",
  RETIRED_HURT: "RETIRED_HURT",
  RETIRED_OUT: "RETIRED_OUT",
  OBSTRUCTING_FIELD: "OBSTRUCTING_FIELD",
  TIMED_OUT: "TIMED_OUT",
} as const;
export type DismissalType = (typeof DismissalType)[keyof typeof DismissalType];

// Extra Type
export const ExtraType = {
  NONE: "NONE",
  WIDE: "WIDE",
  NO_BALL: "NO_BALL",
  BYE: "BYE",
  LEG_BYE: "LEG_BYE",
  PENALTY: "PENALTY",
} as const;
export type ExtraType = (typeof ExtraType)[keyof typeof ExtraType];

// Batting & Bowling Styles
export const BattingStyle = {
  RIGHT_HAND: "RIGHT_HAND",
  LEFT_HAND: "LEFT_HAND",
} as const;
export type BattingStyle = (typeof BattingStyle)[keyof typeof BattingStyle];

export const BowlingStyle = {
  RIGHT_ARM_FAST: "RIGHT_ARM_FAST",
  RIGHT_ARM_MEDIUM: "RIGHT_ARM_MEDIUM",
  RIGHT_ARM_SPIN: "RIGHT_ARM_SPIN",
  LEFT_ARM_FAST: "LEFT_ARM_FAST",
  LEFT_ARM_MEDIUM: "LEFT_ARM_MEDIUM",
  LEFT_ARM_SPIN: "LEFT_ARM_SPIN",
  NONE: "NONE",
} as const;
export type BowlingStyle = (typeof BowlingStyle)[keyof typeof BowlingStyle];

// Player Role
export const PlayerRole = {
  BATTER: "BATTER",
  BOWLER: "BOWLER",
  ALL_ROUNDER: "ALL_ROUNDER",
  WICKET_KEEPER: "WICKET_KEEPER",
} as const;
export type PlayerRole = (typeof PlayerRole)[keyof typeof PlayerRole];

// Schemas & DTOs
export const RecordDeliverySchema = z.object({
  inningsId: z.string().uuid(),
  bowlerId: z.string().uuid(),
  strikerId: z.string().uuid(),
  nonStrikerId: z.string().uuid(),
  batterRuns: z.number().int().min(0).max(6),
  extraType: z.enum([
    ExtraType.NONE,
    ExtraType.WIDE,
    ExtraType.NO_BALL,
    ExtraType.BYE,
    ExtraType.LEG_BYE,
    ExtraType.PENALTY,
  ]),
  extraRuns: z.number().int().min(0).default(0),
  isWicket: z.boolean().default(false),
  wicket: z
    .object({
      dismissalType: z.enum([
        DismissalType.BOWLED,
        DismissalType.CAUGHT,
        DismissalType.LBW,
        DismissalType.RUN_OUT,
        DismissalType.STUMPED,
        DismissalType.HIT_WICKET,
        DismissalType.RETIRED_HURT,
        DismissalType.RETIRED_OUT,
        DismissalType.OBSTRUCTING_FIELD,
        DismissalType.TIMED_OUT,
      ]),
      playerOutId: z.string().uuid(),
      assistedById: z.string().uuid().optional().nullable(),
      isBowlerCredited: z.boolean().default(true),
      newBatterId: z.string().uuid().optional().nullable(),
    })
    .optional()
    .nullable(),
  commentary: z.string().optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
});

export type RecordDeliveryDTO = z.infer<typeof RecordDeliverySchema>;

export const CorrectDeliverySchema = z.object({
  reason: z.string().min(3),
  delivery: RecordDeliverySchema,
});

export type CorrectDeliveryDTO = z.infer<typeof CorrectDeliverySchema>;

export const CreateTournamentSchema = z.object({
  name: z.string().min(2).max(100),
  season: z.string().min(1).max(20),
  description: z.string().optional().nullable(),
  format: z.enum([MatchFormat.T20, MatchFormat.ODI, MatchFormat.CUSTOM]),
  defaultOvers: z.number().int().min(1).max(100).default(20),
  maxWickets: z.number().int().min(1).max(11).default(10),
  pointsWin: z.number().int().default(2),
  pointsTie: z.number().int().default(1),
  pointsNoResult: z.number().int().default(1),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  venue: z.string().optional().nullable(),
});

export type CreateTournamentDTO = z.infer<typeof CreateTournamentSchema>;

export const CreateTeamSchema = z.object({
  name: z.string().min(2).max(100),
  shortName: z.string().min(2).max(6).toUpperCase(),
  logoUrl: z.string().url().optional().nullable(),
  description: z.string().optional().nullable(),
});

export type CreateTeamDTO = z.infer<typeof CreateTeamSchema>;

export const CreatePlayerSchema = z.object({
  name: z.string().min(2).max(100),
  displayName: z.string().min(2).max(50),
  photoUrl: z.string().url().optional().nullable(),
  primaryRole: z.enum([
    PlayerRole.BATTER,
    PlayerRole.BOWLER,
    PlayerRole.ALL_ROUNDER,
    PlayerRole.WICKET_KEEPER,
  ]),
  battingStyle: z.enum([BattingStyle.RIGHT_HAND, BattingStyle.LEFT_HAND]),
  bowlingStyle: z.enum([
    BowlingStyle.RIGHT_ARM_FAST,
    BowlingStyle.RIGHT_ARM_MEDIUM,
    BowlingStyle.RIGHT_ARM_SPIN,
    BowlingStyle.LEFT_ARM_FAST,
    BowlingStyle.LEFT_ARM_MEDIUM,
    BowlingStyle.LEFT_ARM_SPIN,
    BowlingStyle.NONE,
  ]),
});

export type CreatePlayerDTO = z.infer<typeof CreatePlayerSchema>;

export const CreateMatchSchema = z.object({
  tournamentId: z.string().uuid(),
  teamAId: z.string().uuid(),
  teamBId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  venue: z.string().min(2),
  oversLimit: z.number().int().min(1).max(100).default(20),
  matchFormat: z.enum([MatchFormat.T20, MatchFormat.ODI, MatchFormat.CUSTOM]),
});

export type CreateMatchDTO = z.infer<typeof CreateMatchSchema>;

export const TossSchema = z.object({
  tossWinnerId: z.string().uuid(),
  decision: z.enum([TossDecision.BAT, TossDecision.BOWL]),
});

export type TossDTO = z.infer<typeof TossSchema>;

export const MatchSquadSchema = z.object({
  teamId: z.string().uuid(),
  playingXI: z.array(z.string().uuid()).min(2).max(11),
  captainId: z.string().uuid(),
  wicketKeeperId: z.string().uuid(),
  benchPlayerIds: z.array(z.string().uuid()).optional(),
});

export type MatchSquadDTO = z.infer<typeof MatchSquadSchema>;

export const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type AuthLoginDTO = z.infer<typeof AuthLoginSchema>;

export const AuthRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum([UserRole.ADMIN, UserRole.SCORER, UserRole.VIEWER]).default(UserRole.VIEWER),
});

export type AuthRegisterDTO = z.infer<typeof AuthRegisterSchema>;

// Utility Helpers
export function formatOvers(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6);
  const balls = legalBalls % 6;
  return `${overs}.${balls}`;
}

export function parseOversToLegalBalls(oversStr: string | number): number {
  if (typeof oversStr === "number") {
    const whole = Math.floor(oversStr);
    const fraction = Math.round((oversStr - whole) * 10);
    return whole * 6 + fraction;
  }
  const parts = oversStr.split(".");
  const overs = parseInt(parts[0], 10) || 0;
  const balls = parseInt(parts[1], 10) || 0;
  return overs * 6 + balls;
}

export function calculateRunRate(runs: number, legalBalls: number): number {
  if (legalBalls === 0) return 0;
  return Number(((runs / legalBalls) * 6).toFixed(2));
}

export function calculateStrikeRate(runs: number, ballsFaced: number): number {
  if (ballsFaced === 0) return 0;
  return Number(((runs / ballsFaced) * 100).toFixed(2));
}

export function calculateEconomyRate(runsConceded: number, legalBallsBowled: number): number {
  if (legalBallsBowled === 0) return 0;
  return Number(((runsConceded / legalBallsBowled) * 6).toFixed(2));
}

export function calculateBowlingAverage(runsConceded: number, wickets: number): number | null {
  if (wickets === 0) return null;
  return Number((runsConceded / wickets).toFixed(2));
}

export function calculateBattingAverage(runs: number, dismissals: number): number | null {
  if (dismissals === 0) return null;
  return Number((runs / dismissals).toFixed(2));
}
