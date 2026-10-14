import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Navigation } from "@/components/landing/navigation";
import { Footer } from "@/components/landing/footer";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — Promptly" },
      {
        name: "description",
        content:
          "Promptly plans: Student, Solo Developer, Team, and Enterprise. Billed monthly.",
      },
    ],
  }),
});

type Plan = {
  name: string;
  price: string;
  amount: number;
  period: string | null;
  description: string;
  features: string[];
  cta: string;
  onCta: () => void;
};

function PricingPage() {
  const navigate = useNavigate();

  const handleCheckout = (plan: Plan) => {
    navigate({ to: "/checkout", search: { plan: plan.name, amount: plan.amount } });
  };

  const handleContact = () => {
    toast("Enterprise contact — coming soon");
  };

  const plans: Plan[] = [
    {
      name: "Student",
      price: "₹399",
      amount: 399,
      period: "/month",
      description: "Everything you need to learn and build.",
      features: [
        "Full SDLC Engine — idea to working software",
        "Multi-phase project planning (5–30 phases)",
        "Community resource library access",
        "Project Brain context memory",
        "One-click project .zip export",
        "Standard multi-model routing",
        "Email support",
      ],
      cta: "Get Started",
      onCta: () => handleCheckout({ name: "Student", amount: 399 } as Plan),
    },
    {
      name: "Solo Developer",
      price: "₹2,999",
      amount: 2999,
      period: "/month",
      description: "For shipping production projects solo.",
      features: [
        "Everything in Student, plus:",
        "Unlimited active projects",
        "Advanced model routing — OpenAI, Anthropic, Gemini, DeepSeek",
        "Fine-grained phase granularity (100+ phases)",
        "Publish resources to the community",
        "Priority generation queue",
        "Priority support",
      ],
      cta: "Get Started",
      onCta: () => handleCheckout({ name: "Solo Developer", amount: 2999 } as Plan),
    },
    {
      name: "Team",
      price: "₹7,999",
      amount: 7999,
      period: "/month",
      description: "For teams building together.",
      features: [
        "Everything in Solo Developer, plus:",
        "Shared team workspaces",
        "Collaborative project libraries",
        "Centralized billing for the whole team",
        "Build history & usage analytics",
        "Role-based access control",
        "Dedicated support channel",
      ],
      cta: "Get Started",
      onCta: () => handleCheckout({ name: "Team", amount: 7999 } as Plan),
    },
    {
      name: "Enterprise",
      price: "Custom",
      amount: 0,
      period: null,
      description: "Custom pricing based on company requirements and usage.",
      features: [
        "Everything in Team, plus:",
        "Custom pricing on requirements & usage",
        "SSO & advanced security controls",
        "Dedicated infrastructure options",
        "Custom integrations & CI/CD webhooks",
        "SLA-backed priority support",
        "Onboarding & training sessions",
      ],
      cta: "Contact Us",
      onCta: handleContact,
    },
  ];

  return (
    <div className="min-h-screen bg-white pt-32">
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <header className="mb-12 md:mb-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-black/30 mb-4">
            Pricing
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter text-black leading-none">
            Choose your plan
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/40 max-w-xl mt-4">
            Four plans. Billed monthly.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="p-8 border border-black/5 rounded-3xl hover:border-black/10 hover:shadow-xl hover:shadow-black/5 transition-all flex flex-col"
            >
              <h3 className="font-bold text-lg mb-6">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-4xl font-black tracking-tighter text-black">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-xs font-bold uppercase tracking-widest text-black/40">
                    {plan.period}
                  </span>
                )}
              </div>
              <p className="text-xs text-black/40 leading-relaxed mb-6">
                {plan.description}
              </p>
              <ul className="space-y-2.5 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="w-3.5 h-3.5 mt-0.5 text-black shrink-0" />
                    <span className="text-xs text-black/50 leading-relaxed">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <Button
                  onClick={plan.onCta}
                  className="w-full h-11 rounded-full bg-black text-white text-[11px] font-bold uppercase tracking-widest hover:bg-black/85 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-black/10"
                >
                  {plan.cta}
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
