import { describe, it, expect } from "vitest";
import { CricketScoringEngine, InningsState } from "../scoringEngine.js";
import { ExtraType, DismissalType } from "@crickview/shared";

describe("CricketScoringEngine", () => {
  const strikerId = "batter-1";
  const nonStrikerId = "batter-2";
  const newBatterId = "batter-3";
  const bowlerId = "bowler-1";

  const getInitialState = (): InningsState => ({
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
    currentStrikerId: strikerId,
    currentNonStrikerId: nonStrikerId,
    currentBowlerId: bowlerId,
    isOverComplete: false,
    isInningsComplete: false,
    batters: {},
    bowlers: {},
    deliveries: [],
  });

  it("scores a dot ball correctly", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: false,
      },
      20
    );

    expect(s1.totalRuns).toBe(0);
    expect(s1.legalBalls).toBe(1);
    expect(s1.oversStr).toBe("0.1");
    expect(s1.batters[strikerId].runs).toBe(0);
    expect(s1.batters[strikerId].ballsFaced).toBe(1);
    expect(s1.bowlers[bowlerId].runsConceded).toBe(0);
    expect(s1.bowlers[bowlerId].dots).toBe(1);
    // Strike should NOT rotate on 0 runs
    expect(s1.currentStrikerId).toBe(strikerId);
  });

  it("scores a single and rotates strike", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 1,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: false,
      },
      20
    );

    expect(s1.totalRuns).toBe(1);
    expect(s1.legalBalls).toBe(1);
    expect(s1.batters[strikerId].runs).toBe(1);
    expect(s1.currentStrikerId).toBe(nonStrikerId);
    expect(s1.currentNonStrikerId).toBe(strikerId);
  });

  it("handles wides: does not count as legal ball, batter faces no ball, bowler conceded 1 run", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.WIDE,
        extraRuns: 1,
        isWicket: false,
      },
      20
    );

    expect(s1.totalRuns).toBe(1);
    expect(s1.wides).toBe(1);
    expect(s1.legalBalls).toBe(0);
    expect(s1.oversStr).toBe("0.0");
    expect(s1.batters[strikerId]?.ballsFaced || 0).toBe(0);
    expect(s1.bowlers[bowlerId].runsConceded).toBe(1);
    expect(s1.bowlers[bowlerId].wides).toBe(1);
    // Strike stays with same striker
    expect(s1.currentStrikerId).toBe(strikerId);
  });

  it("handles No-Balls: does not count as legal ball, batter faces ball, bowler conceded run", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 4,
        extraType: ExtraType.NO_BALL,
        extraRuns: 1,
        isWicket: false,
      },
      20
    );

    expect(s1.totalRuns).toBe(5); // 4 + 1
    expect(s1.noBalls).toBe(1);
    expect(s1.legalBalls).toBe(0);
    expect(s1.batters[strikerId].runs).toBe(4);
    expect(s1.batters[strikerId].ballsFaced).toBe(1);
    expect(s1.bowlers[bowlerId].runsConceded).toBe(5);
  });

  it("handles byes and leg-byes: legal ball counted, NOT charged to bowler nor credited to batter", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.BYE,
        extraRuns: 2,
        isWicket: false,
      },
      20
    );

    expect(s1.totalRuns).toBe(2);
    expect(s1.byes).toBe(2);
    expect(s1.legalBalls).toBe(1);
    expect(s1.batters[strikerId].runs).toBe(0);
    expect(s1.batters[strikerId].ballsFaced).toBe(1);
    expect(s1.bowlers[bowlerId].runsConceded).toBe(0);
    expect(s1.bowlers[bowlerId].legalBalls).toBe(1);
  });

  it("records bowled dismissal: increments bowler wickets and brings in new batter", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: true,
        wicket: {
          dismissalType: DismissalType.BOWLED,
          playerOutId: strikerId,
          isBowlerCredited: true,
          newBatterId,
        },
      },
      20
    );

    expect(s1.wickets).toBe(1);
    expect(s1.bowlers[bowlerId].wickets).toBe(1);
    expect(s1.batters[strikerId].isOut).toBe(true);
    expect(s1.currentStrikerId).toBe(newBatterId);
  });

  it("records run out: credited to team wickets but NOT credited to bowler", () => {
    const s0 = getInitialState();
    const s1 = CricketScoringEngine.applyDelivery(
      s0,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 1,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: true,
        wicket: {
          dismissalType: DismissalType.RUN_OUT,
          playerOutId: nonStrikerId,
          assistedById: "fielder-1",
          isBowlerCredited: false,
          newBatterId,
        },
      },
      20
    );

    expect(s1.wickets).toBe(1);
    expect(s1.bowlers[bowlerId].wickets).toBe(0); // Bowler not credited!
    expect(s1.batters[nonStrikerId].isOut).toBe(true);
  });

  it("rotates strike at end of over (6 legal balls)", () => {
    let state = getInitialState();
    for (let i = 0; i < 5; i++) {
      state = CricketScoringEngine.applyDelivery(
        state,
        {
          inningsId: "inn-1",
          bowlerId,
          strikerId: state.currentStrikerId,
          nonStrikerId: state.currentNonStrikerId,
          batterRuns: 0,
          extraType: ExtraType.NONE,
          extraRuns: 0,
          isWicket: false,
        },
        20
      );
    }
    expect(state.legalBalls).toBe(5);
    expect(state.currentStrikerId).toBe(strikerId);
    expect(state.isOverComplete).toBe(false);

    // 6th ball (legal dot) completes over -> strike swaps
    state = CricketScoringEngine.applyDelivery(
      state,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId: state.currentStrikerId,
        nonStrikerId: state.currentNonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: false,
      },
      20
    );

    expect(state.legalBalls).toBe(6);
    expect(state.oversStr).toBe("1.0");
    expect(state.isOverComplete).toBe(true);
    expect(state.currentStrikerId).toBe(nonStrikerId);
    expect(state.currentNonStrikerId).toBe(strikerId);
  });

  it("completes innings when overs limit or max wickets is reached", () => {
    let state = getInitialState();
    // Simulate 2 wickets reaching maxWickets = 2
    state = CricketScoringEngine.applyDelivery(
      state,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: true,
        wicket: {
          dismissalType: DismissalType.BOWLED,
          playerOutId: strikerId,
          isBowlerCredited: true,
          newBatterId,
        },
      },
      20,
      2 // maxWickets = 2
    );
    expect(state.isInningsComplete).toBe(false);

    state = CricketScoringEngine.applyDelivery(
      state,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId: state.currentStrikerId,
        nonStrikerId: state.currentNonStrikerId,
        batterRuns: 0,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: true,
        wicket: {
          dismissalType: DismissalType.BOWLED,
          playerOutId: state.currentStrikerId,
          isBowlerCredited: true,
        },
      },
      20,
      2 // maxWickets = 2
    );

    expect(state.wickets).toBe(2);
    expect(state.isInningsComplete).toBe(true);
  });

  it("completes innings when target is chased down", () => {
    let state = getInitialState();
    const target = 10;
    state = CricketScoringEngine.applyDelivery(
      state,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId,
        nonStrikerId,
        batterRuns: 6,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: false,
      },
      20,
      10,
      target
    );
    expect(state.isInningsComplete).toBe(false);

    state = CricketScoringEngine.applyDelivery(
      state,
      {
        inningsId: "inn-1",
        bowlerId,
        strikerId: state.currentStrikerId,
        nonStrikerId: state.currentNonStrikerId,
        batterRuns: 4,
        extraType: ExtraType.NONE,
        extraRuns: 0,
        isWicket: false,
      },
      20,
      10,
      target
    );

    expect(state.totalRuns).toBe(10);
    expect(state.isInningsComplete).toBe(true);
  });
});
