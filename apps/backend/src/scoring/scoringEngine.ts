import {
  ExtraType,
  DismissalType,
  formatOvers,
  calculateRunRate,
  calculateStrikeRate,
  calculateEconomyRate,
} from "@crickview/shared";

export interface DeliveryInput {
  inningsId: string;
  bowlerId: string;
  strikerId: string;
  nonStrikerId: string;
  batterRuns: number;
  extraType: (typeof ExtraType)[keyof typeof ExtraType];
  extraRuns: number;
  isWicket: boolean;
  wicket?: {
    dismissalType: (typeof DismissalType)[keyof typeof DismissalType];
    playerOutId: string;
    assistedById?: string | null;
    isBowlerCredited: boolean;
    newBatterId?: string | null;
  } | null;
  commentary?: string | null;
  idempotencyKey?: string | null;
}

export interface BatterScorecard {
  playerId: string;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissalType?: string;
  dismissalText?: string;
  bowlerId?: string;
  fielderId?: string;
}

export interface BowlerScorecard {
  playerId: string;
  legalBalls: number;
  overs: string;
  maidens: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
  economyRate: number;
  dots: number;
}

export interface InningsState {
  totalRuns: number;
  wickets: number;
  legalBalls: number;
  oversStr: string;
  runRate: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalties: number;
  totalExtras: number;
  currentStrikerId: string;
  currentNonStrikerId: string;
  currentBowlerId: string;
  isOverComplete: boolean;
  isInningsComplete: boolean;
  batters: Record<string, BatterScorecard>;
  bowlers: Record<string, BowlerScorecard>;
  deliveries: ProcessedDelivery[];
}

export interface ProcessedDelivery {
  sequenceNumber: number;
  overNumber: number;
  ballInOver: number;
  isLegal: boolean;
  bowlerId: string;
  strikerId: string;
  nonStrikerId: string;
  batterRuns: number;
  extraType: string;
  extraRuns: number;
  totalRuns: number;
  runsConceded: number;
  isWicket: boolean;
  wicket?: {
    dismissalType: string;
    playerOutId: string;
    assistedById?: string | null;
    isBowlerCredited: boolean;
    newBatterId?: string | null;
  } | null;
  commentary?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Pure Domain Engine for Cricket Scoring.
 * Strictly adheres to MCC Laws of Cricket:
 * - Wides & No-Balls are illegal deliveries (do NOT increment legal balls or ball in over).
 * - Wides: Ball not faced by batter (balls faced does not increment).
 * - No-Balls: Batter can score off bat (balls faced DOES increment).
 * - Byes & Leg Byes: Count as legal deliveries, but runs NOT credited to batter nor charged to bowler.
 * - Bowler Wicket Credit: Bowled, Caught, LBW, Stumped, Hit Wicket.
 *   NOT credited: Run Out, Retired Hurt/Out, Obstructing the field, Timed out.
 * - Strike Rotation: Odd runs rotate strike. At over completion (6 legal balls), strike rotates again.
 */
export class CricketScoringEngine {
  /**
   * Determine if a delivery is legally counted towards the over.
   */
  public static isLegalDelivery(extraType: string): boolean {
    return extraType !== ExtraType.WIDE && extraType !== ExtraType.NO_BALL;
  }

  /**
   * Calculate runs conceded by the bowler for this delivery.
   * Byes and Leg Byes are NOT conceded by the bowler.
   * Wides and No-balls (and their extra penalty) ARE conceded by the bowler,
   * plus any runs scored off the bat from a No-ball.
   */
  public static calculateRunsConceded(
    batterRuns: number,
    extraType: string,
    extraRuns: number
  ): number {
    if (extraType === ExtraType.BYE || extraType === ExtraType.LEG_BYE) {
      return 0; // Bowler is not charged for byes or leg byes
    }
    if (extraType === ExtraType.PENALTY) {
      return 0; // Penalty runs are not charged to bowler
    }
    return batterRuns + extraRuns;
  }

