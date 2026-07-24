# ADR-015：冻结PatchTransaction安全契约

## 状态

`candidate_for_h_final`。该契约在候选版本完成前只启用已验证的Zone体积单字段操作，多字段ActionBundle保持拒绝。

## 决策

- Rust是交易权威；交易绑定原始基线SHA、当前Revision、稳定对象ID、操作前置条件、证据、过期时间、幂等键和来源追踪。
- 当前唯一允许的操作是一个Zone的`volume_m3`标量替换，应用到应用拥有的Revision副本并重新读取验证。
- Diff和用户确认是强制门禁；源文件覆盖、多操作、路径、字节偏移、UI路径和CONTAM编号都不是交易权威字段。
- 交易过期、基线/Revision/对象/前置条件/Profile变化或幂等键重复时必须拒绝，不自动重新定位。

机器契约位于`contracts/patch-transaction.v1.json`，由Docs验证及变异测试覆盖。
