# 公网访问与登录

公网部署使用 Nginx HTTPS 入口，应用继续只绑定服务器 127.0.0.1:5002。登录页使用独立管理员账号，服务端校验 scrypt 密码摘要，登录成功设置 HttpOnly、SameSite=Strict、Secure 会话 Cookie。会话最长 12 小时；退出后立即撤销，进程重启后需重新登录。

部署环境必须设置 ACCESS_REQUIRED=1、ACCESS_USERNAME、ACCESS_PASSWORD_HASH，摘要格式为 16 字节十六进制 salt 和 32 字节 scrypt 结果，以冒号分隔。ACCESS_SECURE_COOKIE=0 只适用于本机 HTTP 测试。ACCESS_REQUIRED=1 但摘要缺失会拒绝启动。

登录接口为 POST /api/access/login，JSON 为 username/password；GET /api/access/session 查询认证状态；POST /api/access/logout 撤销会话。未登录访问业务 API、页图、下载均返回 401；健康检查只返回基本存活状态。登录请求限 2KB，连续错误 8 次阻断 15 分钟，写请求检查 Origin。前端会话失效后返回登录页，密码不存 localStorage。

当前是单管理员工作台，会话保存在单进程内存，不能据此横向运行多个共享数据卷的后端。Nginx 不记录请求体，配置文件只保存密码摘要。

服务器采用 Let's Encrypt 公网 IP 短期证书，Certbot 定时续期并重载 Nginx。参考：[官方 IP 证书配置](https://letsencrypt.org/2026/03/11/shorter-certs-certbot.html)。
