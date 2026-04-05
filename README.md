# question_bank_auto

一个把教材/试卷 PDF 页图逐步结构化为题库 JSON 的工具系统。

当前项目已经从“纯本地文件工具”演进到“本地开发方便 + 云服务器可稳定部署”的形态，支持：

- `PDF -> 页图 -> 结构化提取 -> 题库 JSON`
- 可视化浏览、修题、修公式、补图、改题型、生成答案
- 工作区 `workspace` 管理
- Redis 持久化 session
- Docker 一体化部署
- 工作区磁盘占用统计、清理和删除

## 项目结构

- `frontend/`
  Vue 3 + Vite 前端
- `backend/`
  TypeScript + Express 后端
- `Dockerfile`
  应用镜像构建文件
- `docker-compose.yml`
  应用 + PostgreSQL + Redis 一键启动
- `.env.example`
  环境变量示例

## 当前运行模型

系统现在以 `workspace` 为核心：

- 每次上传 PDF、导入 JSON、结构化提取、修复题目，都会落到同一个工作区
- 工作区里始终有一个“当前主 JSON”
- 用户可以随时下载“当前最新 JSON”
- 修复多道题时，会持续覆盖主工作副本，而不是修一道下一次

典型工作区目录大致如下：

```text
data/
  workspaces/
    ws_xxx/
      workspace.json
      uploads/
      output_images/
      output_json/
        main.json
      read_results/
```

## 本地开发

### 1. 启动后端

```bash
cd backend
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:5001
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:5173
```

### 3. 本地生产构建

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
npm run build
npm start
```

## 关键环境变量

后端主要读取这些环境变量：

- `PORT`
  应用端口，默认 `5001`
- `DATA_ROOT`
  工作区数据根目录，默认 `./data`
- `ARK_API_KEY`
  必填，火山 Ark API Key
- `ARK_BASE_URL`
  默认 `https://ark.cn-beijing.volces.com/api/v3`
- `ARK_MODEL`
  默认 `doubao-seed-2-0-pro-260215`
- `QUESTION_BANK_DATABASE_URL`
  PostgreSQL 连接串
- `QUESTION_BANK_DB_SCHEMA`
  默认 `question_bank_auto`
- `REDIS_URL`
  Redis 连接串
- `SESSION_STORE_PREFIX`
  Redis session key 前缀
- `SESSION_TTL_SECONDS`
  session TTL，默认 7 天
- `PDF_RENDER_DPI`
  PDF 转图 DPI，默认 `180`
- `PDF_JPEG_QUALITY`
  JPG 质量，默认 `90`
- `MAX_PENDING_QUEUE_PAGES`
  跨页待补队列上限，默认 `8`
- `WORKSPACE_DERIVED_RETENTION_DAYS`
  自动清理旧中间产物的保留天数，默认 `7`
- `WORKSPACE_MAINTENANCE_INTERVAL_MS`
  自动清理任务运行间隔，默认 `12h`

## PostgreSQL 迁移

如果你本地直接跑后端，需要先迁移数据库：

```bash
cd backend
npm run db:migrate
```

Docker 部署默认会在容器启动时自动执行迁移。

## Docker 部署

当前仓库已经内置以下部署文件：

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `docker-entrypoint.sh`

### 打包内容

会打进镜像的：

- 后端编译产物 `backend/dist`
- 前端编译产物 `frontend/dist`
- Node 运行依赖
- `poppler-utils`

不会打进镜像、而是走 volume 持久化的：

- `data`
- `runtime_cache`
- `uploads`
- `output_images`
- `output_json`
- `merged_json`
- `read_results`
- PostgreSQL 数据
- Redis 数据

也就是说：

- 代码更新靠“重建镜像”
- 业务数据靠“卷持久化”

## Ubuntu 24.04 云服务器部署流程

下面这套流程就是当前项目线上使用的推荐方式：

- `Ubuntu 24.04`
- `Docker Compose`
- `PostgreSQL + Redis` 先跟应用一起用 Docker 跑

### 1. 安装 Docker

如果官方 Docker 源访问慢，先直接用 Ubuntu 自带包：

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo docker --version
sudo docker compose version
```

可选：让当前用户免 `sudo`

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### 2. 拉代码

```bash
git clone https://github.com/BY-Elysia/question_bank_auto.git
cd question_bank_auto
```

### 3. 配置环境变量

```bash
cp .env.example .env
nano .env
```

最关键的几项：

```env
APP_PORT=5001
PORT=5001
RUN_DB_MIGRATE=1

ARK_API_KEY=你的真实ARK密钥

POSTGRES_DB=question_bank_auto
POSTGRES_USER=question_bank
POSTGRES_PASSWORD=改成强密码

