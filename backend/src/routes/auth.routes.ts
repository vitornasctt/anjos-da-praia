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
import { authenticate, verifySessionToken } from "../middlewares/auth";
import { disconnectToken } from "../lib/io";

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

// Mesmos atributos na criacao e na remocao do cookie: o navegador so apaga um
// cookie se path/secure/sameSite baterem com os de quando ele foi criado.
function cookieOptions(httpOnly: boolean, maxAgeMs?: number) {
  return {
    httpOnly,
    secure: env.nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

// Respostas de autenticacao nunca podem ser guardadas por cache/proxy.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

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

  // So o ID no token: perfil e nome sao lidos do banco a cada requisicao
  // (ver sessionUser), entao nada pessoal precisa viajar no cookie.
  // jwtid: identificador unico da sessao, para poder encerrar so ela no logout.
  const token = jwt.sign(
    { sub: user.id },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, jwtid: crypto.randomUUID() } as jwt.SignOptions
  );
  const csrfToken = crypto.randomBytes(24).toString("hex");

  // A validade do cookie vem do proprio JWT (exp), entao os dois nunca
  // divergem quando JWT_EXPIRES_IN muda.
  const exp = (jwt.decode(token) as jwt.JwtPayload).exp!;
  const maxAgeMs = exp * 1000 - Date.now();

  // Token de sessao em cookie httpOnly: inacessivel via JS, reduz o risco
  // de roubo por XSS. csrfToken fica legivel de proposito (double-submit
  // cookie pattern) - o front envia de volta no header X-CSRF-Token.
  res
    .cookie("token", token, cookieOptions(true, maxAgeMs))
    .cookie("csrfToken", csrfToken, cookieOptions(false, maxAgeMs))
    .json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  // Encerra a sessao no servidor: o jti do token entra na lista de sessoes
  // revogadas ate o token expirar, entao ele para de funcionar mesmo que
  // alguem o tenha copiado. Outras sessoes da mesma conta nao sao afetadas.
  // Se a revogacao falhar, responde erro e NAO limpa os cookies: assim o
  // usuario sabe que ainda nao saiu e pode tentar de novo.
  const header = req.headers.authorization;
  const token: string | null = req.cookies?.token ?? (header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null);
  const session = token ? verifySessionToken(token) : null;
  if (token && session) {
    await prisma.revokedSession.upsert({
      where: { jti: session.jti },
      create: { jti: session.jti, expiresAt: new Date((session.exp ?? 0) * 1000) },
      update: {},
    });
    disconnectToken(token);
    // Limpeza oportunista: sessoes revogadas que ja expiraram nao precisam ficar na lista.
    await prisma.revokedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined);
  }
  // Token ausente, expirado ou invalido: nada a revogar, mas os cookies sao
  // limpos mesmo assim (tambem apos expiracao ou desativacao da conta).
  res.clearCookie("token", cookieOptions(true)).clearCookie("csrfToken", cookieOptions(false)).json({ ok: true });
}));

router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado." });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}));

export default router;
