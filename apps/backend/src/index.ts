import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { authRouter } from "./routes/auth.routes.js";
import { coreRouter } from "./routes/core.routes.js";
import { scoringRouter } from "./routes/scoring.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { importRouter } from "./routes/import.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "CrickView API", timestamp: new Date().toISOString() });
});

// API Routes (v1)
app.use("/api/v1/auth", authRouter);
app.use("/api/v1", coreRouter);
app.use("/api/v1/scoring", scoringRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/imports", importRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🏏 CrickView Backend Server running on http://localhost:${PORT}`);
  });
}

export default app;
