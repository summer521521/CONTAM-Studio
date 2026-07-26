# AGENT-03语义PRJ编辑纵向切片

本切片把已验证的CONTAM简单Zone读取路径扩展为Rust权限接线的语义快照、对象树和多操作草稿Patch。Python只做严格解析和字节局部副本应用，Rust绑定项目Session、baseline哈希、当前Revision和一次性Patch计划；React只消费结构化响应。

## 已接入

- Project、Level、Zone、FlowPath、Species以及空的Schedule/Source集合进入无路径语义快照。
- 对象包含稳定ID、CONTAM编号或外部编号、来源行、原始字节范围、来源SHA-256和只读/可编辑能力。
- 未知区块留在DocumentEnvelope和opaque摘要中，写入只替换已验证字段的原始字节范围。
- 支持Zone名称、Zone体积和已验证FlowPath multiplier的单事务Diff、哈希绑定、旧值复核、排他草稿创建和失败不覆盖。
- Tauri命令提供快照、对象查询、Patch预览、应用和放弃；React提供树、属性、Ctrl/Command多选、Diff、撤销/重做、应用和放弃。
- AI上下文可引用semantic_project和semantic_object，但仍只收到Rust筛选后的结构化证据，不接收路径、PRJ正文或Shell。模型若基于披露的对象和baseline哈希提出受支持的语义Patch，只能作为严格闭合的建议返回；前端将其重新绑定当前快照后交给同一Rust Diff/批准/草稿路径，AI没有写入权限。

## 明确边界

完整PRJ区块、复杂Schedule/Source布局、未知字段编辑、真实桌面GUI验收、Windows安装和发布仍未完成。无法严格保存的对象继续只读；真实ContamX/SimRead运行证据不由本切片伪造。

## 证据

自动化证据写入`docs/development/task-log/records/agent-03-full-prj-domain.md`，包含Python、Rust、前端、契约、格式、Clippy和生产构建结果。测试只使用仓库fixture和隔离临时目录，不读取正式项目或用户文件。
