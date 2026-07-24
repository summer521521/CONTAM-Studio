# CONTAM Studio v1 Candidate Product Contract

状态：`candidate_for_h_final`

## 一句话范围

Windows 10/11 x64、离线优先的CONTAM工作台，帮助学生、教师和研究人员在一个受支持的窄Profile内完成：检查兼容项目 -> 创建语义草稿 -> 查看确定性Diff -> 用户批准 -> 调用官方ContamX -> 使用官方SimRead提取Zone空气状态 -> 比较Revision -> 导出证据报告。

v1不承诺任意PRJ、任意建筑模型或自主科学决策。未知语法、未经证实的对象和缺少工具时保持只读或明确禁用。

## Personas and jobs

| Persona | Job to be done | P0 outcome |
| --- | --- | --- |
| 学生/研究生 | 在教师案例上完成一次可复现的单变量实验 | 能说明原始文件、修改量、单位、A/B结果和证据来源 |
| 教师/案例准备者 | 分发安全案例并审阅学生证据 | 可检查来源、Diff、工具身份、结果和报告 |
| 研究人员 | 在支持范围内快速比较受控Revision | 不支持内容不会被静默改写或伪造结果 |
| 离线用户 | 没有AI、网络或Codex仍完成核心工作流 | Inspect/Patch/Run/Result/Compare/Report可用 |

## P0

- 原始PRJ只读且默认不覆盖；所有写入进入Studio-owned副本和不可变Revision。
- 兼容判定、Zone对象、Zone体积Patch、Diff、Undo/Redo和输出所有权由Rust/Python确定性验证。
- ContamX和SimRead是外部用户选择的官方工具；身份、输入、输出和进程证据绑定到OwnedArtifactStore。
- 结果只承诺`zone_air_state`中的温度、参考压力、空气密度和时间字段；比较拒绝身份、单位或时间网格不一致。
- 附件通过Rust AttachmentBroker进入，默认限制和禁用宏、脚本、外链、嵌入执行内容。
- AI默认关闭；连接后只能接收用户预览并确认的派生证据，不能获得Shell、任意文件或原始PRJ写入权。
- 所有核心错误使用稳定状态词和可恢复操作；路径、凭据、原始正文不进入WebView或普通诊断。

## P1

- 第二个同对象/结果族的教学Profile。
- 受控比较图表、统计、教师审阅摘要和可选只读AI解释。
- 不改变科学语义的性能和可理解性优化。

## Non-goals

完整PRJ编辑、任意对象族、批量运行、参数扫描、优化、BIM/CAD、多求解器、云协作、自动更新、跨重启Thread恢复、AI自主Patch/运行、原位保存和自动上传遥测。

## Data-safety red lines

1. 不覆盖、删除或替换用户外部源文件和已发布导出。
2. 未经验证不接受项目、Patch、工具、结果或附件；未知内容整体只读/隔离。
3. 不把退出未确认、流未冻结、工具身份变化或结果未绑定写成成功。
4. 不向远程AI发送未选择、未预览、未确认的附件或项目证据。
5. 不执行宏、脚本、安装器、嵌入可执行文件、通用Shell或全局进程命令。
6. 删除、迁移、卸载和AI执行都必须显示范围、依赖、哈希和结果，并可恢复或明确失败。

## Release blockers and measurable candidate criteria

自动化候选必须有：受支持Profile契约、Inspect -> Patch -> Run -> Result -> Compare -> Report纵向路径、确定性负向测试、离线核心路径、锁定依赖、候选安装包和中文架构学习材料。真实GUI、真实官方工具、干净电脑、用户研究、签名、许可证最终复核和发布仍为`pending_final_acceptance`。

发布阻断包括原始文件损坏、错误接受不支持项目、身份错绑、未确认进程残留、伪成功、未披露联网、凭据泄露、未知许可证二进制打包和未经授权发布。

## Authority and review

本文件由实现代码和契约消费；H-FINAL集中复核科学边界、安全策略和证据，U-FINAL集中体验GUI、真实工具、安装和用户价值。`candidate_for_h_final`不表示已经接受或发布。
