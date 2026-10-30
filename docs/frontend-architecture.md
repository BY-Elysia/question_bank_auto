# 前端分层架构

本次重构保留现有 React 界面、CSS、动画、Hash 路由和后端接口。前端按工作区、提取、核对三个业务模块组织，每个模块将请求、状态编排和展示分开。

```text
client/src/
├── app/                     应用外壳状态、路由监听、健康检查
├── App.tsx                  导航与页面装配；工作区页面懒加载
├── features/
│   ├── workspace/           列表、上传、工作区生命周期、历史和导出
│   ├── extraction/          教材信息、章节分组和提取配置
│   └── review/              原图对照、核对、修复、编辑和候选审核
│       ├── components/      JSX、交互绑定、视觉反馈
│       ├── hooks/           状态、异步操作、成功后的刷新与弹窗关闭
│       ├── model/           纯数据计算、派生状态和校验
│       └── api/             业务接口、路径、请求体和返回类型
├── shared/
│   ├── api/                 fetch 封装、错误映射和浏览器下载
│   ├── hooks/useAsync.ts    请求生命周期、轮询、取消与操作锁
│   ├── contracts.ts         后端契约的唯一类型导入边界
│   └── navigation.ts        Hash 导航工具
├── components/              共享 UI、富文本、公式和内容展示
├── lib/                     通用文案映射及样式工具
└── styles/                  现有设计变量和功能样式
```

## 依赖与职责

正常调用方向为 `components → hooks → api → shared/api`。Hook 可调用 model 中的纯函数，model 不依赖 React、请求或组件。

- **components**：显示数据、绑定 Hook 返回的命令。组件不得拼接业务 API 路径或直接 fetch；缩放、拖动、DOM ref 等纯视觉交互可以留在组件。
- **hooks**：拥有列表筛选、配置表单、编辑草稿、选中内容、弹窗和异步状态；调用 API，决定成功后刷新、关闭弹窗或导航。各次操作继续使用同一个操作锁，避免重复提交。
- **model**：上传文件限制、配置有效性、工作区步骤、核对结果的筛选与派生。保持无副作用，不能反向依赖 Hook 或 UI。
- **api**：工作区、提取和核对分别管理自己的请求。共享请求层只处理传输、非 2xx 错误、409 文案和 204 空返回。
- **shared/contracts.ts**：通过 `import type` / `export type` 引用后端类型，浏览器不加载后端实现。目前仍是同仓类型适配层，并未声称已经生成独立 SDK；未来可以在这一处改为 OpenAPI 生成类型或独立 contracts 包。

Workspace 作为流程装配组件，根据服务端状态组合 Configure、Processing、Review。其他业务组件不读取服务器目录，也不承担模型工作流。

## 状态与请求生命周期

后端是教材、章节任务、修订和候选结果的事实来源；前端不复制一套任务状态机。

- 工作区轮询间隔保持 2 秒，列表 6 秒，健康检查 15 秒。
- `useResource` 接收稳定的加载函数；工作区 ID 对应的函数通过 useCallback 固定。共享 Hook 不再知道业务 URL。
- 每次加载完成后才安排下一次轮询，卸载或刷新时取消旧请求并清理定时器。
- 编辑和修复草稿在对应 Hook 内，提交失败保留草稿并显示错误；仅成功后关闭弹窗和刷新服务端状态。
- 不增加 Redux/Zustand 等全局状态库。跨图文面板的选择和定位由 useReview 统一拥有；缩放拖动仍属于 PageCanvas 的视觉状态。

Review 从原先 397 行拆成主视图、内容列表、任务提示、修复弹窗及 Hook；主视图仅组合这些部分。工作区暂停/恢复、删除、历史恢复和导出也已移到 useWorkspace 与 API 层。

## 验证与约束

```sh
npm run build:all
node --test test/frontend-architecture.test.mjs
PW_BROWSER_CHANNEL=chrome npm run test:web
```

架构测试检查展示组件不能访问请求层，model/api 不能反向依赖 React 组件或 Hook，共享层不能依赖业务模块，后端类型只能通过 contracts 适配层以 type-only 方式引入。

Playwright 使用真实 HTTP、后端仓储、文件上传、PDF 渲染及导出，模型输出使用确定性测试替身；本次前端重构不消耗真实模型 API。覆盖 PDF/图片上传、分组拖拽、提取、核对、候选审核、编辑、修复、恢复、导出、历史、删除、移动端与断线重试；新增 409 编辑失败保留草稿并重试的回归。

## 本次验证（2026-10-30）

- `npm run build:all`：后端及前端构建通过；导航工具移至 shared 后再次完成前端构建。
- TypeScript 严格检查及额外的 unused locals/parameters 检查通过。
- `node --test test/frontend-architecture.test.mjs`：2 项依赖边界检查通过。
- `PW_BROWSER_CHANNEL=chrome npm run test:web`：6 项浏览器端测全部通过（约 1.4 分钟）。
- 已检查端测生成的桌面核对页与移动首页截图；本次没有修改样式文件。
