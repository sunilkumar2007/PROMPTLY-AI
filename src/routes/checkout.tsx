import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Navigation } from "@/components/landing/navigation";
import { Lock, Check, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, unknown>): { plan: string; amount: number } => ({
    plan: typeof search["plan"] === "string" ? search["plan"] : "Promptly Plan",
    amount: typeof search["amount"] === "number" ? search["amount"] : 0,
  }),
  head: () => ({
    meta: [
      { title: "Checkout — Promptly" },
      {
        name: "description",
        content: "Complete your Promptly subscription checkout.",
      },
    ],
  }),
  component: CheckoutPage,
});

type Stage = "login" | "processing" | "success";

function CheckoutPage() {
  const { plan, amount } = Route.useSearch();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const formattedPrice = `₹${amount.toLocaleString("en-IN")}`;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setStage("processing");
    // Simulated gateway latency — no payment is ever processed.
    window.setTimeout(() => setStage("success"), 2200);
  };

  return (
    <div className="min-h-screen bg-white pt-32 pb-20">
      <Navigation />
      <div className="max-w-md mx-auto px-6">
        {/* Simulated gateway header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-2xl font-bold italic tracking-tight">
            <span className="text-[#003087]">Pay</span>
            <span className="text-[#0070BA]">Pal</span>
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] bg-amber-100 text-amber-800 px-3 py-1.5 rounded-full">
            Demo Simulation
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-black/10 rounded-2xl overflow-hidden shadow-xl shadow-black/5"
        >
          {/* Order summary */}
          <div className="bg-black/[0.02] border-b border-black/[0.06] px-6 py-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40 mb-3">
              You're subscribing to
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-black">{plan}</p>
                <p className="text-xs text-black/40">Billed monthly</p>
              </div>
              <p className="text-xl font-black tracking-tight text-black">
                {formattedPrice}
              </p>
            </div>
          </div>

          {stage === "login" && (
            <form onSubmit={handlePay} className="px-6 py-6 space-y-4">
              <p className="text-sm text-black/60 mb-4">
                Pay with your PayPal account
              </p>
              <div className="space-y-2">
                <label htmlFor="paypal-email" className="text-xs font-bold text-black/60">
                  Email
                </label>
                <input
                  id="paypal-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 px-4 border border-black/15 rounded-lg text-sm outline-none focus:border-[#0070BA] focus:ring-1 focus:ring-[#0070BA]/30 transition"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="paypal-password" className="text-xs font-bold text-black/60">
                  Password
                </label>
                <input
                  id="paypal-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 px-4 border border-black/15 rounded-lg text-sm outline-none focus:border-[#0070BA] focus:ring-1 focus:ring-[#0070BA]/30 transition"
                />
              </div>
              <button
                type="submit"
                className="w-full h-12 rounded-full bg-[#0070BA] text-white text-sm font-bold hover:bg-[#003087] transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-[#0070BA]/20 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                Log In and Pay {formattedPrice}
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/pricing" })}
                className="w-full text-center text-xs text-[#0070BA] hover:underline cursor-pointer pt-1"
              >
                Cancel and return to Promptly
              </button>
            </form>
          )}

          {stage === "processing" && (
            <div className="px-6 py-16 flex flex-col items-center text-center gap-4">
              <Loader2 className="w-10 h-10 text-[#0070BA] animate-spin" />
              <p className="text-sm font-bold text-black">Processing payment…</p>
              <p className="text-xs text-black/40">Contacting payment gateway</p>
            </div>
          )}

          {stage === "success" && (
            <div className="px-6 py-10 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-lg font-black tracking-tight text-black">
                Payment Successful
              </p>
              <p className="text-sm text-black/60">
                You're now subscribed to <span className="font-bold">{plan}</span>.
              </p>
              <div className="w-full h-px bg-black/[0.06] my-2" />
              <button
                onClick={() => navigate({ to: "/ai" })}
                className="w-full h-12 rounded-full bg-black text-white text-[11px] font-bold uppercase tracking-widest hover:bg-black/85 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-black/10 cursor-pointer"
              >
                Go to AI Workspace
              </button>
              <button
                onClick={() => navigate({ to: "/pricing" })}
                className="text-xs text-black/40 hover:text-black transition-colors cursor-pointer"
              >
                Back to Pricing
              </button>
            </div>
          )}
        </motion.div>

        {/* Honest fine print */}
        <div className="mt-6 flex items-center justify-center gap-2 text-black/30">
          <ShieldCheck className="w-3.5 h-3.5" />
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-center">
            Simulation only — no real payment is processed
          </p>
        </div>
      </div>
    </div>
  );
}
