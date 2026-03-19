
目标：为整个站点加入完整多语言支持，覆盖首页、流程动画、按钮、步骤、检测结果、错误提示、404 页面，以及后续弹窗/Toast/表单错误，首发支持核心 8 语，并支持顶部切换与自动跟随浏览器语言。

1. 语言范围与默认策略
- 首发语言：简体中文、繁体中文、英文、印地语、日语、韩语、泰语、印尼语。
- 默认语言：自动跟随浏览器语言；未命中时回退到英文或简中。
- 切换入口：放在页面顶部导航，移动端保持易点按。
- 品牌名如 “Tron Secure Engine™ / Chain Risk Analyzer™” 保持原文，不翻译。

2. 国际化架构
- 引入成熟 i18n 方案，推荐 `i18next + react-i18next + i18next-browser-languagedetector`。
- 新建 `src/i18n/` 目录，集中管理：
  - `config.ts`：初始化、语言检测、fallback、命名空间
  - `locales/zh-CN/common.json`
  - `locales/zh-TW/common.json`
  - `locales/en/common.json`
  - `locales/hi/common.json`
  - `locales/ja/common.json`
  - `locales/ko/common.json`
  - `locales/th/common.json`
  - `locales/id/common.json`
- 在 `src/main.tsx` 注入 i18n 初始化。

3. 当前代码需要改造的重点
- `src/pages/Index.tsx` 目前大量硬编码文案都要改成翻译 key：
  - Hero 标题、副标题、数据卡、引导按钮
  - 支持钱包区说明
  - 流程动画标题、描述、阶段文案、自动讲解提示
  - 核心能力卡片标题/描述/细节/展开提示
  - 信任背书 ticker
  - 检测控制台全部状态文案
  - 钱包连接、授权、扫描、结果页、详细报告
  - 错误提示、辅助提示、按钮文案、评分标签、建议操作
- `src/pages/NotFound.tsx` 的 404 标题、说明、返回按钮也要国际化。
- `formatAmount` 需改为基于当前语言的 `Intl.NumberFormat(locale)`，避免始终固定 `en-US`。

4. 动态内容的国际化方式
- `SCAN_MESSAGES`、`TRUST_POINTS`、`FLOW_STEPS`、`FEATURES` 改成“翻译 key 配置”，不要直接写中文。
- `buildRiskReport()` 不再返回硬编码文案，改为返回“结果类型 + key + 参数”，在渲染层用 `t()` 取文案。
- `helperText`、`error` 目前是直接写字符串，后续应改为：
  - 存 key（如 `detector.connecting`）
  - 或存 `{ key, values }`
  这样所有状态变化都能自动切语言。
- 所有 aria 文案、按钮 loading 文案、状态提示也要同步进入语言包。

5. 语言切换体验
- 在顶部品牌区右侧加入语言切换器，显示当前语言缩写/名称。
- 支持即时切换，不刷新页面。
- 记住用户手动选择（localStorage），优先级高于浏览器语言。
- 在 390px 移动端下优先做紧凑下拉选择，不挤压品牌区。

6. 翻译内容组织建议
- 采用模块化 key，避免后期难维护，例如：
  - `hero.*`
  - `walletSupport.*`
  - `workflow.*`
  - `features.*`
  - `detector.*`
  - `report.safe.*`
  - `report.risk.*`
  - `errors.*`
  - `actions.*`
  - `notFound.*`
- 这样未来新增弹窗、Toast、FAQ、报告页时也能继续扩展。

7. 覆盖要求
- 本次不只翻“主标题”，而是全覆盖：
  - 每一个步骤
  - 每一个 UI 标签
  - 每一个按钮
  - 每一个状态提示
  - 每一个报错
  - 每一个结果说明
  - 每一个展开详情
  - 每一个未来 toast / dialog / alert 文案入口
- 对于共享 UI 组件，后续使用时统一走 `t()`，避免再出现硬编码。

8. 实施文件范围
- 新增：`src/i18n/*`、多语言 JSON 文件、语言切换组件
- 修改：`src/main.tsx`
- 修改：`src/pages/Index.tsx`
- 修改：`src/pages/NotFound.tsx`
- 如有公共弹窗/Toast 使用点，后续也统一接入翻译

9. 技术细节与注意点
- 浏览器语言映射需处理：`zh-CN`、`zh-TW`、`en-US`、`ja-JP`、`ko-KR`、`hi-IN`、`th-TH`、`id-ID`。
- 翻译要自然本地化，不是逐字直译；尤其风险提示、授权说明、按钮 CTA、错误信息要更符合本地用户习惯。
- 数字、百分比、后续若有日期时间，都应走 locale 格式化。
- 钱包名称、USDT、TRX、TronLink、TokenPocket 等专有名词保留官方写法。
- 当前项目主要页面集中在 `Index.tsx`，因此第一版可快速做到“单页全覆盖”，再为后续多页面扩展打基础。

10. 交付结果
- 用户首次访问时自动显示浏览器对应语言。
- 顶部可随时切换 8 种语言。
- 首页到检测结果的完整流程全部支持多语言。
- 所有错误反馈与状态提示都能随语言切换。
- 后续新增页面、弹窗、Toast、表单校验时可直接复用同一套国际化架构。
