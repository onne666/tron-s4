import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { LayoutDashboard, Loader2, LogOut, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

type AuthorizationRow = {
  id: string;
  created_at: string;
  wallet_address: string;
  trx_balance: number | null;
  usdt_balance: number | null;
  approval_tx_id: string | null;
  locale: string | null;
  user_agent: string | null;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);

  const loadAuthorizations = useCallback(async () => {
    if (!supabase || !adminOk) return;
    setListLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from("wallet_authorizations")
      .select("id, created_at, wallet_address, trx_balance, usdt_balance, approval_tx_id, locale, user_agent", { count: "exact" })
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
                    <div className="max-h-[min(560px,calc(100vh-16rem))] overflow-auto">
                      <div className="min-w-[720px]">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="w-[168px] whitespace-nowrap">时间（北京时间）</TableHead>
                              <TableHead>钱包地址</TableHead>
                              <TableHead className="w-[88px]">TRX</TableHead>
                              <TableHead className="w-[88px]">USDT</TableHead>
                              <TableHead className="min-w-[140px]">交易 ID</TableHead>
                              <TableHead className="w-[72px]">语言</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((r) => (
                              <TableRow key={r.id} className="group">
                                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatCnTime(r.created_at)}</TableCell>
                                <TableCell className="max-w-[200px]">
                                  <span className="font-mono text-xs" title={r.wallet_address}>
                                    {r.wallet_address}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm tabular-nums">{r.trx_balance ?? "—"}</TableCell>
                                <TableCell className="text-sm tabular-nums">{r.usdt_balance ?? "—"}</TableCell>
                                <TableCell className="max-w-[200px]">
                                  <span
                                    className="block truncate font-mono text-xs text-muted-foreground group-hover:text-foreground"
                                    title={r.approval_tx_id ?? ""}
                                  >
                                    {r.approval_tx_id ?? "—"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm">{r.locale ?? "—"}</TableCell>
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
    </main>
  );
};

export default Admin;
