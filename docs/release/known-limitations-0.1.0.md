# CONTAM Studio 0.1.0已知限制

- 只正式支持Windows 10/11 x64。
- 只处理具有明确兼容证据的PRJ语义；不承诺任意PRJ完整解析和无损编辑。
- Schedule和Species参数化在0.1.0保持安全只读，并返回`unsupported_parameter`。
- 未知或不能可靠回写的对象保持只读。
- 官方ContamX/SimRead需要用户配置，不随Studio安装器分发。
- AI联网需要用户主动连接；没有AI时核心工作流仍可用。
- 附件图片只在本地预览，0.1.0不宣称把像素发送给远程模型。
- AI只能通过结构化Patch、Diff、确定性验证和用户批准影响草稿。
- 不提供自动更新、云同步、账户、多用户协作、插件SDK、macOS或Linux发行。
- 干净Windows安装门禁由用户在没有独立外部执行证据的情况下接受，记录为`waived_by_user`。
