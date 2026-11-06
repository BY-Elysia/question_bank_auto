# 公网访问与登录

公网部署使用 Nginx HTTPS 入口，应用继续只绑定服务器 127.0.0.1:5002。登录页使用独立管理员账号，服务端校验 scrypt 密码摘要，登录成功设置 HttpOnly、SameSite=Strict、Secure Cookie，有效期从登录起 30 天（Max-Age 与 Expires）。关闭浏览器后再次打开、应用或容器重启后可继续登录；退出后立即撤销。

部署环境必须设置 ACCESS_REQUIRED=1、ACCESS_USERNAME、ACCESS_PASSWORD_HASH，摘要格式为 16 字节十六进制 salt 和 32 字节 scrypt 结果，以冒号分隔。ACCESS_SECURE_COOKIE=0 只适用于本机 HTTP 测试。ACCESS_REQUIRED=1 但摘要缺失会拒绝启动。

登录接口为 POST /api/access/login，JSON 为 username/password；GET /api/access/session 查询认证状态；POST /api/access/logout 撤销会话。未登录访问业务 API、页图、下载均返回 401；健康检查只返回基本存活状态。登录请求限 2KB，连续错误 8 次阻断 15 分钟，写请求检查 Origin。前端会话失效后返回登录页，密码不存 localStorage。

当前是单管理员工作台，会话适配器在进程内读取缓存，在 `WORKSPACE_ROOT/access/sessions.json` 持久化 token 的 SHA-256 摘要及到期时间，绝不保存原始 token 或密码。目录权限 0700、文件 0600，写入串行化并先持久化再响应成功。该目录随工作区卷保留，不进入教材导出。到期会话无效，账号或密码摘要变化时撤销全部旧会话；退出撤销也跨重启生效。首次从旧内存会话升级后需重新登录一次。

仍是单进程会话适配器，不能据此横向运行多个共享数据卷的后端；多实例部署需替换 SessionStore。会话文件损坏或不可读时启动失败，不会绕过验证。Nginx 不记录请求体，配置文件只保存密码摘要。

HTTPS server 块包含 `deploy/nginx-assets.conf`（部署时复制到 `/opt/question-bank/shared/nginx-assets.conf` 并使用绝对路径 include）。仅 `/assets/` 下带内容哈希的静态文件启用 gzip 与一年缓存；API 和登录响应不套用此配置。更新后先执行 `nginx -t` 再 reload。静态压缩能减少工作区与公式渲染代码的首次下载量。

服务器采用 Let's Encrypt 公网 IP 短期证书，Certbot 定时续期并重载 Nginx。参考：[官方 IP 证书配置](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)。

部署验证：65 项自动化测试通过；原有 7 项浏览器流程、独立登录流程和公网 HTTPS 浏览器登录／刷新／退出流程通过。证书续期演练成功，续期定时器已启用。公网应用镜像为 b888cb3，后续提交只调整测试约束与部署说明。
