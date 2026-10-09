# 零基础部署教程

这份教程分为“准备电脑 → 建数据库 → 创建账号 → 发布网页 → 验收”。先在演练环境走通，再使用正式账号。不要在正式活动数据库运行tests/bootstrap.sql或tests/database.mjs，它们专门创建测试角色和数据。

当前项目：https://github.com/RickyZH1/BSO-Player
已提供Supabase项目：https://jckxxmswznlvmdtuioep.supabase.co
预计Pages地址：https://rickyzh1.github.io/BSO-Player/ （只有发布成功后才可用）。

## 1. 准备电脑上的项目文件

1. 在浏览器打开上述BSO-Player仓库。
2. 点击绿色Code → Download ZIP。解压到一个容易找到的新文件夹，例如“文档/BSO-Player”。
3. 安装Node.js 22 LTS。安装后重新打开终端。终端输入node --version，看到v22开头即可。
4. Windows：在解压后有package.json的文件夹空白处右键 → 在终端中打开。
5. 逐行执行：

~~~powershell
npm install
npm run prepare:private
~~~

看到“私密种子已写入 .private/seed.sql”表示完成。如果PowerShell提示禁止运行npm.ps1，可把命令里的npm换成npm.cmd，无需修改全系统执行策略。

.private是本地私密文件夹，里面会出现seed.sql、source.html、reference.json。它含工作人员规则和六队数据，只供主办方初始化使用。**不要把它拖到GitHub、发活动群或作为Pages发布目录。**

私密种子生成步骤会联网读取已经核对的Game版本（公开图片已经复制进新仓库）。如果网络读取失败，换可访问GitHub的网络重试。总控应在旧仓库转私有或清理前保留这份本地备份；以后可设置SOURCE_HTML环境变量指向已备份source.html，再运行导入脚本。

检查点：文件夹内已有.private/seed.sql；不要双击网页当作网站运行。

## 2. 打开或创建Supabase免费项目

你已经有项目，可以直接进入Supabase Dashboard，选择对应项目；不要再创建重复项目。如果需要演练项目，在New project选择Free，设置独立数据库密码，等待状态Ready。这个密码是数据库管理密码，不是参赛者登录密码。

在项目左侧找到Settings → API Keys：

- Project URL可公开。
- Publishable key（sb_publishable_开头）或旧版anon public可公开，必须配合RLS。
- Secret key（sb_secret_开头）、service_role、数据库密码绝不能填到前端、GitHub变量、公开聊天/仓库。
- 本仓库已经配置你提供的URL和publishable key，通常不用再改。

项目SQL数据库中使用public作为API可访问schema；不要把private添加到Data API的Exposed schemas。Data API必须启用，供前端调用两个安全RPC。

## 3. 建表、权限与图片存储

进入左侧SQL Editor → New query。按文件名顺序操作：

1. 打开项目文件supabase/migrations/001_core.sql，全选复制，粘贴SQL Editor，点Run。
2. 看到Success后，新建查询，执行002_business.sql。
3. 同样执行003_storage.sql。
4. 同样执行004_admin_initialization.sql。
5. 最后打开电脑上的.private/seed.sql，把内容复制到SQL Editor → Run。

迁移有事务与版本标记，按序每个文件执行一次。不是让你反复点所有SQL。如果看到“already exists / duplicate key”，先停止，查看public.portal_migrations里哪些版本已完成，不要删除表来解决。初次失败的事务会回滚；修复原因后重跑失败的文件。seed.sql可重复运行，不覆盖已编辑的规则/线索。

检查点：

- Table Editor → public.teams：6行；T6人数8，其他为7。
- tasks：9行；bingo_cells：54行；team_task_results：54行。
- score_ledger：6行，初始金额各500。
- clues：7行，既没有focus_hunter，也没有hide_and_seek。
- photo_targets：11行；food_assignments：6行。
- 每张业务表应显示RLS已启用。不要为了消除提示而关闭RLS。
- Storage → evidence：Public关闭；限制800000 bytes，允许JPEG/WebP。
- profiles此时可以为空，下一步创建账号后会有14行。

SQL Editor以项目管理身份操作，能看所有数据属于正常；这不能用来证明玩家隔离。真实隔离要用不同账号登录验收。

## 4. 配置Auth，关闭公开注册

左侧Authentication → Sign In / Providers（有些界面叫Providers）：

