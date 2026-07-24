# UAT-01 手动验收矩阵候选

每行执行时记录版本、分支、Windows 版本、权限、工具身份和结果；未执行行保持 `pending_final_acceptance`。

| 行 | 前置 | 操作 | 预期可见结果 | 当前状态 |
| --- | --- | --- | --- | --- |
| GUI-01 | 无项目 | 启动并切换中英文、浅/深色 | 安全空态、无假项目 | pending_final_acceptance |
| GUI-02 | 官方夹具 | 打开、查看健康与只读边界 | 原始来源受保护 | pending_final_acceptance |
| GUI-03 | 可编辑夹具副本 | 计划/查看/批准Zone体积Diff | 只产生新Revision | pending_final_acceptance |
| GUI-04 | 运行中 | Stop/退出/切换项目 | 状态为取消或unknown_cleanup，不伪造成功 | pending_final_acceptance |
| GUI-05 | 附件 | 选择PDF、CSV、ZIP和恶意样本 | 分类、限制、引用和拒绝原因明确 | pending_final_acceptance |
| GUI-06 | AI关闭 | 浏览Project/Draft/Run/Result/Report | 核心流程可用，AI动作不可用 | pending_final_acceptance |
| GUI-07 | 高DPI/窄窗 | 键盘导航和150/200%缩放 | 无遮挡、焦点可恢复 | pending_final_acceptance |
| CLEAN-01 | 干净Win10/11标准用户 | 安装、离线启动、保留数据卸载 | 无提权、无联网依赖 | pending_final_acceptance |
