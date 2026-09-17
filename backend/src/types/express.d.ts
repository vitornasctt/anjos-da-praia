import { Role } from "../constants/enums";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        name: string;
      };
    }
  }
}

export {};
