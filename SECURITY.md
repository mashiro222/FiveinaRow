# 安全说明 · Security

## 报告问题 / Reporting a vulnerability

请使用仓库 **Security → Report a vulnerability** 私下报告安全问题，附上受影响版本、系统和复现步骤。不要在公开 Issue 中粘贴会话令牌、私钥、账号凭据或可被立即滥用的细节。普通游戏问题可以提交 Issue。

Use **Security → Report a vulnerability** for private security reports, including the affected version, operating system and reproduction steps. Do not put session tokens, private keys, credentials or immediately exploitable details in public issues. Ordinary gameplay bugs can be reported through Issues.

## 范围 / Scope

优先修复最新版本；历史版本不承诺单独维护。安装包没有 Apple 公证或 Windows 正式代码签名。请只从本仓库 Releases 获取发布文件。

Fixes target the latest version; separate maintenance of older releases is not promised. Packages are not Apple-notarized or Windows code-signed. Obtain releases from this repository's Releases page.

离线数据留在本机。联网房间使用随机会话令牌恢复席位；四位房间号不是访问密码，任何知道房号的人都可以进入旁观。公网服务应使用 `wss://`。内置公共服务是用于朋友间游玩的免费实例，不承诺可用性或对局持久化。

Offline data stays local. Online rooms use random session tokens for seat recovery; four-digit room codes are not access passwords, and anyone who knows a code can join as a spectator. Public services should use `wss://`. The built-in free service is intended for casual games and provides no availability or game-persistence guarantee.

## 公开前检查 / Pre-publication review

检查日期：2026-10-07。覆盖应用与房间服务的主要输入边界、Electron 隔离配置、仓库全部可达 Git 历史的常见凭据模式、依赖告警、许可证材料和发布产物。未发现需要在公开前清理的凭据或个人文件路径。此检查不等同于独立安全审计，也不能保证不存在漏洞。

Reviewed on 2026-10-07: key application and server input boundaries, Electron isolation settings, common credential patterns across all reachable Git history, dependency advisories, license materials and release artifacts. No credentials or personal filesystem paths requiring removal were found. This is not an independent security audit or a guarantee that vulnerabilities are absent.

### 已知开发依赖告警 / Known development dependency advisory

`pnpm audit --prod` 未报告运行时依赖漏洞。完整依赖树报告 `sprintf-js@1.1.3` 的一项中等风险告警：[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)，上游目前没有已发布的修复版本。

该包经 `electron-builder → app-builder-lib → @electron/get → global-agent → roarr` 用于构建期代理日志，不随游戏的运行时依赖或独立房间服务发布。已检查此调用链：代理日志的格式字符串为固定文本，外部值作为结构化字段传入；未发现游戏输入到达受影响格式字符串的路径。保留此告警供后续升级核对，不将它静默忽略。

`pnpm audit --prod` reported no runtime dependency advisories. The full dependency tree reports one moderate advisory for `sprintf-js@1.1.3`: [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), with no upstream patched release currently listed.

This dependency comes through `electron-builder → app-builder-lib → @electron/get → global-agent → roarr` for build-time proxy logging. It is not shipped as a runtime dependency of the game or standalone room service. The inspected proxy logging calls use constant format strings with external values in structured fields; no path from game input to the affected format strings was found. The advisory is documented rather than suppressed and should be rechecked when updating the build tools.

```sh
pnpm audit --prod
pnpm audit
```
