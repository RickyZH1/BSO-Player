# BSO 10周年 · Player Portal V1

2026年10月15日 · Asia/Shanghai。43名参赛者（T1—T5各7人、T6 8人）+8名独立工作人员，14个登录账号。GitHub Pages静态前端 + Supabase Auth / PostgreSQL / 私有Storage，15秒自动轮询。

**当前是可部署源码交付，真实Supabase数据库、账号及GitHub Pages仍需按教程初始化。不能把CI通过等同于活动站已上线。** 已配置用户提供的项目URL和publishable公钥；没有保存数据库密码、service_role或secret key。

## 从这里开始

1. [零基础中文部署教程](docs/DEPLOY_ZH.md)
2. [工作人员现场操作手册](docs/STAFF_OPERATIONS_ZH.md)
3. [地点、线索与素材填写清单](docs/CONTENT_CHECKLIST_ZH.md)
4. [安全说明与旧站保密阻断项](docs/SECURITY_ZH.md)
5. [规则核对与实施阶段](docs/PRD_RECONCILIATION_ZH.md)
6. [测试范围、验收步骤及局限](docs/TEST_PLAN_ZH.md)

## M1 / M2

- M1：共享队伍账号、独立Staff、固定Bingo、逐队RLS、500两流水、服务器计分、0两完成、开局登记、统一开场与放行、公告、线索编辑、自动刷新。
- M2：11张目标图、浏览器照片压缩、私有上传、审核版本、First Finder延迟结算与冲正、5图完成、美食解锁/替代/整体验收、First Bingo与Full House申请/审核、公平排序、截止保护、纠错审计、CSV导出。
- 玩家：Home / My Bingo / Explore / Guide；Staff：总览 / 关卡 / 照片 / Bingo / 管理。
- 工作人员全部拥有同等业务权限，但没有表直写权，所有业务写入必须经过安全RPC。Supabase项目拥有者属于另一个管理层。

## 本地运行

安装Node.js 22后，在项目文件夹打开终端：

~~~powershell
npm install
npm run prepare:private
npm run build
npm run preview
~~~

访问 http://127.0.0.1:4173 。真实登录仍依赖Supabase完成初始化。不要直接双击HTML。账号初始化详见部署教程。

## 文件结构

~~~text
web/                    玩家与Staff界面，通用交互、样式
supabase/migrations/    001—004有序SQL迁移
scripts/prepare.mjs     从已核对版本提取私密规则/布局/美食；复制公开素材
scripts/init-accounts.mjs  本地私密账号初始化
scripts/live-check.mjs  真实14账号只读Auth/RLS检查
scripts/build.mjs       仅打包公开前端及公开图片到dist
tests/                  PostgreSQL集成、模型、51会话浏览器测试
docs/                   中文部署、运营、安全、验收、待填清单
.github/workflows/      Verify V1自动测试 / Publish Pages手动发布
.private/               本地生成，已忽略，严禁上传
dist/                   Pages产物，不含迁移/种子/账号/工作人员规则
~~~

规则源固定为Game仓库提交 ea34cdbc55871a9ffee9c60e7865d67dd54c03f5；代码不执行源页面脚本，只解析已核对JSON。地图和照片已经复制到web/assets，构建时写入自己的Pages产物，玩家运行时不依赖旧Game站点。首次备份素材后，旧站保密处理不影响已发布新站。

业务争用使用数据库事务级全局锁，适合本次小型活动，以可核查的一致性优先。所有时间以服务器为准，初始不设准确开赛/清盘时刻。公告清盘至少提前15分钟，不能提前已有截止。日期仍为已确认的2026-10-15。

没有开发晚餐个人账户、拍卖、兑换或个人排行榜。