QUESTION_BANK_DATABASE_URL=postgresql://question_bank:你的强密码@postgres:5432/question_bank_auto
QUESTION_BANK_DB_SCHEMA=question_bank_auto

REDIS_URL=redis://redis:6379/0
SESSION_STORE_PREFIX=question-bank-auto:sessions
SESSION_TTL_SECONDS=604800
```

注意：

- `QUESTION_BANK_DATABASE_URL` 里的密码必须和 `POSTGRES_PASSWORD` 一致
- 主机名 `postgres`、`redis` 不要改，因为这是 `docker-compose.yml` 里的服务名

### 4. 启动

```bash
sudo docker compose up -d --build
```

### 5. 查看状态

```bash
sudo docker compose ps
sudo docker compose logs -f app
```

### 6. 开放安全组端口

如果暂时直接通过公网 IP 访问，需要开放：

- `TCP:5001`

浏览器访问：

```text
http://你的公网IP:5001
```

后续如果接域名和 HTTPS，建议只对外开放：

- `TCP:80`
- `TCP:443`

## 服务器更新流程

以后你修改代码后，服务器更新只需要：

```bash
cd ~/workspaces/question_bank_auto
git pull
sudo docker compose up -d --build
```

常用辅助命令：

查看状态：

```bash
sudo docker compose ps
```

查看日志：

```bash
sudo docker compose logs -f app
```

停止服务：

```bash
sudo docker compose down
```

## 当前用户流程

### 1. 上传 PDF

- PDF 会上传到当前工作区
- 原始 PDF 会保存
- 转图后的页图会落到 `output_images/`

### 2. 生成或导入 JSON

- 导入后会进入当前工作区
- 工作区里会有主 JSON 工作副本

### 3. 结构化提取

- 提取结果持续写回当前主 JSON
- session 状态放在 Redis

### 4. 可视化修复

- 修公式、补图、改题型、生成答案，都会持续覆盖当前主 JSON
- 用户可以随时点击“下载当前最新 JSON”

### 5. 导入本地 `uploads/`

如果 JSON 里的图片 URL 还指向本地 `/uploads/...`：

- 可视化页支持上传本地 `uploads` 文件夹
- 后端会把图片导入服务器
- 并把 JSON 里的图片地址改写成服务器可访问 URL

## 文件上传策略

为了适应服务器环境，上传已经不再使用纯内存缓存。

当前策略是：

- 上传先落到磁盘临时目录
- 后端按需读取文件
- 请求结束后自动清理临时上传文件

这样可以显著降低：

- 大 PDF 上传时的内存峰值
- 批量图片修复时的内存压力
- 公网用户同时操作时的崩溃风险

## 工作区空间管理

现在系统已经支持工作区空间管理。

前端顶部导航会显示：

- 当前 `workspaceId`
- 当前工作区占用大小
- 文件数
- 资产数

并支持：

- `刷新空间`
- `清理中间产物`
- `删除当前工作区`

### 清理规则

“清理中间产物”只会清：

- `output_images`
- `read_results`

不会清：

- 当前主 `main.json`
- 用户上传图片
- 必要的工作结果

### 自动清理

后端启动后会定期清理“长时间未更新工作区”的中间产物。

默认规则：

- 超过 `7` 天未更新的工作区
- 自动清掉旧页图和读结果
- repair 快照只保留少量最新版本

可通过环境变量调整：

- `WORKSPACE_DERIVED_RETENTION_DAYS`
- `WORKSPACE_MAINTENANCE_INTERVAL_MS`

## 当前适合的部署定位

这套系统目前最适合：

- `1 台 Linux 云服务器`
- `Docker Compose`
- `1 个应用容器`
- `1 个 PostgreSQL 容器`
- `1 个 Redis 容器`

如果后续文件量继续增长，建议下一步演进为：

- PostgreSQL 用托管版
- Redis 用托管版
- PDF、图片、归档 JSON 迁对象存储
- 域名 + HTTPS + 反向代理

## 已知说明

- 公网直接通过 `IP:5001` 访问时，浏览器的 File System Access API 可能不可用，所以页面会退化为普通文件上传入口
- 首次 Docker 构建通常最慢，因为要拉基础镜像、安装系统包和依赖
- 前端构建目前有大 chunk 警告，但不影响运行

## 推荐的实际运维习惯

- 代码改动后：`git pull && docker compose up -d --build`
- 定期查看：当前工作区空间占用
- 大批量处理完成后：手动清理中间产物
- 不再需要的任务：直接删除工作区
- 发布前：备份 `.env`、数据库卷和 `data/`

## Git 说明

- 默认分支：`main`
- 推送前不要把真实密钥写入仓库
- `.env` 不应提交到 Git
