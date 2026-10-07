# 账号服务自部署

Dayloom 1.3 支持一个共享的 Node.js + SQLite 服务。桌面程序可以独立离线使用；账号、清单、任务、周期规则、完成记录和外观设置保存在你部署的服务中。所有设备须连接同一实例，再登录同一账号。本项目不提供公共账号服务。

## 在本机启动

需要 Node.js **24.15 或更新的 24.x**。桌面便携程序本身不需要 Node.js，同步服务需要。

在项目目录打开 PowerShell：

```powershell
npm ci
npm run build
npm run server
```

已有构建产物时，直接双击根目录的 `启动同步服务.cmd`，或执行 `npm run server`。窗口保持运行期间服务可用；按 Ctrl+C 停止。默认只监听本机 `127.0.0.1:4318`。

打开桌面程序的「设置 → 账号与同步」，服务地址填 `http://127.0.0.1:4318`，选择「注册账号」。用户名为 3–32 位字母、数字或 `._-`，大小写不敏感；密码为 10–128 个字符。昵称可选。

浏览器可直接打开 `http://127.0.0.1:4318`；页面和 API 使用同一个服务。`http://127.0.0.1:4318/api/health` 返回服务名、版本和注册状态。开发时 `npm run dev` 将 `/api` 转发到本机 4318 端口。

## 同一局域网的多台设备

在准备长期开机的主机上运行：

```powershell
$env:DAYLOOM_HOST = '0.0.0.0'
npm run server
```

查看该主机的局域网 IP，例如 `192.168.1.10`。所有设备在设置中填写 **`http://192.168.1.10:4318`**，再登录同一账号；另一台设备不能使用 `127.0.0.1`。主机防火墙需要允许专用网络访问 TCP 4318。建议为主机固定局域网地址。

第一次部署使用可信局域网；HTTP 不加密传输。需要在不可信网络使用时，由反向代理提供 HTTPS，再统一使用 HTTPS 地址连接。此次实现不包含公网部署。

## Docker Compose

需要已运行的 Docker Engine / Docker Desktop：

```powershell
docker compose up -d --build
docker compose ps
docker compose logs --tail=30 dayloom
```

默认只向本机开放 4318。为局域网开放时，在项目根目录创建 `.env`：

```dotenv
DAYLOOM_BIND_ADDRESS=0.0.0.0
DAYLOOM_REGISTRATION=true
```

然后重新执行 `docker compose up -d`。服务自动重启，数据保存在 `dayloom-data` 命名卷中。更新时先备份，再执行 `docker compose up -d --build`；常规停止使用 `docker compose stop`。不要使用 `docker compose down -v`，它会删除账号数据卷。

## 配置

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DAYLOOM_HOST` | `127.0.0.1` | Node 服务监听地址；容器内固定为 `0.0.0.0` |
| `DAYLOOM_PORT` | `4318` | Node 服务端口；Compose 对外端口在 YAML 中配置 |
| `DAYLOOM_DATA_DIR` | `server-data` | SQLite 数据目录；容器使用 `/data` |
| `DAYLOOM_REGISTRATION` | `true` | 设为 `false` 禁止新账号注册，已有账号仍能登录 |
| `DAYLOOM_ALLOWED_ORIGINS` | 本机 Vite 的两个来源 | 允许访问 API 的额外网页来源，逗号分隔；服务自身网页自动允许 |
| `DAYLOOM_BIND_ADDRESS` | `127.0.0.1` | Compose 对外绑定地址 |

Node 不自动读取 `.env`；可以在 PowerShell 中设置 `$env:变量名`，或使用 `node --env-file=.env server/index.mjs`。Compose 自动读取项目 `.env`。服务地址必须是协议、主机与端口，暂不支持部署到 URL 子路径。

完成自己需要的账号注册后，可关闭注册并重启服务。密码修改入口在「账号与同步」中；修改后其他设备的会话失效，重新登录继续同步。会话有效期为 30 天，桌面重启可恢复登录；浏览器凭据保存在当前标签页的会话存储中。

## 数据与备份

服务端 `dayloom.sqlite` 包含所有账号、加盐密码摘要、会话摘要与同步数据，不依赖第三方数据库。SQLite 使用 WAL。

Node 版本的完整备份：

1. 在服务窗口按 Ctrl+C，确认服务已退出。
2. 将整个 `server-data`（或自定义 `DAYLOOM_DATA_DIR`）复制到独立备份目录，包含可能存在的 `-wal` 和 `-shm` 文件。
3. 重新执行 `npm run server`。

Docker 版本的完整备份：

```powershell
docker compose stop dayloom
New-Item -ItemType Directory -Force backups | Out-Null
docker compose cp dayloom:/data ./backups/dayloom-data
docker compose start dayloom
```

每次使用新的备份目录，避免把不同时间的数据库文件混在一起。恢复时先关闭所有客户端、停止服务，保留一份现有目录，将完整备份恢复到原数据目录，再启动服务。恢复到较早备份后，各客户端先导出自己的 JSON 备份并退出账号；把数据目录里的 `accounts` 缓存文件移到另一个目录，再重新登录，以免旧版本号和待重试请求混入恢复后的服务。需要的后续修改可以通过客户端 JSON 备份导入。

客户端也可在「设置 → 导出备份」单独导出当前账号的数据。桌面账号缓存位于 `%APPDATA%\拾序\accounts`，访客任务位于 `%APPDATA%\拾序\shixu-data.json`。退出账号保留各自缓存，恢复访客空间。不要把 Windows 加密的 `account-session.json` 复制到其他设备作为登录方式。

## 同步行为

- 修改立即写入本机，约 0.7 秒后尝试上传；在线设备每 15 秒拉取变化，回到窗口和网络恢复时也会同步。
- 服务停止时仍可编辑已登录账号的缓存。状态显示「离线 · 待同步」，服务恢复后自动重试。
- 首次登录可以勾选「将本机任务合并到账号」，默认关闭，未修改的任务示例不会导入。原本机空间仍保留。
- 不同字段修改会合并；同一字段冲突保留服务器内容，并把另一份内容保存为收集箱里的冲突副本。删除的原记录不会被旧快照直接恢复。
- 周期打卡合并两台设备各自增加的次数；请求丢失后的重试不会重复打卡。两台设备各点一次代表两次打卡。
- 账号服务暂不包含邮件找回密码、社交登录、多人共享清单或服务端推送提醒。桌面提醒仍由运行中的客户端负责。

## 验证

```powershell
npm test
npm run test:accounts:desktop
node tests/accounts-browser-smoke.mjs
```

第二条命令自动启动临时服务及两个独立桌面进程，验证注册登录、自动同步、离线重连、完成删除、重启登录和访客隔离，不接触你的真实数据目录。第三条命令验证普通 HTTP 网页和两个隔离浏览器空间；Windows 使用已安装的 Edge，其他系统需要 Playwright 的 Chromium。