1. Email登录保持启用。
2. 在Authentication设置中关闭“Allow new users to sign up / Enable signups”。
3. 不启用匿名登录。不需要开放社交登录。
4. URL Configuration：Site URL设置为https://rickyzh1.github.io/BSO-Player/。
5. 如果有Redirect URLs，加入同一地址及本地演练地址http://127.0.0.1:4173。此版本使用邮箱密码登录，不靠邮件回调。
6. 不启用“Single session per user”一类仅允许一个会话的限制；每队需要7或8台手机共享登录。若界面没有该选项，无需处理。

检查点：网站没有注册入口；团队账号可以在两台设备同时保持登录。

## 5. 初始化6个队伍账号与8个Staff账号

建议使用下述脚本，让密码各自随机生成，不共用万能密码。此过程只在你的电脑运行，不是网站功能。

在项目终端执行：

~~~powershell
node scripts/accounts-template.mjs
~~~

打开.private/accounts.json。把14个TODO邮箱改为由你控制/指定的邮箱，显示名可改成工作人员昵称；不要在公开仓库填写真实人员邮箱。六个Team账号的team_id分别固定1—6；八位工作人员的role都为staff，不分级、不绑定关卡权限。

然后临时把Supabase后台的Secret key或旧版service_role放进当前终端的环境变量。用隐藏输入，避免密码出现在屏幕和命令历史：

~~~powershell
$bsoSecureKey = Read-Host "粘贴Supabase管理密钥（输入隐藏）" -AsSecureString
$env:SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new("", $bsoSecureKey).Password
node scripts/init-accounts.mjs
Remove-Item Env:SUPABASE_SECRET_KEY
~~~

无须提供数据库密码。脚本通过Supabase官方Admin接口创建用户，并为各人生成独立随机密码；只把账号密码写到.private/credentials.json，不会打印密码。第一次创建中断，可以保留credentials.json后重跑，继续尚未完成的profile映射。

检查点：

- Authentication → Users：14个用户。
- Table Editor → profiles：14行；6个team、8个staff；staff的team_id为空，active为true。
- 本地credentials.json：14条，每个密码不同。只把对应账号私发给相应队伍/工作人员，不把整份表发给所有人。
- 脚本不能自动接管已存在但未由本脚本记录的同邮箱用户。遇到“用户已存在”不要删除真实用户：采用下面手动映射方法。

不用管理密钥脚本也可手动建立：

1. Authentication → Users → Add user → Create new user。
2. 输入邮箱、单独生成的强密码，启用自动确认邮箱。
3. 复制新用户UID。
4. Table Editor → profiles → Insert：auth_user_id粘贴UID；role选team或staff；team_id对队伍填1—6、工作人员留空；display_name填显示名；active=true。
5. 重复直到14个账号。

“active=false”可立即禁止这个账号通过业务接口读取/修改（已有照片临时签名最长还可使用60秒）。撤销账号时，先停用profile，再在Auth中重置密码/停用或撤销会话。重置队伍密码会影响整队；在群里私下通知新密码。不要在Auth user_metadata里填role当作授权，真正角色来自profiles。

## 6. 本地预览真实网站

完成数据库与账号后执行：

~~~powershell
npm run build
npm run preview
~~~

终端显示http://127.0.0.1:4173，浏览器打开。

检查点：

- 未登录：米白底、深绿标题“十年同行，一起去探索”，邮箱/密码框。
- Team登录：显示本队编号、0/9、500两，底部Home / My Bingo / Explore / Guide。
- My Bingo：固定9格；刷新不重排。
- Explore：未放行时提示先完成开场；不能看到地点线索。
- Staff登录：总览、关卡、照片、Bingo、管理，可看全部六队。
- 登录失败若提示“账号未授权或已停用”，检查profiles映射和active；不是去关闭RLS。

如需换项目：复制.env.example为.env，填写该项目URL与publishable key，重新build。本项目不要填写管理员key。构建器会拒绝sb_secret_及非anon的旧JWT key。

## 7. 发布GitHub Pages

