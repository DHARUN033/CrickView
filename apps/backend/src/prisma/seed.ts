import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CrickView Demonstration Data...");

  // 1. Create Users
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("admin123", salt);

  const admin = await prisma.user.upsert({
    where: { email: "admin@crickview.com" },
    update: {},
    create: {
      email: "admin@crickview.com",
      name: "Admin Scorer",
      passwordHash,
      role: "ADMIN",
    },
  });

  // 2. Create Tournament
  const tournament = await prisma.tournament.upsert({
    where: {
      name_season: {
        name: "Corporate Premier League",
        season: "2026",
      },
    },
    update: {},
    create: {
      name: "Corporate Premier League",
      season: "2026",
      format: "T20",
      defaultOvers: 20,
      maxWickets: 10,
      pointsWin: 2,
      pointsTie: 1,
      pointsNoResult: 1,
      venue: "Wankhede Arena",
    },
  });

  // 3. Create Teams
  const csk = await prisma.team.upsert({
    where: { shortName: "CSK" },
    update: {},
    create: {
      name: "Chennai Super Kings",
      shortName: "CSK",
      description: "Yellow army champions",
    },
  });

  const rcb = await prisma.team.upsert({
    where: { shortName: "RCB" },
    update: {},
    create: {
      name: "Royal Challengers Bengaluru",
      shortName: "RCB",
      description: "Play Bold army",
    },
  });

  // Register teams to tournament
  await prisma.tournamentTeam.upsert({
    where: {
      tournamentId_teamId: {
        tournamentId: tournament.id,
        teamId: csk.id,
      },
    },
    update: {},
    create: {
      tournamentId: tournament.id,
      teamId: csk.id,
    },
  });

  await prisma.tournamentTeam.upsert({
    where: {
      tournamentId_teamId: {
        tournamentId: tournament.id,
        teamId: rcb.id,
      },
    },
    update: {},
    create: {
      tournamentId: tournament.id,
      teamId: rcb.id,
    },
  });

  // 4. Create Players
  const virat = await prisma.player.create({
    data: {
      name: "Virat Kohli",
      displayName: "Kohli",
      primaryRole: "BATTER",
      battingStyle: "RIGHT_HAND",
      bowlingStyle: "RIGHT_ARM_MEDIUM",
    },
  });

  const dhoni = await prisma.player.create({
    data: {
      name: "MS Dhoni",
      displayName: "Dhoni",
      primaryRole: "WICKET_KEEPER",
      battingStyle: "RIGHT_HAND",
      bowlingStyle: "NONE",
    },
  });

  const bumrah = await prisma.player.create({
    data: {
      name: "Jasprit Bumrah",
      displayName: "Bumrah",
      primaryRole: "BOWLER",
      battingStyle: "RIGHT_HAND",
      bowlingStyle: "RIGHT_ARM_FAST",
    },
  });

  // 5. Create Match
  const match = await prisma.match.create({
    data: {
      tournamentId: tournament.id,
      teamAId: csk.id,
      teamBId: rcb.id,
      scheduledAt: new Date(),
      venue: "Wankhede Arena",
      oversLimit: 20,
      matchFormat: "T20",
      status: "IN_PROGRESS",
      scorerId: admin.id,
    },
  });

  console.log(`✅ Demonstration match seeded: ${csk.name} vs ${rcb.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
