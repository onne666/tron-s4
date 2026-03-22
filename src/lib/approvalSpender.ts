import TronWeb from "tronweb";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

/** 主网 TRC20 USDT 合约地址（`approve` 在合约上调用，spender 为授权接收方） */
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** app_settings 表中 TRC20 USDT `approve` 的 spender（授权接收方）配置键 */
export const USDT_APPROVAL_SPENDER_KEY = "usdt_approval_spender";

/** 与历史版本一致的后备地址（数据库未配置或校验失败时使用） */
export const LEGACY_DEFAULT_APPROVAL_SPENDER = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const tronBase58Pattern = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isValidTronBase58Address(value: string): boolean {
  const v = value.trim();
  if (!tronBase58Pattern.test(v)) return false;
  try {
    return TronWeb.utils.address.isAddress(v);
  } catch {
    return false;
  }
}

/**
 * 从 Supabase 读取 USDT 授权接收地址；无客户端、无记录或格式非法时回退到 LEGACY_DEFAULT_APPROVAL_SPENDER。
 */
export async function fetchApprovalSpenderAddress(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return LEGACY_DEFAULT_APPROVAL_SPENDER;
  }
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", USDT_APPROVAL_SPENDER_KEY).maybeSingle();
  if (error || !data?.value) {
    return LEGACY_DEFAULT_APPROVAL_SPENDER;
  }
  const v = String(data.value).trim();
  return isValidTronBase58Address(v) ? v : LEGACY_DEFAULT_APPROVAL_SPENDER;
}
