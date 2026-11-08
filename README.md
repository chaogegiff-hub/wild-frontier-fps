# 荒野前线 · Wild Frontier FPS

从原站工程恢复的完整网页版 3D FPS。部署入口为 `dist/index.html`，包含约 246 MB 的本地资源，模型、材质和音效随工程提供，无需从外部 CDN 下载。

## 包含内容

- 起伏山地、湖泊、河流、海岸、村落与可进入房屋。
- 带骨骼和走跑动作的人物模型，12 名 AI 敌人。
- M700 狙击枪、GL-6 榴弹炮、AKM 步枪模型、瞄具、持枪手臂与布手套。
- 可驾驶越野车、车辆碰撞、水花、轮胎印和排气。
- 本地摄影材质、2K 材质升级、HDR 环境与动态阴影。
- 电脑键鼠和手机触控操作，首次启动需要下载战场资源。

这是恢复出的原 2.22 工程，不是后来的简化 2D 兼容试玩。它仍是网页版游戏工程，不代表已达到商业 3A 成品质量。新的分角色配音尚未制作完成；当前保留原工程的环境声、枪声、脚步和交互音效。

## GitHub Pages 部署

1. 将此工程内容提交到仓库 `main` 分支，保留 `dist`、`scripts`、`package.json` 和 `.github/workflows/pages.yml`。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 打开 **Actions → Publish Wild Frontier → Run workflow**，等待部署完成。后续推送 `main` 会自动更新。
4. 在线地址以成功的 Actions 部署结果为准，支持 GitHub 项目站点的子路径。

GitHub Free 使用公开仓库发布 Pages；私有仓库是否支持 Pages 取决于 GitHub 计划。模型、照片及其他资产的原有版权与授权说明均保留在工程中。

## 本地预览

在此目录运行 `python -m http.server 8000 --directory dist`，浏览器访问 `http://localhost:8000`。iPhone 请用 Safari 打开 HTTPS 在线地址，建议横屏。

## 检查与素材来源

- `node scripts/check-static.mjs`：无依赖检查游戏模块语法、项目站点相对路径、3D 模型及其纹理/几何依赖。
- `node scripts/check.mjs`：原工程 70 项玩法与场景检查，先运行 `npm install` 安装开发依赖。
- `ORIGINAL-CHANGELOG.md`：恢复工程原有的实现、检查范围与限制说明。
- `dist/ASSET-CREDITS.txt`、`sources/` 及模型目录中的 `SOURCE.md`/`LICENSE.md`：素材来源和授权。
