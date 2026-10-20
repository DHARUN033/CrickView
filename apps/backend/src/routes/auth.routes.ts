import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { signToken, authenticate } from "../middleware/auth.js";
import { AuthLoginSchema, AuthRegisterSchema, UserRole } from "@crickview/shared";

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = AuthRegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.format() });
      return;
    }

    const { name, email, password, role } = parseResult.data;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: "User with this email already exists" });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: role as any,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    });

    res.status(201).json({ user, token });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to register user" });
  }
});

// POST /api/v1/auth/login
authRouter.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = AuthLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: "Validation failed", details: parseResult.error.format() });
      return;
    }

    const { email, password } = parseResult.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
    });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Login failed" });
  }
});

// GET /api/v1/auth/me
authRouter.get("/me", authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  res.json({ user });
});