1. 在BSO-Player仓库点击Settings → Pages。
2. Build and deployment → Source选择GitHub Actions。
3. Settings → Actions → General：确认允许仓库使用Actions。首次打开Actions页有启用提示时点启用。
4. 返回Actions，左侧选Verify V1。确认最新代码那次运行绿色通过；红色不要作为正式版本发布。
5. 左侧选Publish Pages → Run workflow → Branch选main → Run workflow。
6. 等待publish全部绿色。点运行里的github-pages环境链接，或回Settings → Pages看网址。
7. 预计地址为https://rickyzh1.github.io/BSO-Player/。如果404，先确认Publish Pages完成、Source为GitHub Actions，并等待传播后刷新。

当前公开URL/key已写入构建默认配置。若要通过仓库配置覆盖，在Settings → Secrets and variables → Actions → Variables（不是Secrets）添加SUPABASE_URL和SUPABASE_PUBLISHABLE_KEY。只放公开配置，不把数据库密码或管理密钥放进去。

本项目只发布dist目录。不要把仓库根目录、.private、SQL或tests上传为Pages产物。发布工作流不会运行私密种子导入。

修改网页后，Verify V1自动测试；测试通过后再手动运行Publish Pages。修改后台线索、规则、公告不需要重新发布网页，玩家15秒内自动更新。

## 8. 给各队分享入口

- T1：https://rickyzh1.github.io/BSO-Player/?team=1
- T2：https://rickyzh1.github.io/BSO-Player/?team=2
- T3：https://rickyzh1.github.io/BSO-Player/?team=3
- T4：https://rickyzh1.github.io/BSO-Player/?team=4
- T5：https://rickyzh1.github.io/BSO-Player/?team=5
- T6：https://rickyzh1.github.io/BSO-Player/?team=6

链接只提示队号，不能当作免登录凭证。与各队私发本队邮箱/密码。用户不能改team=2就切到另一队；最终权限由登录身份决定。不匹配的专属链接会要求重新登录。

工作人员打开不带team参数的主页，用各自Staff账号登录。请勿用工作人员账号让玩家轮流试用。

## 9. 第一次验收顺序

先读TEST_PLAN_ZH.md，在独立演练项目验收。至少准备T1、T2、Staff A、Staff B四个账号，使用不同浏览器/无痕窗口。

1. T1只能看T1，T2只能看T2；500两、9格固定。
2. 两个Staff都能访问所有业务模块；玩家不能修改成绩。
3. Staff将阶段改为统一开场；对六队依次登记开场、确认完成。任何队未完成时放行应被拒绝。
4. 六队完成后放行。全部队伍同时看到线索；Focus Hunter没有探索线索。
5. 选一个现场任务，登记开始、成绩填0、勾选完整参与，先计算奖励再确认：格子点亮、余额不增。
6. 测试照片上传、审核、驳回重传；解锁T1美食但T2仍不可读T1。
7. 按测试计划验证Bingo、并发、截止、撤销和流水。
8. 断网、恢复、切后台、恢复前台；不会假提示成功，15秒或回到前台应刷新。
9. 再到上海现场用实际4G/5G与Wi-Fi、iPhone Safari、Android Chrome及微信浏览器演练。
10. 正式活动只初始化一次基础数据，不能把演练加分带入正式库。不要靠删除个别流水“清零”；使用独立演练项目。

可以在真实数据库初始化后执行只读检查：

~~~powershell
node scripts/live-check.mjs
~~~

它登录本地credentials.json中的14个真实账号，检查读取隔离，不写分数。它不能替代照片Storage、写操作及并发人工验收。

## 10. 免费额度与上线前阻断项

2026-10-09查阅Supabase官方价格页：Free的数据库/Storage/Realtime限制仍须以项目Dashboard → Usage及官方页面当前显示为准。参考500MB数据库、1GB Storage、200个Realtime峰值连接。本版使用轮询，不占Realtime连接，但仍有API与流量用量。

- 照片最长边1600px、压缩后≤800000 bytes，每队至多120次预留上传（包括失败预留），最多约576MB证据文件；注意其他bucket和历史演练文件也占额度。
- 活动前确认项目未暂停，确认两个域名在现场网络可达。
- 原Game公开Staff手册仍是保密阻断项。先备份私密导入数据及素材，再按SECURITY_ZH.md由总控决定旧站迁移/限制公开访问。此项目没有删除或修改旧仓库。
- 联系方式、集合点、探索线索、安全范围、学习来源需现场确认后填写。
- 完成真实Supabase/Storage隔离验收再邀请玩家，不能仅依据页面好看或CI绿色宣布上线。

官方参考：
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/pricing
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
