# 弈间 · Five in a Row

一方棋盘，万般可能。一个中文界面的五子棋桌面游戏，支持离线游玩与好友联机，适用于 macOS 与 Windows。

![弈间主界面](assets/screenshot.png)

## 下载游玩

在 [Releases](https://github.com/mashiro222/FiveinaRow/releases) 下载对应平台的安装包：

- **Apple Silicon Mac（M 系列芯片）**：`mac-arm64.dmg`，打开后把游戏拖到 Applications。
- **Intel Mac**：`mac-x64.dmg`。
- **Windows 64 位**：`.exe` 安装包或便携版。安装包文件名带 `Setup`，便携版带 `Portable`。

当前版本未购买开发者签名证书，也未做 Apple 公证。macOS 首次运行若被 Gatekeeper 拦截，请在尝试打开后，进入「系统设置 → 隐私与安全性 → 仍要打开」。Windows 可能显示 SmartScreen 提示。不要关闭系统的全局安全保护。

所有棋盘、字体回退、音效、AI 与棋谱均在应用内；离线模式无需网络，所有模式均无需账号。

**v1.2.3 公共棋室**：已内置免费的公网房间服务。打开「联机房间」，一人创建房间，朋友输入四位房号即可异地对弈或旁观；旧版保存过局域网地址的玩家可点击「使用公共棋室」。免费服务休眠后首次连接可能需要约一分钟，游戏会自动等待和重试；平台重启会清空房间。同一 Wi-Fi 下仍可开启局域网服务。详见 [联机与部署说明](docs/ONLINE.md)。

## 功能

- **同屏双人**：两人在一台电脑上轮流落子。
- **好友联机**：四位房间号，两个取名入座的棋手席位，其余人可旁观。禁手可选，每手 30 秒 / 60 秒 / 2 分钟；双方准备后开局。服务端判定规则与超时，断线自动重连，空房间 10 分钟后清除。
- **联机胜率分析**：每次落子后由本机 Rapfi 更新黑白局势估计，可以隐藏；使用独立进程，不展示推荐落点、不代下。它不代表保证胜率，也不混入人机胜负统计。
- **Rapfi 神经网络 AI**：使用 [Rapfi](https://github.com/dhbloo/rapfi) 原生引擎与[官方预训练 Mix9SVQ NNUE 权重](https://github.com/dhbloo/rapfi-networks)，完全离线，CPU 多线程运行。不再划分难度，始终全力搜索。每手思考预算可选 10 / 30 / 60 秒（默认 10 秒）；确定应手时会提前落子。提示、开局练习也使用同一引擎。
- **本机战绩**：统计与 Rapfi 的胜、负、和与胜率；保留最近 1,000 局，可复盘、导出 JSON。旧 AI 历史保留，不计入 Rapfi 胜率；升级时未完成的旧 AI 对局转为练习局。
- **四套主题**：松间木纹、课间草稿纸、夜阑石板、竹影浅青。棋盘、背景、棋子可独立搭配。草稿纸使用 ×（黑）和 ○（白）。音效和手数可关闭。
- **棋盘大小**：13 × 13、15 × 15、19 × 19；15 路为标准大小。Rapfi 的禁手权重仅支持 15 路，人机禁手对局固定为 15 路。同屏双人在其他尺寸上的禁手属于休闲扩展。
- **26 种经典开局**：直指与斜指各 13 种，提供前三手、先手思路、后手应对、教学续走和逐步演示；可执黑或执白接着与 AI 练习。
- **可选黑棋禁手**：三三、四四、长连。区分同一活四的两个成五点、同方向多个四、断三、假三，以及延伸点本身形成禁手的情况。
- **辅助功能**：悔棋、落子提示、认输、胜利连线、键盘方向键移动焦点、Enter / Space 落子。

## 规则与统计口径

自由规则下，双方连续五子或更多即获胜。启用禁手后，黑棋必须恰好连五，白棋连五及长连均胜。黑棋同时形成恰好五连时，按 RIF 第 9.2 条优先判胜。活三判定递归检验扩展为活四的落点是否合法。禁手落点被拦截，玩家可以重新选点，**不是比赛中落下禁手直接判负的处罚方式**。如黑棋无合法落点则判负。

本应用使用自由落子开局，**没有实施三手交换、五手两打、Swap2 或其他比赛开局协议**，因此不称为完整的 RIF 竞赛模式。

正式胜率 = 正式胜局 ÷ 正式对局数（含和棋）。使用提示、悔棋、开局练习的对局标记为练习，不计正式胜率。同屏双人不计 AI 战绩。认输计入结果；放弃未结束的对局并新开一局不计胜负。Rapfi 胜率汇总不同执子、尺寸、禁手设置和思考预算，历史记录保留这些信息及模型标识。旧版 AI 胜负仅在历史中展示。旧版 13 / 19 路禁手存档仍保留，但继续使用新引擎需要新开 15 路对局。

开局前三手和名称核对自 [Renju International Federation 开局图](https://www.renju.net/openings/)。第 4–6 手及文字建议是自编教学示例，**不是经过求解器认证的最优定式**。本库没有完整开局必胜证明，因此不把某个开局名称标记为“保证获胜”。规则参考 [RIF International Rules of Renju](https://www.renju.net/rifrules/)，重点参见第 3、9 节。

## 开发运行

需要 Node.js 24 或更新的兼容版本、pnpm 11.25.0、CMake 3.20+ 与 C++17 编译器。Mac 安装 Xcode Command Line Tools；Windows 安装 Visual Studio C++ 工具、Windows SDK 与 ClangCL。引擎源码和权重已随仓库提供，构建引擎无需下载或训练。

```sh
npm install -g pnpm@11.25.0
pnpm install
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
pnpm test:ui       # 真正启动 Electron 窗口的端到端测试；需桌面环境
pnpm test:online   # 两名棋手、一名观众的桌面端联机测试及局域网服务入口
pnpm test:public   # 三个桌面客户端连接真实公共服务（需联网，手动部署验收）
pnpm server        # 独立房间服务（默认端口 8787）
pnpm dist:mac      # 在 Mac 上生成 .dmg / .zip
pnpm dist:win      # 建议在 Windows 上生成 NSIS 安装版和便携版
```

打包前须先运行 `pnpm build:engine`。交叉编译 Intel Mac 使用 `pnpm build:engine --arch=x64`；打包脚本会拒绝错误架构的引擎。输出目录为 `release/`。`pnpm test:ui` 会清空测试进程的本机存档，测试进程使用独立的临时数据目录，不影响正常游戏战绩。截图写入 `test-results/`。

GitHub Actions 对提交运行测试，分别生成 macOS ARM64、macOS x64 与 Windows x64 下载产物。推送 `v*` 标签后，在所有构建成功时自动创建 GitHub Release 并上传安装包。Mac 包带本地 ad-hoc 签名以保证包内完整性，但没有开发者证书与 Apple 公证；Windows 包未做正式代码签名。

```sh
git tag v1.2.3
git push origin v1.2.3
```

## 项目结构

```text
src/engine.js      连五、四四、递归活三与禁手判定
src/ai.js          引擎标识与思考预算配置
electron/rapfi.cjs 原生 Rapfi 进程、模型校验与协议适配
electron/preload.cjs 受限的引擎通信接口
third_party/rapfi/ 固定版本引擎源码、官方权重与许可证
scripts/build-engine.mjs 跨平台原生引擎构建
src/state.js       对局、悔棋、战绩和存档
src/openings.js    26 种开局与教学内容
src/app.js         界面、操作和状态协调
src/online.js      联机房间、旁观、计时与 Rapfi 胜率界面
src/online-client.js WebSocket 连接、会话恢复与时钟校准
server/           权威房间服务、生命周期与容器部署文件
src/style.css     主题与布局
electron/main.cjs 隔离沙箱窗口、本地自定义协议
```

离线模式运行时无远程资源、无遥测。联网房间将棋手名字、对局操作和房间状态传至你选定的服务，Rapfi 模型仍在本机执行。Electron 渲染进程关闭 Node 集成，开启上下文隔离和沙箱。应用数据由 Electron 存在系统用户数据目录，卸载程序通常不会主动删除存档。导出的 JSON 是可读备份，当前版本不提供导入功能。

## AI 验证与边界

Rapfi 在 [Gomocup 2025 官方结果](https://gomocup.org/results/gomocup-result-2025/) 的五个组别中排名第一。这里接入同一项目的公开引擎和官方权重，但具体硬件、版本与思考预算不同，不宣称复现比赛棋力或保证必胜。

本机回归赛：4 个固定开局，各交换黑白，自由和禁手规则各 4 局；Rapfi 每手 0.4 秒 / 2 线程，旧版最高档每手 2.2 秒 / 单 JS 线程。Rapfi **8 胜 0 负 0 和**，没有达到回合上限。完整棋谱与搜索数据见 [reports/ai-match.json](reports/ai-match.json)。这是小样本新旧版本对比，不是 Elo 评级。正式游戏默认时间预算为 10 秒。

每次引擎启动校验权重 SHA-256；缺文件、模型失效、进程异常会显示错误，不会偷偷换回弱 AI。游戏进程与原生搜索进程分离，悔棋、新开局及窗口关闭会取消过时计算。

本项目自有代码使用 MIT License。随附 Rapfi 引擎使用 GPL-3.0-or-later，官方神经网络权重使用 CC0-1.0；完整对应引擎源码、许可证和构建说明随安装包提供。详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