  /**
   * Process a single delivery against the current state and return the next immutable state.
   */
  public static applyDelivery(
    prevState: InningsState,
    input: DeliveryInput,
    oversLimit: number,
    maxWickets: number = 10,
    targetRuns?: number | null
  ): InningsState {
    if (prevState.isInningsComplete) {
      throw new Error("Cannot add delivery: Innings is already completed");
    }

    const isLegal = this.isLegalDelivery(input.extraType);
    const totalDeliveryRuns = input.batterRuns + input.extraRuns;
    const runsConceded = this.calculateRunsConceded(
      input.batterRuns,
      input.extraType,
      input.extraRuns
    );

    // Sequence calculation
    const sequenceNumber = prevState.deliveries.length + 1;
    const nextLegalBalls = isLegal ? prevState.legalBalls + 1 : prevState.legalBalls;
    
    // 0-indexed over number and 1..6 legal ball in over
    const overNumber = Math.floor(prevState.legalBalls / 6);
    const ballInOver = isLegal ? (prevState.legalBalls % 6) + 1 : (prevState.legalBalls % 6);

    // Extras categorization
    let wides = prevState.wides;
    let noBalls = prevState.noBalls;
    let byes = prevState.byes;
    let legByes = prevState.legByes;
    let penalties = prevState.penalties;

    if (input.extraType === ExtraType.WIDE) wides += input.extraRuns;
    else if (input.extraType === ExtraType.NO_BALL) noBalls += input.extraRuns;
    else if (input.extraType === ExtraType.BYE) byes += input.extraRuns;
    else if (input.extraType === ExtraType.LEG_BYE) legByes += input.extraRuns;
    else if (input.extraType === ExtraType.PENALTY) penalties += input.extraRuns;

    const totalExtras = wides + noBalls + byes + legByes + penalties;
    const nextTotalRuns = prevState.totalRuns + totalDeliveryRuns;

    // Batter Statistics updates
    const nextBatters = { ...prevState.batters };
    const striker = nextBatters[input.strikerId] || {
      playerId: input.strikerId,
      runs: 0,
      ballsFaced: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
      isOut: false,
    };

    // Batter only faces ball if it's NOT a wide
    const ballFacedIncrement = input.extraType !== ExtraType.WIDE ? 1 : 0;
    const newBatterRuns = striker.runs + input.batterRuns;
    const newBallsFaced = striker.ballsFaced + ballFacedIncrement;
    const newFours = striker.fours + (input.batterRuns === 4 ? 1 : 0);
    const newSixes = striker.sixes + (input.batterRuns === 6 ? 1 : 0);

    nextBatters[input.strikerId] = {
      ...striker,
      runs: newBatterRuns,
      ballsFaced: newBallsFaced,
      fours: newFours,
      sixes: newSixes,
      strikeRate: calculateStrikeRate(newBatterRuns, newBallsFaced),
    };

    // Bowler Statistics updates
    const nextBowlers = { ...prevState.bowlers };
    const bowler = nextBowlers[input.bowlerId] || {
      playerId: input.bowlerId,
      legalBalls: 0,
      overs: "0.0",
      maidens: 0,
      runsConceded: 0,
      wickets: 0,
      wides: 0,
      noBalls: 0,
      economyRate: 0,
      dots: 0,
    };

    const newBowlerLegalBalls = bowler.legalBalls + (isLegal ? 1 : 0);
    const newBowlerRunsConceded = bowler.runsConceded + runsConceded;
    const newBowlerWides = bowler.wides + (input.extraType === ExtraType.WIDE ? input.extraRuns : 0);
    const newBowlerNoBalls =
      bowler.noBalls + (input.extraType === ExtraType.NO_BALL ? 1 : 0);
    const isDotBall = isLegal && totalDeliveryRuns === 0 && !input.isWicket;
    const newDots = bowler.dots + (isDotBall ? 1 : 0);

    let nextWicketsCount = prevState.wickets;
    let newBowlerWickets = bowler.wickets;

    if (input.isWicket && input.wicket) {
      nextWicketsCount += 1;
      if (input.wicket.isBowlerCredited) {
        newBowlerWickets += 1;
      }

      // Mark the dismissed batter
      const outBatterId = input.wicket.playerOutId;
      const dismissedBatter = nextBatters[outBatterId] || {
        playerId: outBatterId,
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        isOut: false,
      };

      let dismissalText = input.wicket.dismissalType;
      if (input.wicket.dismissalType === DismissalType.CAUGHT && input.wicket.assistedById) {
        dismissalText = `c & b`;
      }

      nextBatters[outBatterId] = {
        ...dismissedBatter,
        isOut: true,
        dismissalType: input.wicket.dismissalType,
        dismissalText,
        bowlerId: input.wicket.isBowlerCredited ? input.bowlerId : undefined,
        fielderId: input.wicket.assistedById || undefined,
      };
    }

    nextBowlers[input.bowlerId] = {
      ...bowler,
      legalBalls: newBowlerLegalBalls,
      overs: formatOvers(newBowlerLegalBalls),
      runsConceded: newBowlerRunsConceded,
      wickets: newBowlerWickets,
      wides: newBowlerWides,
      noBalls: newBowlerNoBalls,
      dots: newDots,
      economyRate: calculateEconomyRate(newBowlerRunsConceded, newBowlerLegalBalls),
    };

    // Strike Rotation Logic:
    // Physical runs completed:
    // - If batterRuns is odd (1, 3, 5), strike rotates.
    // - If run out occurs, verify who got out and who takes strike.
    let nextStrikerId = input.strikerId;
    let nextNonStrikerId = input.nonStrikerId;

    // Handle wicket replacement
    if (input.isWicket && input.wicket && input.wicket.newBatterId) {
      if (input.wicket.playerOutId === input.strikerId) {
        nextStrikerId = input.wicket.newBatterId;
      } else if (input.wicket.playerOutId === input.nonStrikerId) {
        nextNonStrikerId = input.wicket.newBatterId;
      }
    }

    // Strike change based on runs completed
    const physicalRuns =
      input.extraType === ExtraType.BYE || input.extraType === ExtraType.LEG_BYE
        ? input.extraRuns
        : input.batterRuns;

    if (physicalRuns % 2 === 1) {
      const temp = nextStrikerId;
      nextStrikerId = nextNonStrikerId;
      nextNonStrikerId = temp;
    }

    // Check Over Completion (6 legal balls in current over)
    const isOverComplete = isLegal && nextLegalBalls > 0 && nextLegalBalls % 6 === 0;

    if (isOverComplete) {
      // Over change: End of over rotates strike
      const temp = nextStrikerId;
      nextStrikerId = nextNonStrikerId;
      nextNonStrikerId = temp;
    }

    // Check Innings Completion
    // 1. All out (maxWickets reached)
    // 2. Overs limit completed
    // 3. Target runs achieved in 2nd innings
    const maxLegalBalls = oversLimit * 6;
    let isInningsComplete = false;

    if (nextWicketsCount >= maxWickets) {
      isInningsComplete = true;
    } else if (nextLegalBalls >= maxLegalBalls) {
      isInningsComplete = true;
    } else if (targetRuns && nextTotalRuns >= targetRuns) {
      isInningsComplete = true;
    }

    const processedDelivery: ProcessedDelivery = {
      sequenceNumber,
      overNumber,
      ballInOver,
      isLegal,
      bowlerId: input.bowlerId,
      strikerId: input.strikerId,
      nonStrikerId: input.nonStrikerId,
      batterRuns: input.batterRuns,
      extraType: input.extraType,
      extraRuns: input.extraRuns,
      totalRuns: totalDeliveryRuns,
      runsConceded,
      isWicket: input.isWicket,
      wicket: input.wicket,
      commentary: input.commentary,
      idempotencyKey: input.idempotencyKey,
    };

    return {
      totalRuns: nextTotalRuns,
      wickets: nextWicketsCount,
      legalBalls: nextLegalBalls,
      oversStr: formatOvers(nextLegalBalls),
      runRate: calculateRunRate(nextTotalRuns, nextLegalBalls),
      wides,
      noBalls,
      byes,
      legByes,
      penalties,
      totalExtras,
      currentStrikerId: nextStrikerId,
      currentNonStrikerId: nextNonStrikerId,
      currentBowlerId: input.bowlerId,
      isOverComplete,
      isInningsComplete,
      batters: nextBatters,
      bowlers: nextBowlers,
      deliveries: [...prevState.deliveries, processedDelivery],
    };
  }

  /**
   * Recompute entire innings state from raw delivery sequence.
   * Guarantees 100% determinism, consistency, and auditability during corrections.
   */
  public static recalculateInnings(
    deliveries: DeliveryInput[],
    initialStrikerId: string,
    initialNonStrikerId: string,
    initialBowlerId: string,
    oversLimit: number,
    maxWickets: number = 10,
    targetRuns?: number | null
  ): InningsState {
    let state: InningsState = {
      totalRuns: 0,
      wickets: 0,
      legalBalls: 0,
      oversStr: "0.0",
      runRate: 0,
      wides: 0,
      noBalls: 0,
      byes: 0,
      legByes: 0,
      penalties: 0,
      totalExtras: 0,
      currentStrikerId: initialStrikerId,
      currentNonStrikerId: initialNonStrikerId,
      currentBowlerId: initialBowlerId,
      isOverComplete: false,
      isInningsComplete: false,
      batters: {},
      bowlers: {},
      deliveries: [],
    };

    for (const d of deliveries) {
      state = this.applyDelivery(state, d, oversLimit, maxWickets, targetRuns);
    }

    return state;
  }
}
