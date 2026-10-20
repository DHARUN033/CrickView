import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearData() {
  console.log("🧹 Clearing all sample and test data from Supabase...");

  await prisma.auditLog.deleteMany({});
  await prisma.wicket.deleteMany({});
  await prisma.delivery.deleteMany({});
  await prisma.innings.deleteMany({});
  await prisma.matchSquadPlayer.deleteMany({});
  await prisma.matchSquad.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.tournamentTeam.deleteMany({});
  await prisma.teamPlayer.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.tournament.deleteMany({});
  await prisma.importJob.deleteMany({});

  console.log("✨ All sample records have been removed cleanly.");
}

clearData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
