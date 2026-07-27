# UAT-01 手动验收矩阵候选

0.1.0的GUI行由用户在开发/候选环境中确认通过。用户于2026-07-27明确接受干净机门禁，但没有提供另一台干净Windows的独立执行证据，因此`CLEAN-01`记录为`waived_by_user`，不得转述为外部实测通过。

| 行 | 前置 | 操作 | 预期可见结果 | 当前状态 |
| --- | --- | --- | --- | --- |
| GUI-01 | 无项目 | 启动并切换中英文、浅/深色 | 安全空态、无假项目 | passed |
| GUI-02 | 官方夹具 | 打开、查看健康与只读边界 | 原始来源受保护 | passed |
| GUI-03 | 可编辑夹具副本 | 计划/查看/批准Zone体积Diff | 只产生新Revision | passed |
| GUI-04 | 运行中 | Stop/退出/切换项目 | 状态为取消或unknown_cleanup，不伪造成功 | passed |
| GUI-05 | 附件 | 选择PDF、CSV、ZIP和恶意样本 | 分类、限制、引用和拒绝原因明确 | passed |
| GUI-06 | AI关闭 | 浏览Project/Draft/Run/Result/Report | 核心流程可用，AI动作不可用 | passed |
| GUI-07 | 高DPI/窄窗 | 键盘导航和150/200%缩放 | 无遮挡、焦点可恢复 | passed |
| GUI-08 | 官方夹具副本与已连接AI | 切换“分析/仿真方案”，生成单Zone体积方案，确认Back/Cancel/Approve and Run、失败保留草稿与上一可信结果 | 无路径/PRJ正文泄漏；固定Patch→Run→Result→Analysis时间线；中英文、主题与键盘不退化 | passed |
| CLEAN-01 | 干净Win10/11标准用户 | 安装、离线启动、保留数据卸载 | 无提权、无联网依赖 | waived_by_user |
