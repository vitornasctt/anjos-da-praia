import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import { csrfProtection } from "./middlewares/csrf";

import authRoutes from "./routes/auth.routes";
import familiesRoutes from "./routes/families.routes";
import wristbandsRoutes from "./routes/wristbands.routes";
import incidentsRoutes from "./routes/incidents.routes";
import publicRoutes from "./routes/public.routes";
import teamsRoutes from "./routes/teams.routes";
import tentsRoutes from "./routes/tents.routes";
import beachesRoutes from "./routes/beaches.routes";
import usersRoutes from "./routes/users.routes";
import reportsRoutes from "./routes/reports.routes";

export const app = express();

// Necessario para o express-rate-limit (rotas publicas) identificar o IP
// real do visitante em vez do proxy da Vercel - sem isso, todo mundo
// atras do mesmo proxy compartilharia o mesmo limite de requisicoes.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
// Limite elevado de 100kb para comportar a foto (base64) opcional da
// crianca no cadastro rapido (ver families.routes.ts).
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

app.get("/", (_req, res) => res.json({ service: "Anjos da Praia API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/families", familiesRoutes);
app.use("/api/wristbands", wristbandsRoutes);
app.use("/api/incidents", incidentsRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/tents", tentsRoutes);
app.use("/api/beaches", beachesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/reports", reportsRoutes);

app.use((_req, res) => res.status(404).json({ error: "Rota nao encontrada." }));
app.use(errorHandler);
