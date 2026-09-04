// Better Auth Next.js API route.
//
// All Better Auth endpoints (`/api/auth/*`) are handled here via the official
// Next.js integration wrapper. This is the single backend entry point for
// authentication; no separate server or duplicated endpoints.

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(auth);