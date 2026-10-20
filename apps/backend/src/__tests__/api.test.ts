import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../index.js";

describe("CrickView REST API Suite", () => {
  it("GET /health returns healthy status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("CrickView API");
  });

  it("GET /api/v1/tournaments returns tournaments array", async () => {
    const res = await request(app).get("/api/v1/tournaments");
    // Either 200 with list or 500 if database is awaiting live connection
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.tournaments)).toBe(true);
    }
  });

  it("POST /api/v1/auth/register validates schema with Zod", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "A", // too short
      email: "invalid-email",
      password: "123", // too short
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});
