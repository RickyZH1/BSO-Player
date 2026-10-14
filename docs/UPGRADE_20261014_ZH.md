# 2026-10-14：审核修复与Hide and Seek应急升级

## 已修复的原因
审核表单的隐藏字段name=id遮蔽了form.id，前端没有进入review分支，发送了错误操作。照片和Bingo共用该表单，均受影响。改为getAttribute('id')，记录字段改名record_id，后端仍收到id。服务器拒绝时保留弹窗和错误，不显示假成功。

## 主办方执行一次数据库升级
1. 浏览器打开Supabase，可使用Continue with GitHub登录。它与网站14个账号不是同一套身份。
2. 进入jckxxmswznlvmdtuioep项目，左侧SQL Editor → New query。
3. 打开supabase/migrations/005_review_emergency.sql的Raw代码，完整复制，包括begin与commit。
4. 粘贴到新查询，Run一次；不要重跑001-004，也不要执行seed或重置SQL。
5. 无错误后，另开查询运行：select version from public.portal_migrations order by version; 应有1-5。
6. 若version5已存在，不重跑。出现错误停止；事务会回滚，记录错误交维护者。
7. 在工作人员网站退出、刷新、重新登录，进入照片页，人工应急入口显示可用。

升级新增私密应急记录和安全RPC，保留当前账号、密码、待审照片、Bingo、任务状态和流水。Secret/service_role只能管理Auth与受授权业务，不能替代SQL Editor的数据库管理访问。

## 先试正常照片审核
照片 → 审核此照片 → 通过或驳回 → 需要时填原因 → 核对并确认 → 再确认。
成功后待审状态更新；已有待审照片不用重新上传。5个不同目标有效自动点亮Hide and Seek。Bingo审核也修复。网络失败先看记录，不重复发实体银票。

## 人工应急：仅Hide and Seek
1. 任一独立Staff账号登录，底部照片。
2. 点击选择队伍并处理人工应急。
3. 选择Team，选择人工应急点亮，填写现场证据与应急理由（必填）。
4. 勾选已经现场核验，理解不自动加银票且不能回填时间。
5. 核对并确认人工应急，再核对队伍确认弹窗。
6. 该队Hide and Seek直接完成，不要求已有5张有效照片；玩家同步后看到绿色完成。
7. 点亮仅允许探索开放且未截止，以服务器当前时间登记；未归档时可填写理由撤销应急。
8. 已有5张真实有效照片时无需应急；撤销应急不会撤销真实照片。有5张仍完成，不足5张且没有应急才变未完成。

本入口只变更任务完成，不自动发照片基础／首发奖励。正常照片后续审核仍按原规则计奖，不会因为不足5张而清掉应急点亮；若曾手动补银票，须对账并按原因冲正，避免与正常照片计奖重复。
First Bingo与Full House仍需队伍主动申报并满足有效条件，不因应急按钮自动领取奖金。截止后不倒填应急或申报时间。
所有8位Staff可操作，队伍账号不能；操作保留本人身份、理由、前后状态和服务器时间。应急理由不返回给玩家，原始证据仍私密。

## 8位密码
现有14账号已按原密码前8位更新，不是重建账号。新密码互不重复。所有用户退出后重新登录。新私密清单只在维护电脑work/portal-fix/.private/credentials.8chars.json；旧Desktop credentials.json仍是旧清单，不要误分发旧完整密码。不要公开任何清单、密钥或密码备份。

## 演练重置
升级后重置还应清掉private.hide_seek_emergencies，否则旧应急决定可能在后续审核时重新点亮。使用已更新的docs/manuals-v2/reset-files/02_reset_rehearsal.sql；保留其全测试确认、日期与Storage保护。正式活动只更正，不清空。

