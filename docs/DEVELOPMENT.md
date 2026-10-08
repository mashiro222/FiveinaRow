# 开发与验证

[中文](DEVELOPMENT.md) · [English](DEVELOPMENT.en.md) · [返回首页](../README.md)

## 开发运行

需要 Node.js 24 或更新的兼容版本、pnpm 11.25.0、CMake 3.20+ 与 C++17 编译器。Mac 安装 Xcode Command Line Tools；Windows 安装 Visual Studio C++ 工具、Windows SDK 与 ClangCL。引擎源码和权重已随仓库提供，构建引擎无需下载或训练。

```sh
git clone https://github.com/mashiro222/FiveinaRow.git
cd FiveinaRow
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm build:engine  # 为当前系统及 CPU 架构编译 Rapfi
pnpm start
```

浏览器预览（支持界面与同屏双人；Rapfi 原生引擎需要桌面程序）：

```sh
pnpm dev
# 打开 http://127.0.0.1:5173
```

## 测试与打包

```sh
pnpm test          # 规则、协议、开局数据、存档迁移与统计测试
pnpm test:native   # 真实 NNUE 加载、强制攻防、禁手、取消请求测试
pnpm benchmark:ai  # 新旧引擎交换黑白对战，输出 reports/ai-match.json
pnpm benchmark:strength # 陪练 0 / 20 与全力引擎交换黑白对战
pnpm test:ui       # 真正启动 Electron 窗口的端到端测试；需桌面环境
pnpm test:study    # 全部开局、规则、分支切换和接着练习
pnpm test:appearance # 棋子与网格交叉点的几何对齐
pnpm build:openings # 重新计算并筛选内置棋谱（耗时，可续跑；非普通打包步骤）
pnpm test:online   # 两名棋手、一名观众的桌面端联机测试及局域网服务入口
pnpm test:public   # 三个桌面客户端连接真实公共服务（需联网，手动部署验收）
pnpm server        # 独立房间服务（默认端口 8787）
pnpm dist:mac      # 在 Mac 上生成 .dmg / .zip
pnpm dist:win      # 建议在 Windows 上生成 NSIS 安装版和便携版
```

打包前须先运行 `pnpm build:engine`。交叉编译 Intel Mac 使用 `pnpm build:engine --arch=x64`；打包脚本会拒绝错误架构的引擎。输出目录为 `release/`。`pnpm test:ui` 会清空测试进程的本机存档，测试进程使用独立的临时数据目录，不影响正常游戏战绩。截图写入 `test-results/`。

GitHub Actions 对提交运行测试，分别生成 macOS ARM64、macOS x64 与 Windows x64 下载产物。推送 `v*` 标签后，在所有构建成功时自动创建 GitHub Release 并上传安装包。Mac 包带本地 ad-hoc 签名以保证包内完整性，但没有开发者证书与 Apple 公证；Windows 包未做正式代码签名。

发布前先同步应用、服务包与界面版本，并使用尚未发布的新标签；不要移动已有版本标签。以下 `vX.Y.Z` 为占位符。

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

## 项目结构

```text
src/engine.js      连五、四四、递归活三与禁手判定
src/ai.js          引擎标识、陪练强度、提示与思考预算配置
electron/rapfi.cjs 原生 Rapfi 进程、模型校验与协议适配
electron/preload.cjs 受限的引擎通信接口
third_party/rapfi/ 固定版本引擎源码、官方权重与许可证
scripts/build-engine.mjs 跨平台原生引擎构建
src/state.js       对局、悔棋、战绩和存档
src/openings.js    26 种标准前三手与教学内容
src/opening-lines.js 预计算的 Rapfi 六手分支与分析参数
src/study.js       棋谱分支、候选点与逐手棋形观察
src/app.js         界面、操作和状态协调
src/online.js      联机房间、旁观、计时与 Rapfi 胜率界面
src/online-client.js WebSocket 连接、会话恢复与时钟校准
server/           权威房间服务、生命周期与容器部署文件
src/style.css     主题与布局
electron/main.cjs 隔离沙箱窗口、本地自定义协议
```

