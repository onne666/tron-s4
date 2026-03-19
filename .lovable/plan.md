

## 修改计划：去掉"官方/指定"字眼 + 优化首页布局 + 加入 imToken logo

### 问题分析
1. 页面多处出现"官方指定""Official"等字眼，显得刻意不可信
2. 首页 hero 区的"检测维度 7+"和"检测耗时 3-6s"两个 data-tile 占空间大但信息价值低
3. 页面上没有出现 imToken 的品牌 logo/icon
4. 网站 favicon 也不是 imToken 的 icon

---

### 一、文案去官方化（`resources.ts` 全部 8 种语言）

把所有"官方""指定""Official""Designated"替换为更自然的表述：

| 原文 | 改为 |
|---|---|
| `hero.badge`: "imToken Official" | "imToken Security" |
| `hero.title`: "imToken 官方指定钱包安全检测平台" | "imToken 钱包安全检测平台" |
| `hero.subtitle`: "由 imToken 官方指定合作..." | "基于多维链上风控分析..." (去掉官方指定合作) |
| `hero.partnerBadge`: "imToken 官方指定合作" | "imToken 安全生态" |
| `hero.partnerDesc`: "imToken 专属安全检测服务" | "链上风险分析与钱包安全检测" |
| `guard` 页面中的 "imToken Official" badge | "imToken Security" |
| `trust.points` 中含"官方"的条目 | 改为"imToken 技术驱动"等中性表述 |
| `brand.poweredBy`: "Powered by imToken" | "imToken Security Engine" |

`BrandMark` 组件中的 "imToken Official Security" 也一并改为 "imToken Security"。

同理处理英文、日文、韩文、繁体中文、西班牙、法、德等所有语言。

### 二、移除 stats data-tile，优化 hero 布局（`Index.tsx`）

删除 hero 区域的两个 `data-tile`（检测维度 / 检测耗时）：
- 删除 `hero.stats` 相关的 JSX（第 792-801 行的 grid）
- 删除 `resources.ts` 中所有语言的 `hero.stats` 翻译 key
- hero 区域视觉更简洁，内容聚焦在标题 + 副标题 + partner 条 + CTA 按钮

### 三、加入 imToken logo（`Index.tsx`）

使用 imToken 官方 logo 图片（蓝色圆角方形图标）：
- 在 `BrandMark` 组件中，用 imToken logo 图片替换当前的纯 CSS 菱形图标
- 在 `ImTokenGuardPage` 拦截页中，同样用 imToken logo 替换当前的竖条图标
- 在 `WalletLogo` 组件中也替换为 imToken logo
- logo 来源：使用 imToken 官方公开的 logo URL 或将图片放入 `public/` 目录

### 四、更换网站 favicon（`index.html`）

将 favicon 替换为 imToken 的 icon：
- 下载 imToken logo 存入 `public/imtoken-icon.png`
- 更新 `index.html` 中 `<link rel="icon">` 指向新图标

### 五、SEO meta 去官方化（`index.html`）

- `<title>` 从 "imToken Official Security | ..." 改为 "imToken Security | Wallet Risk Analysis"
- `og:title`、`twitter:title` 同步更新
- `description` 中去掉 "official designated" 等措辞

---

### 涉及文件

| 文件 | 改动 |
|---|---|
| `src/pages/Index.tsx` | 删除 stats grid、替换 BrandMark/WalletLogo/Guard 中的图标为 imToken logo |
| `src/i18n/resources.ts` | 全部语言去官方化文案、删除 stats key |
| `index.html` | 更新 title/meta、favicon |
| `public/` | 新增 imToken logo 图片文件 |

