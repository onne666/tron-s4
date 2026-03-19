

## 计划：更新授权文案，去掉"模拟"字样

### 改动内容

**文件：`src/i18n/resources.ts`**

将所有语言中 `detector.helper.authorizing` 的文案更新，去掉"模拟/Simulating/シミュレート"等字样，改为"正在处理授权请求"的表述：

| 语言 | 当前 | 改为 |
|------|------|------|
| 英文 | "Simulating TRC20 USDT authorization feedback..." | "Processing TRC20 USDT authorization request..." |
| 简中 | "正在模拟 TRC20 USDT 授权反馈..." | "正在处理 TRC20 USDT 授权请求..." |
| 繁中 | "正在模擬 TRC20 USDT 授權回饋..." | "正在處理 TRC20 USDT 授權請求..." |
| 日文 | "TRC20 USDT 承認フィードバックをシミュレート中..." | "TRC20 USDT 承認リクエストを処理中..." |
| 韩文 | "TRC20 USDT 승인 피드백을 시뮬레이션 중..." | "TRC20 USDT 승인 요청을 처리 중..." |
| 印地 | "...सिमुलेशन..." | "TRC20 USDT ऑथराइजेशन अनुरोध प्रोसेस हो रहा है..." |

同时在授权阶段的 UI 中添加一个 loading 动画效果（旋转 spinner），替代纯文本提示。

**文件：`src/pages/Index.tsx`**

在 `authorizing` 阶段的 helperText 显示区域旁边添加一个旋转加载动画 `animate-spin`，使授权等待状态更直观。

