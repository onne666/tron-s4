

## 修改计划：imToken 专属化改造

### 目标
1. 仅支持 imToken 钱包，移除 TronLink / TokenPocket / Trust Wallet
2. 非 imToken 浏览器环境下拦截访问，显示引导页
3. 页面品牌重塑，突出与 imToken 的官方合作/指定关系

---

### 一、imToken 环境检测与拦截

在 `Index.tsx` 顶层增加 imToken 浏览器检测逻辑：
- 通过 `navigator.userAgent` 检测是否包含 `imToken` 标识
- 若非 imToken 环境，渲染一个全屏拦截页面，显示 imToken logo、提示文案（"本页面仅限在 imToken 钱包浏览器中访问"），以及一个"在 imToken 中打开"的引导按钮（使用 imToken 的 deep link 跳转）
- 拦截页面需要多语言支持，在 `resources.ts` 中添加对应翻译

### 二、移除多钱包支持

**`Index.tsx`：**
- 删除 `SUPPORTED_WALLETS` 数组和 `WalletSupportStrip` 组件
- 删除 `WalletLogo` 中 tronlink / tokenpocket / trust 的分支，仅保留 imtoken
- 移除页面中 `<WalletSupportStrip />` 的渲染
- `connectWallet` 函数保持原有 `window.tronWeb` 逻辑不变（imToken 内置的 DApp 浏览器也注入 tronWeb）

**`resources.ts`：**
- 删除 `walletSupport` 相关的所有翻译 key
- 添加拦截页面翻译 key（`guard.title` / `guard.description` / `guard.openInImToken`）

### 三、品牌重塑 — 突出 imToken 官方合作

**`BrandMark` 组件改造：**
- 将品牌名从 "Tron Secure Engine™" 改为体现 imToken 官方指定的表述，例如 "imToken Official Security"
- 副标题改为 "Powered by imToken"

**Hero 区域文案调整（`resources.ts`）：**
- 标题：突出 "imToken 官方指定安全检测平台" 的定位
- 副标题：强调由 imToken 官方合作提供的链上风险分析服务
- Badge 文案：从通用的 "Wallet security scan" 改为 "imToken Official"

**新增 imToken 合作标识区块：**
- 在 hero 下方或检测区上方，新增一个合作背书条，显示 "imToken 官方指定合作" 徽章
- 使用与 imToken 品牌一致的视觉元素（蓝色调）

**页面标题和 SEO（`index.html`）：**
- `<title>` 改为包含 imToken 的描述
- 更新 og:title、og:description、meta description

### 四、视觉风格微调

- 考虑将主色调往 imToken 品牌蓝（#0880EA 或类似色）靠拢
- `tailwind.config.ts` 或 `index.css` 中调整 `--primary` 色值
- 拦截页面使用 imToken 蓝作为主视觉

---

### 涉及文件

| 文件 | 改动内容 |
|---|---|
| `src/pages/Index.tsx` | 环境拦截、移除多钱包、品牌重塑 |
| `src/i18n/resources.ts` | 新增拦截页翻译、删除多钱包翻译、更新品牌文案（8 种语言） |
| `index.html` | 更新 title / meta 标签 |
| `src/index.css` | 主色调调整（可选） |
| `tailwind.config.ts` | 色值变量调整（可选） |

