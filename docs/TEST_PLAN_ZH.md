# 测试记录与人工验收计划

## 已实际运行的环境

本地执行服务启动失败，因此没有伪称在用户电脑运行成功；改用GitHub Actions Linux + PostgreSQL 17 + Chromium。

2026-10-09，提交bcac7fa1e52ee439525f3b06afb723bfa1af3930的Verify V1已实际成功：
https://github.com/RickyZH1/BSO-Player/actions/runs/37918556704

- 3项Node模型测试通过：八条Bingo线、最少五项、重复格、HTML/CSV转义、固定源数据导入。
- 1149项PostgreSQL断言通过：迁移执行、六队隔离、工作人员权限、零分完成、奖励边界、1000种三投组合、幂等、防直写、Storage表策略、首发乱序审核与冲正、Bingo排序、满格资格失效、截止与51并发数据库会话。
- 静态站构建成功，素材下载与打包成功。
- 3项Chromium测试通过：375px页面/导航、Staff界面、51个独立浏览器context（43个共享队伍会话+8个Staff）。

已通过的扩展测试还包含六队并发申报、倒序审核完整奖金序列、早申报撤销让位、截止前照片截止后审核，以及截止后有效照片替代被撤销的早期照片不能保留原Bingo资格。**请以Actions最新提交对应的绿色运行及日志数字为准**；上面数字只描述对应已运行版本。

## 测试范围的准确含义

数据库测试是真的执行了PostgreSQL RLS、PL/pgSQL事务、角色模拟及业务接口；但auth.uid和Storage元数据表由测试夹具模拟。它不是Supabase生产Auth JWT、Storage HTTP网关或签名URL端到端测试。

51个Chromiumcontext是真的同时打开网页，但网络API被固定测试数据模拟；这不证明Supabase真实网络、免费流量额度或上海移动网络能承载51人。51数据库会话另行测试事务读取，但也不代表生产容量认证。

没有在用户Supabase执行迁移/创建真实账号。没有使用数据库密码。没有实际验证iOS Safari、Android Chrome、微信内置浏览器、真机相机EXIF方向、真实上传签名、现场网络或纸卡执行。

## 重跑命令

~~~powershell
npm install
npm run prepare:private
npm test
npm run build
npx playwright install chromium
npm run test:browser
~~~

数据库测试需要单独的空PostgreSQL测试库，DATABASE_URL必须指向测试库：

~~~powershell
$env:DATABASE_URL="postgres://postgres:你的测试密码@localhost:5432/bso_test"
npm run test:db
Remove-Item Env:DATABASE_URL
~~~

不要指向正式Supabase。tests/bootstrap.sql创建模拟auth/storage及角色，正式Supabase已经存在这些对象。最容易重跑的方式是仓库Actions → Verify V1 → Run workflow。

## 真实Supabase验收表

用全新演练项目，不要污染正式活动数据。每一行记录日期、操作者、截图/请求结果、通过/失败；失败先修复再发布。

| 编号 | 操作 | 应看到的结果 |
|---|---|---|
| 1 | 六队逐一登录，对照原站固定卡并刷新 | 每队9项各一次，排列一致，不随刷新变化 |
| 2 | 核对人数与账号 | 7/7/7/7/7/8，共43参赛者；8Staff；14账号 |
| 3 | T1在REST请求改为T2 team_id，或改URL/localStorage | 不能读取T2卡面、流水、照片、食物；不能改角色/分数 |
| 4 | 匿名请求staff_rules/portal_read；Team直写score_ledger | 拒绝或空集；没有机密内容 |
| 5 | 未放行查clues；六队开场后Staff放行 | 前者无线索，后者同时开放；Focus无探索线索 |
| 6 | 两个独立Staff分别给不同关卡确认0分完整参与 | 格点亮、余额不加；操作者分别记录 |
| 7 | 同一完成操作同时重复点击/重发相同request_id | 一份结果、一次净奖励 |
| 8 | 只有3/4任务连线尝试申报；5任务且连线再申报 | 前者拒绝，后者成功；8条线分别验收 |
| 9 | 六队并发申请，倒序批准，先保留最早pending | 后面不抢名次；全部有效后按服务器顺序授奖 |
| 10 | 拒绝最早申请、重复申报/重复批准 | 无效申请不占位，重复不多发；玩家无其他队排名 |
| 11 | 8/9申请Full House；9/9申请及重复批准 | 只有9/9有效且一份奖；与First独立 |
| 12 | 同图A先传、B后传先通过，A后通过 | B基础奖先记，首发待决；A最终成为首发 |
| 13 | 先传无效驳回；撤销原首发；重审 | 最早有效者获额外奖，旧流水保留并冲正 |
| 14 | 同队同图重复上传/通过；四图/五图/第六图 | 不重复奖；五张才完成；第六张继续奖 |
| 15 | 上传非允许类型、超800KB、伪造他队路径 | Storage服务端拒绝；不能UPDATE覆盖已有证据 |
| 16 | T2读取T1照片记录、签名URL生成、私有对象原URL | 无权；仅自队/Staff能生成短时签名，已分享签名60秒过期 |
| 17 | T3美食未解锁/解锁，T2读T3；未完全完成提交 | 未解锁不可读；仅T3可读；未完成不能盖章发奖 |
| 18 | 8位Staff逐个跨关卡/照片/Bingo/解锁/阶段/更正 | 全业务可操作且个人审计，不得直接写业务表 |
| 19 | 截止设为10分钟后、提前原截止、提前CLOSED | 全部拒绝；正确提前15分钟公告成功 |
| 20 | 到截止，传新图/申报/开局；完成已开局；审旧照片 | 新操作拒绝；旧材料可结银票，不倒填Bingo |
| 21 | 断网提交、重连、切后台回来 | 无假成功，正确重试不重奖，恢复取得最新数据 |
| 22 | 查看公开dist、JS、API响应和浏览器Network | 无Staff全文/题库/答案/其他队布局/管理密钥 |
| 23 | 正式日期、时区显示，Team6人数 | 2026-10-15、Asia/Shanghai、T6为8 |
| 24 | 51真机会话，上海4G/5G/Wi-Fi | 共同登录可用、15秒更新、网络失败提示明确 |
| 25 | iPhone Safari、Android Chrome、微信浏览器 | 375px可用、相机照片方向正确、压缩/上传/退出可靠 |
| 26 | 导出CSV与纸质实体银票记录对账 | 余额=所有流水和，更正保留，无二次发票 |
| 27 | 项目Usage、照片保留期、旧Staff公开站 | 免费额度可控，隐私告知/清理安排明确，旧机密不再公开 |
| 28 | 归档后所有写操作，停用账号的已有会话 | 归档只读、账号失效；签名最长60秒剩余有效期 |

## 真实身份只读辅助检查

初始化真实账号后，执行node scripts/live-check.mjs。需要本地.private/credentials.json。它逐个实际登录14个账号，并请求真实RPC/REST检查跨队读取。成功只代表该脚本检查过的读取路径，不包括Storage或全部写操作。

## 上线仍需主办方完成

Supabase建表/私密导入、Auth注册设置、14账号、真实接口验收、Pages启用与发布、未知线索/集合点/范围/联络补齐、旧Game手册保密、上海网络及设备演练、实体银票对账方案。未完成这些，不应对参赛者宣布正式开放。
