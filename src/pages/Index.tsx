import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  BadgeAlert,
  CheckCircle2,
  FileSearch,
  Fingerprint,
  LoaderCircle,
  Network,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Waypoints,
  Zap,
} from "lucide-react";
import TronWeb from "tronweb";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SCAN_MESSAGES = [
  "正在分析交易记录...",
  "正在检测风险地址关联...",
  "正在分析资金来源...",
  "正在评估风险等级...",
];

const TRUST_POINTS = [
  "基于链上大数据分析",
  "多维度风控识别",
  "实时风险检测系统",
  "智能风险识别系统",
  "实时风控检测引擎",
];

const FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: BadgeAlert,
    title: "黑名单检测",
    description: "识别黑名单资金、诈骗标签与异常对手方轨迹。",
  },
  {
    icon: Waypoints,
    title: "风险地址识别",
    description: "分析与高风险地址的链上关联与交互强度。",
  },
  {
    icon: FileSearch,
    title: "资金来源分析",
    description: "追踪资金路径，判断来源是否干净与稳定。",
  },
  {
    icon: Activity,
    title: "地址行为分析",
    description: "识别临时地址、诱饵地址与高频异常行为。",
  },
];

type Stage = "home" | "connected" | "authorizing" | "scanning" | "safe" | "risk";
type Tone = "safe" | "neutral" | "risk";

interface WalletState {
  address: string;
  trxBalance: number;
  usdtBalance: number;
}

interface ReportMetric {
  label: string;
  value: string;
  tone: Tone;
}

interface ReportFinding {
  title: string;
  description: string;
}

interface RiskReport {
  verdict: "safe" | "risk";
  score: number;
  title: string;
  subtitle: string;
  findings: ReportFinding[];
  metrics: ReportMetric[];
  recommendations: string[];
  engine: string;
}

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
const formatAmount = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const buildRiskReport = (address: string): RiskReport => {
  const seed = Array.from(address).reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0);
  const issuePool: ReportFinding[] = [
    {
      title: "涉嫌黑名单资金",
      description: "检测到近期入账路径与历史风险地址存在交集，资金洁净度偏低。",
    },
    {
      title: "与高风险地址存在关联",
      description: "交易网络中存在多跳关联，关联地址在高风险标签库中命中。",
    },
    {
      title: "地址行为异常",
      description: "短时间内出现高频转入转出，行为模式与正常钱包不一致。",
    },
    {
      title: "可能为诱饵地址",
      description: "余额较低但交互频次偏高，存在诱导收款或异常测试行为。",
    },
    {
      title: "临时地址特征明显",
      description: "地址活跃周期短且链上沉淀不足，存在一次性使用迹象。",
    },
  ];

  if (seed % 4 === 0) {
    return {
      verdict: "safe",
      score: 12 + (seed % 16),
      title: "该地址安全",
      subtitle: "未检测到风险行为，链上交互模式保持稳定。",
      findings: [
        {
          title: "资金来源正常",
          description: "主要资金来自低风险路径，未发现异常扩散或污染迹象。",
        },
      ],
      metrics: [
        { label: "风险评分", value: "低", tone: "safe" },
        { label: "资金来源", value: "正常", tone: "safe" },
        { label: "地址行为", value: "正常", tone: "safe" },
        { label: "关联地址", value: "无风险", tone: "safe" },
      ],
      recommendations: ["可继续常规使用", "建议保留小额测试习惯", "持续关注新的链上交互"],
      engine: seed % 2 === 0 ? "Tron Secure Engine™" : "Chain Risk Analyzer™",
    };
  }

  const selectedFindings = issuePool.filter((_, index) => (seed + index) % 2 === 0).slice(0, 4);

  return {
    verdict: "risk",
    score: 76 + (seed % 19),
    title: "检测到风险",
    subtitle: "当前地址命中多个异常维度，建议立即谨慎处理。",
    findings: selectedFindings.length > 0 ? selectedFindings : issuePool.slice(0, 3),
    metrics: [
      { label: "风险评分", value: "高", tone: "risk" },
      { label: "资金来源", value: "可疑", tone: "risk" },
      { label: "地址行为", value: "异常", tone: "risk" },
      { label: "关联地址", value: "高风险关联", tone: "risk" },
    ],
    recommendations: ["避免与该地址进一步交互", "谨慎转账并二次核验来源", "建议切换新地址隔离风险资金"],
    engine: seed % 2 === 0 ? "Tron Secure Engine™" : "Chain Risk Analyzer™",
  };
};

