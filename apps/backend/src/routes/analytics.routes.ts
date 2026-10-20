import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import {
  calculateStrikeRate,
  calculateEconomyRate,
  calculateBattingAverage,
  calculateBowlingAverage,
  formatOvers,
} from "@crickview/shared";

export const analyticsRouter = Router();

// GET /api/v1/analytics/dashboard
analyticsRouter.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  try {
    const { tournamentId } = req.query;

    const [
      tournamentsCount,
      teamsCount,
      playersCount,
      matchesTotal,
      matchesCompleted,
      recentMatches,
      upcomingMatches,
    ] = await Promise.all([
      prisma.tournament.count(),
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.match.count({ where: { status: "COMPLETED" } }),
      prisma.match.findMany({
        where: { status: "COMPLETED" },
        take: 5,
        orderBy: { updatedAt: "desc" },
        include: {
          teamA: true,
          teamB: true,
          innings: true,
        },
      }),
      prisma.match.findMany({
        where: { status: "SCHEDULED" },
        take: 5,
        orderBy: { scheduledAt: "asc" },
        include: {
          teamA: true,
          teamB: true,
        },
      }),
    ]);

    res.json({
      summary: {
        tournamentsCount,
        teamsCount,
        playersCount,
        matchesTotal,
        matchesCompleted,
        upcomingMatchesCount: matchesTotal - matchesCompleted,
      },
      recentMatches,
      upcomingMatches,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/leaderboards
analyticsRouter.get("/leaderboards", async (req: Request, res: Response): Promise<void> => {
  try {
    const { tournamentId } = req.query;
    const matchFilter: any = {};
    if (tournamentId) {
      matchFilter.innings = {
        match: { tournamentId: String(tournamentId) },
      };
    }

    // Top Run Scorers aggregation
    const batterDeliveries = await prisma.delivery.findMany({
      where: matchFilter,
      select: {
        strikerId: true,
        batterRuns: true,
        isLegal: true,
        extraType: true,
      },
    });

    const batterStats: Record<string, { runs: number; balls: number; fours: number; sixes: number }> = {};
    for (const d of batterDeliveries) {
      if (!batterStats[d.strikerId]) {
        batterStats[d.strikerId] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
      }
      batterStats[d.strikerId].runs += d.batterRuns;
      if (d.extraType !== "WIDE") batterStats[d.strikerId].balls += 1;
      if (d.batterRuns === 4) batterStats[d.strikerId].fours += 1;
      if (d.batterRuns === 6) batterStats[d.strikerId].sixes += 1;
    }

    // Top Wicket Takers aggregation
    const wickets = await prisma.wicket.findMany({
      where: {
        isBowlerCredited: true,
        delivery: matchFilter,
      },
      include: {
        delivery: { select: { bowlerId: true } },
      },
    });

    const bowlerWickets: Record<string, number> = {};
    for (const w of wickets) {
      const bId = w.delivery.bowlerId;
      bowlerWickets[bId] = (bowlerWickets[bId] || 0) + 1;
    }

    // Fetch players metadata for leaders
    const allPlayerIds = Array.from(
      new Set([...Object.keys(batterStats), ...Object.keys(bowlerWickets)])
    );

    const players = await prisma.player.findMany({
      where: { id: { in: allPlayerIds } },
    });
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const topBatters = Object.entries(batterStats)
      .map(([playerId, s]) => ({
        player: playerMap.get(playerId),
        runs: s.runs,
        balls: s.balls,
        fours: s.fours,
        sixes: s.sixes,
        strikeRate: calculateStrikeRate(s.runs, s.balls),
      }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 10);

    const topBowlers = Object.entries(bowlerWickets)
      .map(([playerId, wicketsCount]) => ({
        player: playerMap.get(playerId),
        wickets: wicketsCount,
      }))
      .sort((a, b) => b.wickets - a.wickets)
      .slice(0, 10);

    res.json({
      topBatters,
      topBowlers,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/tournaments/:id/standings
analyticsRouter.get("/tournaments/:id/standings", async (req: Request, res: Response): Promise<void> => {
  try {
    const tournamentId = req.params.id;
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: { include: { team: true } },
        matches: {
          where: { status: "COMPLETED" },
          include: {
            innings: { orderBy: { inningsNumber: "asc" } },
          },
        },
      },
    });

    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }

    const table: Record<
      string,
      {
        team: any;
        played: number;
        won: number;
        lost: number;
        tied: number;
        noResult: number;
        points: number;
        runsScored: number;
        ballsFaced: number;
        runsConceded: number;
        ballsBowled: number;
        netRunRate: number;
      }
    > = {};

    // Initialize all registered teams
    for (const tt of tournament.teams) {
      table[tt.teamId] = {
        team: tt.team,
        played: 0,
        won: 0,
        lost: 0,
        tied: 0,
        noResult: 0,
        points: 0,
        runsScored: 0,
        ballsFaced: 0,
        runsConceded: 0,
        ballsBowled: 0,
        netRunRate: 0,
      };
    }

    // Process completed matches
    for (const m of tournament.matches) {
      if (!table[m.teamAId] || !table[m.teamBId]) continue;

      table[m.teamAId].played += 1;
      table[m.teamBId].played += 1;

      if (m.winnerTeamId === m.teamAId) {
        table[m.teamAId].won += 1;
        table[m.teamAId].points += tournament.pointsWin;
        table[m.teamBId].lost += 1;
      } else if (m.winnerTeamId === m.teamBId) {
        table[m.teamBId].won += 1;
        table[m.teamBId].points += tournament.pointsWin;
        table[m.teamAId].lost += 1;
      } else if (m.status === "NO_RESULT") {
        table[m.teamAId].noResult += 1;
        table[m.teamBId].noResult += 1;
        table[m.teamAId].points += tournament.pointsNoResult;
        table[m.teamBId].points += tournament.pointsNoResult;
      } else {
        table[m.teamAId].tied += 1;
        table[m.teamBId].tied += 1;
        table[m.teamAId].points += tournament.pointsTie;
        table[m.teamBId].points += tournament.pointsTie;
      }

      // Net Run Rate calculations (NRR = (Runs Scored / Overs Faced) - (Runs Conceded / Overs Bowled))
      if (m.innings.length >= 2) {
        const inn1 = m.innings[0];
        const inn2 = m.innings[1];

        // Team 1 Batting
        if (table[inn1.battingTeamId]) {
          table[inn1.battingTeamId].runsScored += inn1.totalRuns;
          table[inn1.battingTeamId].ballsFaced += inn1.legalBalls;
          table[inn1.battingTeamId].runsConceded += inn2.totalRuns;
          table[inn1.battingTeamId].ballsBowled += inn2.legalBalls;
        }

        // Team 2 Batting
        if (table[inn2.battingTeamId]) {
          table[inn2.battingTeamId].runsScored += inn2.totalRuns;
          table[inn2.battingTeamId].ballsFaced += inn2.legalBalls;
          table[inn2.battingTeamId].runsConceded += inn1.totalRuns;
          table[inn2.battingTeamId].ballsBowled += inn1.legalBalls;
        }
      }
    }

    const standings = Object.values(table).map((row) => {
      const batOvers = row.ballsFaced > 0 ? row.ballsFaced / 6 : 0;
      const bowlOvers = row.ballsBowled > 0 ? row.ballsBowled / 6 : 0;
      const forRate = batOvers > 0 ? row.runsScored / batOvers : 0;
      const againstRate = bowlOvers > 0 ? row.runsConceded / bowlOvers : 0;
      const netRunRate = Number((forRate - againstRate).toFixed(3));
      return {
        ...row,
        netRunRate,
      };
    });

    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.netRunRate !== a.netRunRate) return b.netRunRate - a.netRunRate;
      return b.won - a.won;
    });

    res.json({ standings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/players/:id
analyticsRouter.get("/players/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const playerId = req.params.id;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        teams: { include: { team: true } },
      },
    });

    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    // Batting stats
    const battingDeliveries = await prisma.delivery.findMany({
      where: { strikerId: playerId },
      include: { innings: true },
    });

    const dismissals = await prisma.wicket.count({
      where: { playerOutId: playerId },
    });

    let totalRuns = 0;
    let ballsFaced = 0;
    let fours = 0;
    let sixes = 0;
    const matchScores: Record<string, number> = {};

    for (const d of battingDeliveries) {
      totalRuns += d.batterRuns;
      if (d.extraType !== "WIDE") ballsFaced += 1;
      if (d.batterRuns === 4) fours += 1;
      if (d.batterRuns === 6) sixes += 1;
      matchScores[d.innings.matchId] = (matchScores[d.innings.matchId] || 0) + d.batterRuns;
    }

    const highestScore = Object.values(matchScores).length > 0 ? Math.max(...Object.values(matchScores)) : 0;
    const battingAverage = calculateBattingAverage(totalRuns, dismissals);
    const strikeRate = calculateStrikeRate(totalRuns, ballsFaced);

    // Bowling stats
    const bowlingDeliveries = await prisma.delivery.findMany({
      where: { bowlerId: playerId },
    });

    const wicketsCount = await prisma.wicket.count({
      where: {
        isBowlerCredited: true,
        delivery: { bowlerId: playerId },
      },
    });

    let runsConceded = 0;
    let legalBallsBowled = 0;
    let maidens = 0;
    let dots = 0;

    for (const d of bowlingDeliveries) {
      runsConceded += d.runsConceded;
      if (d.isLegal) legalBallsBowled += 1;
      if (d.isLegal && d.totalRuns === 0 && !d.isWicket) dots += 1;
    }

    const bowlingAverage = calculateBowlingAverage(runsConceded, wicketsCount);
    const economyRate = calculateEconomyRate(runsConceded, legalBallsBowled);

    // Fielding stats
    const catches = await prisma.wicket.count({
      where: { assistedById: playerId, dismissalType: "CAUGHT" },
    });
    const runOuts = await prisma.wicket.count({
      where: { assistedById: playerId, dismissalType: "RUN_OUT" },
    });
    const stumpings = await prisma.wicket.count({
      where: { assistedById: playerId, dismissalType: "STUMPED" },
    });

    res.json({
      player,
      career: {
        batting: {
          innings: Object.keys(matchScores).length,
          runs: totalRuns,
          ballsFaced,
          highestScore,
          battingAverage,
          strikeRate,
          fours,
          sixes,
          dismissals,
        },
        bowling: {
          legalBallsBowled,
          overs: formatOvers(legalBallsBowled),
          runsConceded,
          wickets: wicketsCount,
          bowlingAverage,
          economyRate,
          dots,
        },
        fielding: {
          catches,
          runOuts,
          stumpings,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/analytics/matches/:id/scorecard
analyticsRouter.get("/matches/:id/scorecard", async (req: Request, res: Response): Promise<void> => {
  try {
    const matchId = req.params.id;
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        teamA: true,
        teamB: true,
        playerOfTheMatch: true,
        innings: {
          orderBy: { inningsNumber: "asc" },
          include: {
            deliveries: {
              orderBy: { sequenceNumber: "asc" },
              include: {
                bowler: true,
                striker: true,
                nonStriker: true,
                wicket: {
                  include: {
                    playerOut: true,
                    assistedBy: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!match) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const processedInnings = match.innings.map((inn) => {
      const battingStats: Record<
        string,
        {
          playerId: string;
          name: string;
          runs: number;
          balls: number;
          dots: number;
          singles: number;
          doubles: number;
          triples: number;
          fours: number;
          sixes: number;
          dismissal: string;
          isOut: boolean;
        }
      > = {};

      const bowlingStats: Record<
        string,
        {
          playerId: string;
          name: string;
          legalBalls: number;
          runsConceded: number;
          extras: number;
          wickets: number;
        }
      > = {};

      const fallOfWickets: Array<{
        wicketNumber: number;
        runs: number;
        playerOut: string;
        overFormatted: string;
      }> = [];

      const overGroups: Record<
        number,
        {
          overNumber: number;
          bowlerName: string;
          runs: number;
          balls: string[];
        }
      > = {};

      let cumulativeRuns = 0;
      let wicketsCount = 0;

      for (const d of inn.deliveries) {
        cumulativeRuns += d.totalRuns;

        if (!battingStats[d.strikerId]) {
          battingStats[d.strikerId] = {
            playerId: d.strikerId,
            name: d.striker.name,
            runs: 0,
            balls: 0,
            dots: 0,
            singles: 0,
            doubles: 0,
            triples: 0,
            fours: 0,
            sixes: 0,
            dismissal: "not out",
            isOut: false,
          };
        }
        battingStats[d.strikerId].runs += d.batterRuns;
        if (d.extraType !== "WIDE") battingStats[d.strikerId].balls += 1;
        if (d.batterRuns === 0) battingStats[d.strikerId].dots += 1;
        else if (d.batterRuns === 1) battingStats[d.strikerId].singles += 1;
        else if (d.batterRuns === 2) battingStats[d.strikerId].doubles += 1;
        else if (d.batterRuns === 3) battingStats[d.strikerId].triples += 1;
        else if (d.batterRuns === 4) battingStats[d.strikerId].fours += 1;
        else if (d.batterRuns === 6) battingStats[d.strikerId].sixes += 1;

        if (!bowlingStats[d.bowlerId]) {
          bowlingStats[d.bowlerId] = {
            playerId: d.bowlerId,
            name: d.bowler.name,
            legalBalls: 0,
            runsConceded: 0,
            extras: 0,
            wickets: 0,
          };
        }
        if (d.isLegal) bowlingStats[d.bowlerId].legalBalls += 1;
        bowlingStats[d.bowlerId].runsConceded += d.runsConceded;
        if (d.extraRuns > 0) bowlingStats[d.bowlerId].extras += d.extraRuns;

        if (d.isWicket && d.wicket) {
          wicketsCount += 1;
          const playerOutId = d.wicket.playerOutId;
          const playerOutName = d.wicket.playerOut.name;
          const dismissalText = `${d.wicket.dismissalType} ${
            d.wicket.assistedBy ? "c " + d.wicket.assistedBy.name : ""
          } b ${d.bowler.name}`.trim();

          if (battingStats[playerOutId]) {
            battingStats[playerOutId].isOut = true;
            battingStats[playerOutId].dismissal = dismissalText;
          }

          if (d.wicket.isBowlerCredited) {
            bowlingStats[d.bowlerId].wickets += 1;
          }

          fallOfWickets.push({
            wicketNumber: wicketsCount,
            runs: cumulativeRuns,
            playerOut: playerOutName,
            overFormatted: `${d.overNumber}.${d.ballInOver}`,
          });
        }

        const ovNum = d.overNumber + 1;
        if (!overGroups[ovNum]) {
          overGroups[ovNum] = {
            overNumber: ovNum,
            bowlerName: d.bowler.name,
            runs: 0,
            balls: [],
          };
        }
        overGroups[ovNum].runs += d.totalRuns;

        let ballNotation = `${d.batterRuns}`;
        if (d.isWicket) ballNotation = "W";
        else if (d.extraType === "WIDE") ballNotation = `${d.extraRuns}w`;
        else if (d.extraType === "NO_BALL") ballNotation = `${d.totalRuns}nb`;
        else if (d.batterRuns === 0) ballNotation = "0";

        overGroups[ovNum].balls.push(ballNotation);
      }

      const batting = Object.values(battingStats).map((b) => ({
        ...b,
        strikeRate: calculateStrikeRate(b.runs, b.balls),
      }));

      const bowling = Object.values(bowlingStats).map((bw) => ({
        ...bw,
        oversFormatted: formatOvers(bw.legalBalls),
        economyRate: calculateEconomyRate(bw.runsConceded, bw.legalBalls),
      }));

      return {
        inningsId: inn.id,
        inningsNumber: inn.inningsNumber,
        battingTeamId: inn.battingTeamId,
        bowlingTeamId: inn.bowlingTeamId,
        totalRuns: inn.totalRuns,
        wickets: inn.wickets,
        legalBalls: inn.legalBalls,
        oversFormatted: formatOvers(inn.legalBalls),
        extras: inn.totalExtras,
        wides: inn.wides,
        noBalls: inn.noBalls,
        byes: inn.byes,
        legByes: inn.legByes,
        batting,
        bowling,
        fallOfWickets,
        oversTimeline: Object.values(overGroups),
      };
    });

    res.json({
      match,
      scorecard: {
        matchId: match.id,
        status: match.status,
        resultSummary: match.resultSummary,
        innings: processedInnings,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
