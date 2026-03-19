

## 计划：基于链上数据的真实风险检测逻辑

### 当前状态
`buildRiskReport` 函数（112-167 行）纯粹根据地址字符哈希值决定安全/风险，没有使用任何链上数据。但 `connectWallet` 已经获取了 `trxBalance` 和 `usdtBalance`。

### 改动内容

**文件：`src/pages/Index.tsx`**

1. **将 `buildRiskReport` 改为异步函数**，接收 wallet 对象（含 address、trxBalance、usdtBalance）

2. **在扫描阶段调用 TronGrid API 获取交易历史**：
   - `https://api.trongrid.io/v1/accounts/{address}` — 获取账户信息（创建时间、是否存在）
   - `https://api.trongrid.io/v1/accounts/{address}/transactions` — 获取最近交易记录

3. **高风险判定规则**（满足任一即为 risk）：
   - 账户不存在（新地址，无任何链上记录）
   - TRX 余额为 0（无资金）
   - 无交易记录
   - 最近一笔交易距今超过 180 天
   - USDT 余额 < 100

4. **更新 scanning useEffect**：将 `buildRiskReport(wallet.address)` 替换为 `await buildRiskReport(wallet)`，在 API 请求完成后再出结果（保留最低 4.2s 的扫描动画时间）

5. **API 请求失败时的降级**：如果 TronGrid 请求失败，默认判定为高风险

### 技术细节

```text
高风险条件（OR 关系）：
├── 账户不存在 (API 返回空)
├── TRX 余额 = 0
├── 交易记录为空
├── 最后交易时间 > 180 天前
├── USDT 余额 < 100
└── API 请求失败（降级为高风险）
```

仅修改 `buildRiskReport` 函数和 scanning useEffect，其余逻辑不变。

