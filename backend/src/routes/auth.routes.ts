import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { validateBody } from "../middlewares/validate";
import { authenticate } from "../middlewares/auth";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Tente novamente em instantes." },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // alinhado ao JWT_EXPIRES_IN padrao (8h)
const isProduction = env.nodeEnv === "production";

router.post("/login", loginLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  // Mensagem generica de proposito: nao revelar se o e-mail existe ou nao.
  if (!user || !user.active) {
    return res.status(401).json({ error: "E-mail ou senha invalidos." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "E-mail ou senha invalidos." });
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions
  );
  const csrfToken = crypto.randomBytes(24).toString("hex");

  // Token de sessao em cookie httpOnly: inacessivel via JS, reduz o risco
  // de roubo por XSS. csrfToken fica legivel de proposito (double-submit
  // cookie pattern) - o front envia de volta no header X-CSRF-Token.
  res
    .cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    })
    .cookie("csrfToken", csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    })
    .json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
}));

router.post("/logout", (req, res) => {
  // Clearing cookies must also work after expiration or account deactivation.
  res.clearCookie("token").clearCookie("csrfToken").json({ ok: true });
});

router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado." });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}));

export default router;
