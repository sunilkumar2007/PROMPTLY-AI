import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { isDevelopmentDemoToken } from "@/lib/demo-auth.logic";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    // The local demo identity is deliberately accepted only by the Vite dev
    // server. It never becomes an authentication bypass in preview/production.
    if (isDevelopmentDemoToken(token, process.env["NODE_ENV"])) {
      return next({ context: { supabase: null, userId: "demo-creator-1", claims: null } });
    }

    const url = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!token || !url || !publishableKey) {
      throw new Error("A valid Supabase sign-in and server configuration are required.");
    }

    const supabase = createClient<Database>(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || typeof userId !== "string" || !userId) {
      throw new Error("Your Supabase session is invalid or expired. Sign in again.");
    }
    return next({ context: { supabase, userId, claims: data.claims } });
  },
);
