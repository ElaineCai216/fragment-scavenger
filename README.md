# 碎片拾荒者 · Fragment Scavenger 🪙

不按时间，按感觉。一个私人碎片备忘录：电影票根的照片、一句书摘、一段街边的声音、一首歌的链接……随手丢进去，按「氛围」收好。搜索「治愈」，所有带着治愈感的碎片会像幻灯片一样慢慢播放，配着合成的钢琴曲。

## 功能

- **四种碎片**：文字 / 照片 / 语音（转文字 + 保留原声）/ 链接（自动抓标题简介）
- **按感觉组织**：固定十词氛围库（治愈·孤独·浪漫·热烈·平静·怀念·好奇·疲惫·明亮·荒诞）+ 可扩展自定义词；一片碎片可有 1–3 个氛围
- **AI 识别氛围（可选）**：接好 Cloudflare Worker 后，AI 自动判断氛围（能看图），可手动改；未配置时手动选择，其余功能照常
- **碎片墙**：按氛围分组的剪贴簿，组内随机排列；「拾一片」随机抽一张
- **搜索**：氛围词 + 全文（书摘、备注、语音转写、链接标题）都能搜；结果进入全屏幻灯片
- **幻灯片**：自动播放（8 秒/片）+ 可暂停/翻页，每片按氛围配纸色墨色；Web Audio 合成钢琴曲（C–G–Am–F 循环），离线可用
- **剪贴簿视觉**：旧纸纹理、胶带、印章式氛围标签、手写体；动态背景 = 缓慢光影呼吸 + 随时间变化的色温（清晨冷 → 黄昏暖 → 深夜沉静）；点击有合成音效
- **纯本地 + 备份**：数据存在浏览器 IndexedDB（照片/语音也存本地），一键导出/导入单文件 JSON 备份
- **零外部资源**：字体、声音、背景全部本地生成，离线可用；手机优先的响应式布局

## 使用

```bash
npm install
npm run dev        # 本地预览 http://localhost:5173
npm test           # 单元测试
npm run build      # 构建到 dist/（相对路径，可部署到任意静态托管）
npm run preview    # 本地预览构建产物
```

自检：打开 `index.html?selftest`（开发时 `http://localhost:5173/?selftest`）。

## 启用 AI（可选）

1. 部署 Worker：

   ```bash
   cd worker
   npx wrangler login
   npx wrangler deploy        # 创建 fragment-scavenger-ai worker
   ```

2. 配置密钥与变量：

   ```bash
   npx wrangler secret put API_KEY     # 大模型 Key（OpenAI 兼容接口）
   ```

   | 变量 | 默认 | 说明 |
   | --- | --- | --- |
   | `BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容接口地址 |
   | `MODEL` | `gpt-4o-mini` | 视觉/文本模型（需要支持图片） |
   | `TRANSCRIBE_MODEL` | `whisper-1` | 语音转写模型 |
   | `ALLOWED_ORIGIN` | 空（允许所有） | 限制允许的前端来源，逗号分隔 |

3. 打开网站 → ⚙ 设置 → 填 Worker 地址 → 测试连接。

> Key 只存在 Cloudflare 服务端；未配置时网站自动回落为纯手动模式：氛围手动选、语音只存原声、链接只存网址。

## 部署到 GitHub Pages

```bash
npm run build
```

把 `dist/` 内容（或直接把本目录作为根目录的静态站）推送到 GitHub Pages 即可；构建产物使用相对路径，可放在子路径下。

## 目录结构

```
fragment-scavenger/
├── index.html        # 页面骨架（Vite 入口）
├── src/
│   ├── main.js       # 主逻辑（墙 / 添加 / 设置 / 幻灯片）
│   ├── style.css     # 剪贴簿视觉 + 动态背景
│   ├── mood.js       # 氛围词库与主题色
│   ├── search.js     # 搜索（氛围 + 全文）
│   ├── backup.js     # 备份导出/导入（纯函数）
│   ├── store.js      # IndexedDB / localStorage
│   ├── media.js      # 图片压缩、Blob/DataURL
│   ├── audio.js      # Web Audio 钢琴曲与音效
│   ├── background.js # 时间色温 + 光影呼吸
│   ├── api.js        # Worker 调用
│   └── selftest.js   # 内置自检
├── tests/            # Vitest 单元测试
├── worker/
│   ├── index.js      # Cloudflare Worker（/analyze /transcribe /fetch /health）
│   └── wrangler.toml
└── README.md
```

## 数据与隐私

- 碎片与照片/语音全部存在当前浏览器（IndexedDB），不上传任何地方；AI 识别时只把当片碎片发给 Worker 转发给模型。
- 建议定期「设置 → 导出备份」，把 JSON 备份文件存到本地。