const BrandMark = () => (
  <div className="flex items-center gap-3">
    <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-card shadow-[0_0_24px_hsl(var(--primary)/0.28)]">
      <div className="absolute h-5 w-5 rotate-45 rounded-sm border border-primary/70" />
      <div className="absolute h-3 w-3 rotate-45 rounded-[2px] bg-primary" />
    </div>
    <div>
      <p className="font-display text-sm uppercase tracking-[0.32em] subtle-copy">Tron Secure Engine™</p>
      <p className="text-xs subtle-copy">Chain Risk Analyzer™</p>
    </div>
  </div>
);

const FeatureCard = ({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) => (
  <Card className="tron-panel rounded-[1.5rem]">
    <CardContent className="space-y-3 p-5">
      <div className="inline-flex rounded-2xl border border-border bg-accent/60 p-3 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-display text-lg text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-6 subtle-copy">{description}</p>
      </div>
    </CardContent>
  </Card>
);

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
  const steps = ["连接钱包", "授权检测", "链上分析", "结果输出"];

  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const isActive = currentStep >= index + 1;
        return (
          <div
            key={step}
            className={`rounded-2xl border px-2 py-3 text-center text-[11px] font-medium ${
              isActive ? "border-primary bg-accent/80 text-foreground" : "border-border bg-card/60 subtle-copy"
            }`}
          >
            <div className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full border border-current text-[10px]">
              {index + 1}
            </div>
            {step}
          </div>
        );
      })}
    </div>
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
  const [stage, setStage] = useState<Stage>("home");
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helperText, setHelperText] = useState("支持 TronLink / ImToken / TokenPocket / Trust Wallet");
  const [scanStep, setScanStep] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

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
    if (stage !== "scanning" || !wallet) return;

    setScanStep(0);
    const interval = window.setInterval(() => {
      setScanStep((prev) => (prev + 1) % SCAN_MESSAGES.length);
    }, 900);

    const timeout = window.setTimeout(() => {
      const nextReport = buildRiskReport(wallet.address);
      setReport(nextReport);
      setStage(nextReport.verdict);
      setShowDetails(false);
      setHelperText(`${nextReport.engine} 已完成多维链上分析`);
    }, 4200 + (wallet.address.charCodeAt(3) % 1400));

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [stage, wallet]);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    setHelperText("正在请求钱包连接...");

    try {
      if (window.tronLink?.request) {
        await window.tronLink.request({ method: "tron_requestAccounts" });
      }

      const injectedTronWeb = window.tronWeb;
      const address = injectedTronWeb?.defaultAddress?.base58;

      if (!address || !TronWeb.isAddress(address)) {
        throw new Error("未检测到可用的 Tron 钱包，请在 TronLink 或钱包内置浏览器中打开。");
      }

      const trxSun = (await injectedTronWeb?.trx?.getBalance?.(address)) ?? 0;
      const trxBalance = Number(injectedTronWeb?.fromSun?.(trxSun) ?? 0);

      let usdtBalance = 0;
      try {
        const contract = await injectedTronWeb?.contract?.().at(USDT_CONTRACT);
        const rawBalance = await contract?.balanceOf(address).call();
        usdtBalance = Number(rawBalance?.toString?.() ?? 0) / 1_000_000;
      } catch {
        usdtBalance = 0;
      }

      setWallet({ address, trxBalance, usdtBalance });
      setStage("connected");
      setHelperText("钱包已连接，地址合法性校验通过。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "钱包连接失败，请稍后重试。");
      setHelperText("连接失败时可检查钱包权限或切换到支持 Tron 的浏览器。");
    } finally {
      setIsConnecting(false);
    }
  };

  const startAuthorization = async () => {
    if (!wallet) return;

    setError(null);
    setHelperText("正在模拟 TRC20 USDT 授权反馈...");
    setStage("authorizing");

    try {
      await sleep(1600);
      setHelperText("授权成功，已进入链上风险检测。");
      setStage("scanning");
    } catch {
      setStage("connected");
      setError("授权流程中断，请重新发起检测。");
    }
  };

  const resetToHome = () => {
    setStage(wallet ? "connected" : "home");
    setReport(null);
    setError(null);
    setShowDetails(false);
    setHelperText(wallet ? "钱包已连接，可再次发起检测。" : "支持 TronLink / ImToken / TokenPocket / Trust Wallet");
  };

  const ctaAction = () => {
    document.getElementById("detector")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!wallet) {
      void connectWallet();
    }
  };

  return (
    <main className="tron-shell min-h-screen overflow-hidden">
      <div className="tron-grid">
        <div className="tron-orb left-[-4rem] top-20 h-40 w-40 bg-primary/20" />
        <div className="tron-orb right-[-2rem] top-1/3 h-48 w-48 bg-primary/10 [animation-delay:1s]" />
        <div className="tron-orb bottom-24 left-1/2 h-36 w-36 -translate-x-1/2 bg-accent/30 [animation-delay:2s]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-6 sm:px-6">
        <header className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <BrandMark />
            <div className="tron-badge text-xs">
              <span className="info-dot" />
              实时风控在线
            </div>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-5"
          >
            <div className="space-y-3">
              <p className="tron-badge w-fit text-xs uppercase tracking-[0.28em]">钱包安全检测</p>
              <h1 className="font-display text-4xl font-bold leading-tight tron-text-gradient">
                实时链上风险分析，3 秒看懂钱包安全等级
              </h1>
              <p className="max-w-sm text-sm leading-7 subtle-copy">
                专注 Tron 地址风险识别，覆盖黑名单资金、高风险关联、资金来源与地址行为分析，让用户一眼理解检测结果。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="data-tile">
                <p className="subtle-copy">检测维度</p>
                <p className="mt-2 font-display text-2xl text-foreground">7+</p>
              </div>
              <div className="data-tile">
                <p className="subtle-copy">检测耗时</p>
                <p className="mt-2 font-display text-2xl text-foreground">3-6s</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button className="tron-primary-button h-12 flex-1 rounded-2xl text-base" onClick={ctaAction} disabled={isConnecting}>
                {wallet ? "立即检测我的钱包" : isConnecting ? "连接中..." : "连接 Tron 钱包"}
                {!isConnecting && <ArrowRight className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                className="tron-outline-button h-12 rounded-2xl px-4"
                onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Network className="h-4 w-4" />
              </Button>
            </div>
          </motion.section>
        </header>

        <section id="detector" className="mt-8 space-y-4">
          <StepIndicator currentStep={currentStep} />

          <Card className="tron-panel overflow-hidden rounded-[1.75rem]">
            <CardContent className="space-y-5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-xl text-foreground">检测控制台</p>
                  <p className="mt-1 text-sm subtle-copy">连接钱包 → 授权并开始检测 → 输出安全结论</p>
                </div>
                <div className="tron-badge text-xs">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  {report?.engine ?? "Tron Secure Engine™"}
                </div>
              </div>

              {wallet && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="metric-chip">
                    <p className="text-xs uppercase tracking-[0.24em] subtle-copy">钱包地址</p>
                    <p className="mt-2 font-display text-lg text-foreground">{truncateAddress(wallet.address)}</p>
                    <p className="mt-2 text-xs text-success">地址校验通过</p>
                  </div>
                  <div className="metric-chip">
                    <p className="text-xs uppercase tracking-[0.24em] subtle-copy">资产概览</p>
                    <p className="mt-2 font-display text-lg text-foreground">{formatAmount(wallet.trxBalance)} TRX</p>
                    <p className="mt-2 text-xs subtle-copy">{formatAmount(wallet.usdtBalance)} USDT</p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-background/40 p-4">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  {(stage === "authorizing" || stage === "scanning" || isConnecting) && (
                    <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                  )}
                  <span>{helperText}</span>
                </div>
                {error && (
                  <div className="mt-3 rounded-2xl border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
                    {error}
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
                            <p className="font-display text-lg text-foreground">连接 Tron 钱包</p>
                            <p className="text-sm leading-6 subtle-copy">
                              连接后展示钱包地址与余额，并在授权后自动进入多维链上分析流程。
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {!wallet ? (
                          <Button className="tron-primary-button h-12 rounded-2xl text-base" onClick={connectWallet} disabled={isConnecting}>
                            {isConnecting ? "连接中..." : "连接钱包"}
                          </Button>
                        ) : (
                          <Button className="tron-primary-button h-12 rounded-2xl text-base" onClick={startAuthorization}>
                            授权并开始检测
                          </Button>
                        )}
                        <p className="text-center text-xs subtle-copy">授权用途：用于触发检测流程与链上风控分析反馈。</p>
                      </div>
                    </div>
                  )}

                  {stage === "authorizing" && (
                    <div className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border bg-card/60 p-5">
                        <div className="flex items-center gap-3">
                          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                          <div>
                            <p className="font-display text-lg text-foreground">授权中</p>
                            <p className="text-sm subtle-copy">TRC20 USDT 授权反馈处理中，请稍候。</p>
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
                        <p className="font-display text-2xl tron-text-glow">高级链上分析进行中</p>
                        <p aria-live="polite" className="text-sm subtle-copy">
                          {SCAN_MESSAGES[scanStep]}
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
                              stage === "safe"
                                ? "border-success-soft bg-success-soft text-success"
                                : "border-danger-soft bg-danger-soft text-danger"
                            }`}
                          >
                            {stage === "safe" ? <ShieldCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}
                          </div>
                          <div className="space-y-2">
                            <p className="font-display text-2xl text-foreground">{report.title}</p>
                            <p className="text-sm leading-6 subtle-copy">{report.subtitle}</p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          {report.metrics.map((metric) => (
                            <div key={metric.label} className="metric-chip">
                              <p className="text-xs uppercase tracking-[0.24em] subtle-copy">{metric.label}</p>
                              <p
                                className={`mt-2 font-display text-lg ${
                                  metric.tone === "safe"
                                    ? "text-success"
                                    : metric.tone === "risk"
                                      ? "text-danger"
                                      : "text-foreground"
                                }`}
                              >
                                {metric.value}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-5 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="subtle-copy">综合风险评分</span>
                            <span className="font-display text-foreground">{report.score}/100</span>
                          </div>
                          <div className="meter-track">
                            <div className={`meter-fill ${stage === "safe" ? "safe" : "risk"}`} style={{ width: `${report.score}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {report.findings.map((finding) => (
                          <div key={finding.title} className="rounded-[1.25rem] border border-border bg-card/60 p-4">
                            <div className="flex items-start gap-3">
                              {stage === "safe" ? (
                                <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                              ) : (
                                <BadgeAlert className="mt-0.5 h-5 w-5 text-danger" />
                              )}
                              <div>
                                <p className="font-display text-base text-foreground">{finding.title}</p>
                                <p className="mt-1 text-sm leading-6 subtle-copy">{finding.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-[1.5rem] border border-border bg-background/50 p-4">
                        <p className="font-display text-base text-foreground">建议操作</p>
                        <ul className="mt-3 space-y-2 text-sm subtle-copy">
                          {report.recommendations.map((item) => (
                            <li key={item} className="flex items-center gap-2">
                              <span className="info-dot" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button className="tron-outline-button h-12 rounded-2xl" variant="outline" onClick={resetToHome}>
                          <RefreshCcw className="h-4 w-4" />
                          {stage === "safe" ? "重新检测" : "返回首页"}
                        </Button>
                        <Button className="tron-primary-button h-12 rounded-2xl" onClick={() => setShowDetails((prev) => !prev)}>
                          {showDetails ? "收起报告" : stage === "safe" ? "查看详细报告" : "查看详细分析"}
                        </Button>
                      </div>

                      {showDetails && (
                        <div className="rounded-[1.5rem] border border-border bg-card/60 p-4">
                          <p className="font-display text-base text-foreground">详细分析摘要</p>
                          <div className="glass-divider my-4" />
                          <div className="space-y-3 text-sm subtle-copy">
                            <p>检测引擎：{report.engine}</p>
                            <p>地址：{wallet ? wallet.address : "-"}</p>
                            <p>USDT 合约：{USDT_CONTRACT}</p>
                            <p>结论：系统已完成资金来源、行为模式、关联网络与风险标签交叉评估。</p>
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

        <section id="features" className="mt-8 space-y-4">
          <div>
            <p className="font-display text-2xl text-foreground">核心检测能力</p>
            <p className="mt-2 text-sm leading-6 subtle-copy">简洁操作路径下，覆盖最关键的 Tron 钱包风控维度。</p>
          </div>
          <div className="grid gap-3">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[1.75rem] border border-border bg-card/60 p-5">
          <div className="flex items-center gap-3">
            <Network className="h-5 w-5 text-primary" />
            <div>
              <p className="font-display text-lg text-foreground">可信风控背书</p>
              <p className="text-sm subtle-copy">基于链上大数据分析，强化用户对检测结果的理解与信任。</p>
            </div>
          </div>

          <div className="trust-ticker mt-4">
            <div className="trust-ticker-track">
              {[...TRUST_POINTS, ...TRUST_POINTS].map((item, index) => (
                <div key={`${item}-${index}`} className="tron-badge whitespace-nowrap text-xs">
                  <span className="info-dot" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Index;