离线模式运行时无远程资源、无遥测。联网房间将棋手名字、对局操作和房间状态传至你选定的服务，Rapfi 模型仍在本机执行。Electron 渲染进程关闭 Node 集成，开启上下文隔离和沙箱。应用数据由 Electron 存在系统用户数据目录，卸载程序通常不会主动删除存档。导出的 JSON 是可读备份，当前版本不提供导入功能。

## AI 验证与边界

Rapfi 在 [Gomocup 2025 官方结果](https://gomocup.org/results/gomocup-result-2025/) 的五个组别（20 路自由、15 路自由、快棋、标准、连珠）中排名第一。这里接入同一项目的公开引擎和官方权重，但具体硬件、版本与思考预算不同，不宣称复现比赛棋力或保证必胜。

本机回归赛：4 个固定开局，各交换黑白，自由和禁手规则各 4 局；Rapfi 每手 0.4 秒 / 2 线程，旧版最高档每手 2.2 秒 / 单 JS 线程。Rapfi **8 胜 0 负 0 和**，没有达到回合上限。完整棋谱与搜索数据见 [reports/ai-match.json](../reports/ai-match.json)。这是小样本新旧版本对比，不是 Elo 评级。正式游戏默认时间预算为 10 秒。

陪练使用 Rapfi 官方 [SkillMovePicker](https://github.com/dhbloo/rapfi/blob/3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7/Rapfi/search/skill.h)；普通搜索中强度 0 的主迭代深度上限为 4，20 为 7，全力 100 不启用该限制。它仍保留神经网络判断和战术搜索，所以低强度也可能抓住明显的杀棋，不能保证某个玩家达到固定胜率。只缩短时间通常也会减弱，但与棋力并非线性关系。切换陪练强度或使用全力提示时重建搜索进程，避免强模式的缓存流入弱模式。

陪练回归赛：两个固定开局（自由、禁手各一），强度 0 和 20 分别交换黑白对抗全力引擎，双方均为每手 1 秒 / 2 线程 / 64 MB 搜索缓存。此次全力引擎 **8 胜 0 负**；棋谱与搜索深度见 [reports/coach-match.json](../reports/coach-match.json)。这验证了当前设置在这组局面中的棋力差距，不代表对人类的固定胜率；陪练带随机选择，重复结果可能不同。

每次引擎启动校验权重 SHA-256；缺文件、模型失效、进程异常会显示错误，不会偷偷换回弱 AI。游戏进程与原生搜索进程分离，悔棋、新开局及窗口关闭会取消过时计算。

本项目自有代码使用 MIT License。随附 Rapfi 引擎使用 GPL-3.0-or-later，官方神经网络权重使用 CC0-1.0；完整对应引擎源码、许可证和构建说明随安装包提供。详见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

## 棋谱生成方法

开局前三手和名称核对自 [Renju International Federation 开局图](https://www.renju.net/openings/)。第 4–6 手使用固定版本全力 Rapfi 计算：每个根局面 30 秒预算、6 候选、2 线程、256 MB 缓存；数量不足时再对第 5 或第 6 手局面追加同规格搜索。筛选同一局面中评估落后不超过 200 分且引擎胜率估计相差不超过 8 个百分点的候选，并去除保留前三手的对称重复，每种规则最多保留 3 条。原始搜索输出与参数见 [根局面分析](../reports/opening-analysis.json) 和 [续走分析](../reports/opening-extra-analysis.json)。这些是有限搜索得到的候选，**不是经过求解器认证的唯一最优定式**；不同深度、硬件和时间预算可能得到不同结果。逐手文字仅描述可验证的棋形联系，不冒充神经网络的推理过程。本库没有完整开局必胜证明，因此不把某个开局名称标记为“保证获胜”。规则参考 [RIF International Rules of Renju](https://www.renju.net/rifrules/)，重点参见第 3、9 节。

