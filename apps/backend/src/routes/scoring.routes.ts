import { Router, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { authenticate, authorizeRoles } from "../middleware/auth.js";
import { CricketScoringEngine, DeliveryInput } from "../scoring/scoringEngine.js";
import {
  RecordDeliverySchema,
  CorrectDeliverySchema,
  UserRole,
  InningsStatus,
  MatchStatus,
} from "@crickview/shared";

export const scoringRouter = Router();

// POST /api/v1/scoring/innings/initialize
scoringRouter.post(
  "/innings/initialize",
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SCORER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { matchId, inningsNumber, battingTeamId, bowlingTeamId, targetRuns } = req.body;
      if (!matchId || !inningsNumber || !battingTeamId || !bowlingTeamId) {
        res.status(400).json({ error: "Missing required parameters for innings setup" });
        return;
      }

      const innings = await prisma.innings.upsert({
        where: {
          matchId_inningsNumber: {
            matchId,
            inningsNumber: parseInt(inningsNumber, 10),
          },
        },
        create: {
          matchId,
          inningsNumber: parseInt(inningsNumber, 10),
          battingTeamId,
          bowlingTeamId,
          targetRuns: targetRuns ? parseInt(targetRuns, 10) : null,
          status: InningsStatus.IN_PROGRESS,
        },
        update: {
          status: InningsStatus.IN_PROGRESS,
          targetRuns: targetRuns ? parseInt(targetRuns, 10) : undefined,
        },
      });

      // Update match status to in progress
      await prisma.match.update({
        where: { id: matchId },
        data: { status: MatchStatus.IN_PROGRESS },
      });

      res.status(201).json({ innings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/v1/scoring/deliveries (Record ball-by-ball delivery)
scoringRouter.post(
  "/deliveries",
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SCORER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = RecordDeliverySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }

      const input = parsed.data;

      // Idempotency check to avoid duplicate deliveries on network retry
      if (input.idempotencyKey) {
        const existing = await prisma.delivery.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { wicket: true },
        });
        if (existing) {
          res.status(200).json({ delivery: existing, message: "Delivery already processed" });
          return;
        }
      }

      // Execute transaction to lock innings & compute sequence
      const result = await prisma.$transaction(async (tx) => {
        const innings = await tx.innings.findUnique({
          where: { id: input.inningsId },
          include: {
            match: true,
            deliveries: {
              orderBy: { sequenceNumber: "asc" },
              include: { wicket: true },
            },
          },
        });

        if (!innings) {
          throw new Error("Innings not found");
        }

        if (innings.status === InningsStatus.COMPLETED) {
          throw new Error("Cannot record delivery: Innings is completed");
        }

        const isLegal = CricketScoringEngine.isLegalDelivery(input.extraType);
        const sequenceNumber = innings.deliveries.length + 1;
        const overNumber = Math.floor(innings.legalBalls / 6);
        const ballInOver = isLegal ? (innings.legalBalls % 6) + 1 : (innings.legalBalls % 6);
        const totalRuns = input.batterRuns + input.extraRuns;
        const runsConceded = CricketScoringEngine.calculateRunsConceded(
          input.batterRuns,
          input.extraType,
          input.extraRuns
        );

        // Record delivery
        const delivery = await tx.delivery.create({
          data: {
            inningsId: input.inningsId,
            sequenceNumber,
            overNumber,
            ballInOver,
            isLegal,
            bowlerId: input.bowlerId,
            strikerId: input.strikerId,
            nonStrikerId: input.nonStrikerId,
            batterRuns: input.batterRuns,
            extraType: input.extraType as any,
            extraRuns: input.extraRuns,
            totalRuns,
            runsConceded,
            isWicket: input.isWicket,
            commentary: input.commentary,
            idempotencyKey: input.idempotencyKey || null,
          },
        });

        // Record wicket if present
        if (input.isWicket && input.wicket) {
          await tx.wicket.create({
            data: {
              deliveryId: delivery.id,
              dismissalType: input.wicket.dismissalType as any,
              playerOutId: input.wicket.playerOutId,
              assistedById: input.wicket.assistedById || null,
              isBowlerCredited: input.wicket.isBowlerCredited,
              newBatterId: input.wicket.newBatterId || null,
            },
          });
        }

        // Update innings cumulative metrics
        const newTotalRuns = innings.totalRuns + totalRuns;
        const newLegalBalls = isLegal ? innings.legalBalls + 1 : innings.legalBalls;
        const newWickets = innings.wickets + (input.isWicket ? 1 : 0);
        const newTotalExtras = innings.totalExtras + input.extraRuns;
        const newWides = innings.wides + (input.extraType === "WIDE" ? input.extraRuns : 0);
        const newNoBalls = innings.noBalls + (input.extraType === "NO_BALL" ? input.extraRuns : 0);
        const newByes = innings.byes + (input.extraType === "BYE" ? input.extraRuns : 0);
        const newLegByes = innings.legByes + (input.extraType === "LEG_BYE" ? input.extraRuns : 0);
        const newPenalties = innings.penalties + (input.extraType === "PENALTY" ? input.extraRuns : 0);

        // Check Innings End conditions
        let isCompleted = false;
        if (newWickets >= innings.match.oversLimit * 0 + 10) {
          // 10 wickets out
          isCompleted = true;
        } else if (newLegalBalls >= innings.match.oversLimit * 6) {
          // Overs finished
          isCompleted = true;
        } else if (innings.targetRuns && newTotalRuns >= innings.targetRuns) {
          // Target achieved
          isCompleted = true;
        }

        const updatedInnings = await tx.innings.update({
          where: { id: input.inningsId },
          data: {
            totalRuns: newTotalRuns,
            legalBalls: newLegalBalls,
            wickets: newWickets,
            totalExtras: newTotalExtras,
            wides: newWides,
            noBalls: newNoBalls,
            byes: newByes,
            legByes: newLegByes,
            penalties: newPenalties,
            status: isCompleted ? InningsStatus.COMPLETED : InningsStatus.IN_PROGRESS,
            isCompleted,
          },
        });

        return { delivery, innings: updatedInnings };
      });

      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/v1/scoring/deliveries/:id/correct (Audited Correction)
scoringRouter.post(
  "/deliveries/:id/correct",
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SCORER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CorrectDeliverySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.format() });
        return;
      }

      const { reason, delivery: updatedInput } = parsed.data;
      const deliveryId = req.params.id;

      const result = await prisma.$transaction(async (tx) => {
        const targetDelivery = await tx.delivery.findUnique({
          where: { id: deliveryId },
          include: { innings: { include: { match: true } } },
        });

        if (!targetDelivery) {
          throw new Error("Delivery to correct was not found");
        }

        const inningsId = targetDelivery.inningsId;

        // Log audit trail
        await tx.auditLog.create({
          data: {
            matchId: targetDelivery.innings.matchId,
            userId: req.user!.id,
            action: "DELIVERY_CORRECTED",
            details: JSON.stringify({
              deliveryId,
              reason,
              previous: targetDelivery,
              updatedInput,
            }),
          },
        });

        // Delete existing wicket if any on this delivery
        await tx.wicket.deleteMany({ where: { deliveryId } });

        // Update the delivery record
        const isLegal = CricketScoringEngine.isLegalDelivery(updatedInput.extraType);
        const totalRuns = updatedInput.batterRuns + updatedInput.extraRuns;
        const runsConceded = CricketScoringEngine.calculateRunsConceded(
          updatedInput.batterRuns,
          updatedInput.extraType,
          updatedInput.extraRuns
        );

        await tx.delivery.update({
          where: { id: deliveryId },
          data: {
            bowlerId: updatedInput.bowlerId,
            strikerId: updatedInput.strikerId,
            nonStrikerId: updatedInput.nonStrikerId,
            batterRuns: updatedInput.batterRuns,
            extraType: updatedInput.extraType as any,
            extraRuns: updatedInput.extraRuns,
            totalRuns,
            runsConceded,
            isLegal,
            isWicket: updatedInput.isWicket,
            commentary: updatedInput.commentary,
          },
        });

        if (updatedInput.isWicket && updatedInput.wicket) {
          await tx.wicket.create({
            data: {
              deliveryId,
              dismissalType: updatedInput.wicket.dismissalType as any,
              playerOutId: updatedInput.wicket.playerOutId,
              assistedById: updatedInput.wicket.assistedById || null,
              isBowlerCredited: updatedInput.wicket.isBowlerCredited,
              newBatterId: updatedInput.wicket.newBatterId || null,
            },
          });
        }

        // Fetch all deliveries for this innings in sequential order to recalculate deterministically
        const allDeliveries = await tx.delivery.findMany({
          where: { inningsId },
          orderBy: { sequenceNumber: "asc" },
          include: { wicket: true },
        });

        const deliveryInputs: DeliveryInput[] = allDeliveries.map((d) => ({
          inningsId: d.inningsId,
          bowlerId: d.bowlerId,
          strikerId: d.strikerId,
          nonStrikerId: d.nonStrikerId,
          batterRuns: d.batterRuns,
          extraType: d.extraType as any,
          extraRuns: d.extraRuns,
          isWicket: d.isWicket,
          wicket: d.wicket
            ? {
                dismissalType: d.wicket.dismissalType as any,
                playerOutId: d.wicket.playerOutId,
                assistedById: d.wicket.assistedById,
                isBowlerCredited: d.wicket.isBowlerCredited,
                newBatterId: d.wicket.newBatterId,
              }
            : null,
          commentary: d.commentary,
        }));

        const firstDelivery = allDeliveries[0];
        const recalculatedState = CricketScoringEngine.recalculateInnings(
          deliveryInputs,
          firstDelivery.strikerId,
          firstDelivery.nonStrikerId,
          firstDelivery.bowlerId,
          targetDelivery.innings.match.oversLimit,
          10,
          targetDelivery.innings.targetRuns
        );

        // Update innings with recalculated metrics
        const updatedInnings = await tx.innings.update({
          where: { id: inningsId },
          data: {
            totalRuns: recalculatedState.totalRuns,
            legalBalls: recalculatedState.legalBalls,
            wickets: recalculatedState.wickets,
            totalExtras: recalculatedState.totalExtras,
            wides: recalculatedState.wides,
            noBalls: recalculatedState.noBalls,
            byes: recalculatedState.byes,
            legByes: recalculatedState.legByes,
            penalties: recalculatedState.penalties,
            isCompleted: recalculatedState.isInningsComplete,
            status: recalculatedState.isInningsComplete
              ? InningsStatus.COMPLETED
              : InningsStatus.IN_PROGRESS,
          },
        });

        return { updatedInnings, recalculatedState };
      });

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/v1/scoring/matches/:id/finalize
scoringRouter.post(
  "/matches/:id/finalize",
  authenticate,
  authorizeRoles(UserRole.ADMIN, UserRole.SCORER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const matchId = req.params.id;
      const { playerOfTheMatchId, notes } = req.body;

      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          teamA: true,
          teamB: true,
          innings: { orderBy: { inningsNumber: "asc" } },
        },
      });

      if (!match) {
        res.status(404).json({ error: "Match not found" });
        return;
      }

      if (match.innings.length === 0) {
        res.status(400).json({ error: "Cannot finalize match without recorded innings" });
        return;
      }

      let resultSummary = "Match Completed";
      let winnerTeamId: string | null = null;

      if (match.innings.length >= 2) {
        const inn1 = match.innings[0];
        const inn2 = match.innings[1];

        if (inn1.totalRuns > inn2.totalRuns) {
          winnerTeamId = inn1.battingTeamId;
          const runMargin = inn1.totalRuns - inn2.totalRuns;
          const winnerName =
            winnerTeamId === match.teamAId ? match.teamA.name : match.teamB.name;
          resultSummary = `${winnerName} won by ${runMargin} runs`;
        } else if (inn2.totalRuns > inn1.totalRuns) {
          winnerTeamId = inn2.battingTeamId;
          const wicketsRemaining = 10 - inn2.wickets;
          const winnerName =
            winnerTeamId === match.teamAId ? match.teamA.name : match.teamB.name;
          resultSummary = `${winnerName} won by ${wicketsRemaining} wickets`;
        } else {
          resultSummary = "Match Tied";
        }
      }

      const updatedMatch = await prisma.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.COMPLETED,
          winnerTeamId,
          resultSummary,
          playerOfTheMatchId: playerOfTheMatchId || null,
          notes: notes || match.notes,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          matchId,
          userId: req.user!.id,
          action: "MATCH_FINALIZED",
          details: JSON.stringify({ resultSummary, winnerTeamId }),
        },
      });

      res.json({ match: updatedMatch });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);
