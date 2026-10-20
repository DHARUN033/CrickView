import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  CreateTournamentSchema,
  CreateTeamSchema,
  CreatePlayerSchema,
  CreateMatchSchema,
  TossSchema,
  MatchSquadSchema,
  UserRole,
} from "@crickview/shared";

export const coreRouter = Router();

// ==========================================
// TOURNAMENTS
// ==========================================

// GET /api/v1/tournaments
coreRouter.get("/tournaments", async (req: Request, res: Response): Promise<void> => {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { teams: true, matches: true } },
      },
    });
    res.json({ tournaments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/tournaments (Admin only)
coreRouter.post(
  "/tournaments",
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CreateTournamentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }
      const tournament = await prisma.tournament.create({
        data: parsed.data as any,
      });
      res.status(201).json({ tournament });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/v1/tournaments/:id
coreRouter.get("/tournaments/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        teams: {
          include: {
            team: true,
          },
        },
        matches: {
          include: {
            teamA: true,
            teamB: true,
            tossWinner: true,
          },
          orderBy: { scheduledAt: "asc" },
        },
      },
    });
    if (!tournament) {
      res.status(404).json({ error: "Tournament not found" });
      return;
    }
    res.json({ tournament });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/tournaments/:id/teams (Register team to tournament)
coreRouter.post(
  "/tournaments/:id/teams",
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { teamId } = req.body;
      if (!teamId) {
        res.status(400).json({ error: "teamId is required" });
        return;
      }
      const registration = await prisma.tournamentTeam.create({
        data: {
          tournamentId: req.params.id,
          teamId,
        },
        include: { team: true },
      });
      res.status(201).json({ registration });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==========================================
// TEAMS
// ==========================================

// GET /api/v1/teams
coreRouter.get("/teams", async (req: Request, res: Response): Promise<void> => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { players: true, homeMatches: true, awayMatches: true } },
      },
    });
    res.json({ teams });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/teams (Admin only)
coreRouter.post(
  "/teams",
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CreateTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }
      const team = await prisma.team.create({
        data: parsed.data,
      });
      res.status(201).json({ team });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/v1/teams/:id
coreRouter.get("/teams/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        players: {
          include: { player: true },
        },
        tournaments: {
          include: { tournament: true },
        },
      },
    });
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json({ team });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/teams/:id/players (Assign player to team)
coreRouter.post(
  "/teams/:id/players",
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { playerId, season, jerseyNo } = req.body;
      const teamPlayer = await prisma.teamPlayer.create({
        data: {
          teamId: req.params.id,
          playerId,
          season: season || "2026",
          jerseyNo: jerseyNo ? parseInt(jerseyNo, 10) : undefined,
        },
        include: { player: true },
      });
      res.status(201).json({ teamPlayer });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ==========================================
// PLAYERS
// ==========================================

// GET /api/v1/players
coreRouter.get("/players", async (req: Request, res: Response): Promise<void> => {
  try {
    const players = await prisma.player.findMany({
      orderBy: { name: "asc" },
      include: {
        teams: {
          include: { team: true },
        },
      },
    });
    res.json({ players });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/players (Admin or authorized)
coreRouter.post(
  "/players",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, displayName, photoUrl, primaryRole, battingStyle, bowlingStyle } = req.body;
      if (!name) {
        res.status(400).json({ error: "Player name is required" });
        return;
      }

      // Auto-generate uniquePlayerCode: e.g. PLY-8A4F
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const uniquePlayerCode = `PLY-${Date.now().toString().slice(-4)}${randomSuffix}`;

      const player = await prisma.player.create({
        data: {
          name: name.trim(),
          displayName: (displayName || name.trim().split(" ")[0]).trim(),
          uniquePlayerCode,
          photoUrl: photoUrl || null,
          primaryRole: primaryRole || "BATTER",
          battingStyle: battingStyle || "RIGHT_HAND",
          bowlingStyle: bowlingStyle || "NONE",
        },
      });
      res.status(201).json({ player });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// PUT /api/v1/players/:id (Update Player Record)
coreRouter.put("/players/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, displayName, photoUrl, primaryRole, battingStyle, bowlingStyle } = req.body;
    const player = await prisma.player.update({
      where: { id: req.params.id },
      data: {
        name: name ? name.trim() : undefined,
        displayName: displayName ? displayName.trim() : undefined,
        photoUrl: photoUrl !== undefined ? photoUrl : undefined,
        primaryRole: primaryRole || undefined,
        battingStyle: battingStyle || undefined,
        bowlingStyle: bowlingStyle || undefined,
      },
    });
    res.json({ player });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/players/:id
coreRouter.get("/players/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: {
        teams: { include: { team: true } },
        strikerDeliveries: {
          take: 50,
          orderBy: { createdAt: "desc" },
        },
        bowlerDeliveries: {
          take: 50,
          orderBy: { createdAt: "desc" },
        },
        dismissals: true,
        assistedWickets: true,
      },
    });
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }
    res.json({ player });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MATCHES
// ==========================================

// GET /api/v1/matches
coreRouter.get("/matches", async (req: Request, res: Response): Promise<void> => {
  try {
    const { tournamentId, status } = req.query;
    const where: any = {};
    if (tournamentId) where.tournamentId = String(tournamentId);
    if (status) where.status = String(status);

    const matches = await prisma.match.findMany({
      where,
      include: {
        tournament: true,
        teamA: true,
        teamB: true,
        tossWinner: true,
        scorer: { select: { id: true, name: true } },
        innings: {
          orderBy: { inningsNumber: "asc" },
        },
      },
      orderBy: { scheduledAt: "desc" },
    });
    res.json({ matches });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/matches (Admin only)
coreRouter.post(
  "/matches",
  authenticate,
  authorizeRoles(UserRole.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CreateMatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }
      const match = await prisma.match.create({
        data: parsed.data as any,
        include: {
          teamA: true,
          teamB: true,
          tournament: true,
        },
      });
      res.status(201).json({ match });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /api/v1/matches/:id
coreRouter.get("/matches/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        tournament: true,
        teamA: true,
        teamB: true,
        tossWinner: true,
        scorer: { select: { id: true, name: true } },
        playerOfTheMatch: true,
        squads: {
          include: {
            team: true,
            players: {
              include: { player: true },
            },
          },
        },
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
    res.json({ match });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/matches/:id/toss
coreRouter.post(
  "/matches/:id/toss",
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SCORER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = TossSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }
      const { tossWinnerId, decision } = parsed.data;
      const match = await prisma.match.update({
        where: { id: req.params.id },
        data: {
          tossWinnerId,
          tossDecision: decision as any,
          status: "IN_PROGRESS",
        },
      });
      res.json({ match });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/v1/matches/:id/squad
coreRouter.post(
  "/matches/:id/squad",
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SCORER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = MatchSquadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }
      const { teamId, playingXI, captainId, keeperId } = parsed.data;
      const matchId = req.params.id;

      // Upsert squad
      const squad = await prisma.matchSquad.upsert({
        where: {
          matchId_teamId: { matchId, teamId },
        },
        create: {
          matchId,
          teamId,
          captainId,
          keeperId,
        },
        update: {
          captainId,
          keeperId,
        },
      });

      // Clear previous players and insert new playing XI
      await prisma.matchSquadPlayer.deleteMany({
        where: { matchSquadId: squad.id },
      });

      await prisma.matchSquadPlayer.createMany({
        data: playingXI.map((playerId, idx) => ({
          matchSquadId: squad.id,
          playerId,
          isPlayingXI: true,
          battingOrder: idx + 1,
        })),
      });

      res.status(201).json({ squad });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);
