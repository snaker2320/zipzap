# ZipZap

ZipZap 是面向 AI 开发协作的可选 Skill，辅助查找项目规范和相关文档，并为需要受控交付的任务提供检查、证据和 Git 交接支持。项目不安装 ZipZap 也应能独立开发、验证和交付。

它不是项目管理工具，也不会维护另一套任务、人员或状态数据库。

## 为什么需要 ZipZap

AI 能快速生成代码，但真实项目还需要回答这些问题：

- 这次工作应该遵守哪些项目标准？
- 当前改动需要什么授权、测试和评审？
- 测试失败后如何修正，又该在何时停止自动重试？
- 多个提交交给下一个人时，范围、证据和遗留问题是否完整？

ZipZap 把这些协作约束做成一组轻量、可验证的控制能力，让 Agent 继续直接工作，同时减少遗漏和无依据的完成声明。

## 设计理念

### Git 是长期事实来源

代码、提交和 Git Checkpoint 保存可交付事实。临时循环状态只存在于用户缓存，按仓库、工作区和 Loop ID 隔离，不污染项目。缓存记录修正次数；Git 保存交接所需的长期事实。

### 治理并只加载当前需要的标准

ZipZap 根据当前动作、影响域、产物、改动路径和风险，在项目已有规范中辅助匹配规则。默认原地读取 `standards/`、`conventions/` 和 `docs/standards/`，其他布局通过本次请求的 `project.standards` 指定，不需要搬迁文件或建立项目清单。Markdown 及项目入口是权威，适用性元数据是可选增强。

规范匹配与相关资料分开返回。`related_documents` 只沿命中规范和项目入口的明确本地引用查找一层，记录引用来源，不自动赋予规范权威。匹配只覆盖已检查来源；无匹配不代表无约束。已读且未变化的规则可以在完整上下文内复用。

发现缺少规范、重复 ID、适用范围不明、内容过薄或示例替代规则时，ZipZap 只给出治理诊断和最小修改建议。创建、拆分、合并、移动或清理规范仍需预览和人工确认，项目原始规范始终是权威来源。

### 使用最小工作契约

普通问答、修改和验证直接遵守项目规则，无需 Skill 或 Loop。可以单独使用规范路由、文档辅助和检查能力。用户要求受控交付或项目政策要求治理时，才使用 Work：没有阶段交接的有界结果使用 Direct，需要真实阶段边界时使用 Staged，并明确起点和终点。

### 检查强度与实际风险匹配

Gate 根据本次动作的影响和风险决定是否需要范围确认、人工授权、验证或独立评审。入口检查在执行前到期，出口检查在提交结果时到期。`gate --enforce` 返回可供 Host/CI 使用的退出码；Host 必须实际调用并执行判定，Skill 本身不会拦截工具。

### 失败反馈有边界

问题以稳定指纹去重并回到对应工作阶段。提交结果未通过出口 Gate 后，最多允许一次自动修正；再次失败就带着证据停止。正常 CLI 调用从缓存恢复修正次数，漏传 `attempt` 不会重置额度。内部编辑、测试和修复不消耗该额度。

### 单一 Owner，独立检查按需出现

每个 Work 只有一个当前 Owner。需要独立检查时，Host 才创建真实的次级 Agent，并把具体 Gate 检查绑定给它；检查者只提供证据，不取得 Work 所有权。任务发起者仍负责目标、范围、授权和产品决定。

### 项目拥有真正的执行命令

Build、Deploy、Probe、Smoke 和 Rollback 命令由项目自己维护和执行。ZipZap 负责发现候选命令、检查映射和验证证据，不执行输入文件中的任意命令。生产部署不在当前契约范围内。

## 它如何工作

```text
用户目标
   ↓
读取项目入口与适用规则（可选 ZipZap 辅助查找）
   ↓
普通任务直接执行；需要治理时进入 Direct / Staged Work
   ↓
受控交付 ──→ Gate ──通过──→ 报告结果 / 必要时 Handoff
                 │
                 └─失败──→ Feedback → 修正 → 重新验证
```

Staged Work 可使用以下节点：

```text
Plan → Design → Implement → Verify → Deploy → Maintain
```

节点不会擅自前进。Host 可以在已经授权的边界内提供 `next_stage`，不必每个节点都重新询问用户。一次工作可以停在任意明确的完成节点，例如 `Plan → Design`。

阶段、治理分支和内部动作是不同层次：Work 交付结果，Feedback 纠正问题，Maintenance 改进标准，它们不是必经链。运行维护阶段 `maintain` 也不等于标准 Maintenance。普通改进建议不阻塞交付；必要的标准变更通过 `blocks_work` 和 `resume` 保存阻塞原因及原工作终点。

Direct Work 始终由一个 Owner 完成，不引入执行角色。只有 Gate 要求独立测试或评审时，才加入与 Owner、作者不同的检查 Agent。Staged Work 可以由同一 Owner 继续；只有所有权确实变化时才创建 Handoff。Host 不支持或不允许多 Agent 时，需要独立性的边界会阻塞，不会退化为同一 Agent 模拟多个身份。

Host 负责确定性编排，不设置 Orchestrator、Coordinator 或 Maintainer Agent。Loop 从 `execution.owner`、`execution.checks` 和已接受的 `execution.handoff` 生成进度，只显示当前阶段、状态、Owner、下一阶段和阻塞原因，不计算百分比。接收者明确接受 Handoff 后，所有权才转移。

普通 Work 完成后直接报告结果。需要持久交接时才设 `handoff_required: true`；Handoff 可保存 `work` 边界，避免接收方把“只做设计”继续推进为实现。保留有恢复和回滚价值的提交，只按逻辑变更整理 fixup，不按 Loop 自动 squash。

## 核心概念

| 概念 | 简单理解 |
| --- | --- |
| Standards | 项目已有位置的权威规则，脱离 Skill 仍可直接阅读 |
| Direct Work | 不需要阶段交接的有界工作 |
| Staged Work | 需要明确阶段、产物和提交绑定的工作 |
| Gate | 根据影响和风险检查范围、授权、验证与评审 |
| Feedback | 记录、去重并关闭真实问题项 |
| Git Checkpoint | 在 Git 提交中保存范围、验证证据和遗留问题 |
| Handoff | 将完整的多提交交付范围交给下一位协作者 |
| Owner | 当前 Work 的唯一负责人 |
| Independent check | 由次级 Agent 提供的 Gate 证据，不取得所有权 |
| Progress | 从 Owner、检查和交接事实推导出的当前阶段快照 |

## 快速开始

### 1. 安装本地 Skill

需要 Node.js 20 或更高版本。

```sh
npm ci
npm run install:local -- --host-multi-agent full --host-version <host-version>
```

安装内容来自自包含的 `dist/skill`。安装器把 Host 多 Agent 能力写入用户缓存；后续 Loop 不重复探测。`full` 表示默认允许，`disabled` 表示能力存在但默认关闭，`unavailable` 和 `unknown` 会保守阻止需要多个 Agent 的工作。Host 能力或版本变化时重新安装并更新这两个参数；省略参数会保留已有记录。已安装的 Skill 不需要、也不应该再次运行 `npm install`。

### 2. 保持项目入口独立

项目的 `AGENTS.md` 应直接说明规范位置、适用条件及验证要求。ZipZap 可以作为可选辅助，例如：

```md
- Project rules in `conventions/` are authoritative and directly readable without a Skill.
- Read applicable rules for the current action and paths; use project-owned verification commands.
- ZipZap may assist with rule and document discovery without starting a Loop.
- Use governed delivery when requested or required by project policy. An unavailable required check blocks that boundary.
```

CLI 入口由 `SKILL.md` 以相对路径 `scripts/zipzap.mjs` 声明，并从已安装 Skill 内解析。项目的 `AGENTS.md` 不需要、也不应硬编码 Skill 安装路径。

安装器默认只发现现有规范，不初始化项目。只有明确请求初始化时才先预览、再凭同一 fingerprint 应用；已有规范默认原地保留。旧项目的强制入口只给出逐行迁移建议，初始化不会重写已有 `AGENTS.md`。卸载 Skill 不改变项目规则，也不免除项目要求的检查。

### 3. 像平常一样描述工作

不需要学习一套任务语法。直接告诉 Agent 目标和边界，例如：

```text
使用 ZipZap，找出修复登录超时需要阅读的规范和相关文档。
```

这个请求只使用查找能力。需要治理时，可以明确要求“使用 ZipZap 受控交付，完成实现和验证，不部署”；此时再选择 Direct 或 Staged，执行适用的检查。可选辅助不可用时，按项目规则继续普通工作；已要求的检查不能被静默跳过。

## CLI 使用

CLI 主要供 Agent 和高级用户调用。`--input` 接收带 `.json`、`.yaml` 或 `.yml` 扩展名的文件路径，机器输出为 JSON；`--compact` 只压缩 JSON 排版，`loop --brief` 才会省略重复的验收合同和已关闭证据；不传 `--brief` 保留完整机器结果。

```sh
# 查看全部命令
node scripts/zipzap.mjs --help

# 检查 Skill 内置配置与 Schema
node scripts/zipzap.mjs validate --compact

# 发现项目规范并查看只读治理诊断
node scripts/zipzap.mjs standards \
  --action discover \
  --input examples/zipzap/standards-route.yml \
  --compact

# 按动作、影响域、产物、路径和风险选择项目标准
node scripts/zipzap.mjs standards \
  --action route \
  --input examples/zipzap/standards-route.yml \
  --compact

# 评估本次工作的 Gate
node scripts/zipzap.mjs gate \
  --input examples/zipzap/gate.yml \
  --compact

# 推进 Work、Feedback 或 Maintenance（示例为不写缓存的内部迭代）
node scripts/zipzap.mjs loop \
  --input examples/zipzap/loop.yml \
  --brief --compact

# 准备多提交 Git Handoff
node scripts/zipzap.mjs handoff \
  --action prepare \
  --input examples/zipzap/handoff.yml \
  --compact
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `initialize` | 预览或应用项目标准初始化 |
| `standards` | 发现并路由项目标准 |
| `gate` | 评估证据和授权要求 |
| `loop` | 推进 Work、Feedback 或 Maintenance |
| `delivery` | 规划或评估 Build 与非生产 Deploy |
| `issues` | 去重、跟踪和关闭问题项 |
| `handoff` | 准备或检查 Git Checkpoint Handoff |
| `lifecycle` | 评估构建、验证、发布、安装、升级或回滚 |

每个命令都可以使用 `--help` 查看输入 Schema 和示例：

```sh
node scripts/zipzap.mjs loop --help
```

完整示例位于 [`examples/zipzap`](examples/zipzap)，公开输入契约位于 [`schemas`](schemas)。

## 项目结构

```text
config/       内置工作流、风险和治理规则
schemas/      对外输入与输出契约
references/   按操作加载的详细说明
scripts/      CLI、构建、安装和发布脚本
standards/    ZipZap 项目自身的开发标准
tests/        自动化测试
```

## 开发与验证

```sh
npm test
npm run validate
npm run build
npm run test:dist
git diff --check
```

`npm run release:bundle` 只从干净且已提交、版本标签匹配的 revision 生成确定性发布包；它不会执行 push 或发布。

## 证据与恢复边界

阶段产物必须指向真实 Git 文件或目录，并覆盖受验证的结果范围。声明的已接受输入使用版本和摘要绑定；验收预期变化后旧证据失效。持久 Work 修改或移除验收合同还需提供 `acceptance_change_ref`，引用允许该变更的决定。详见 [运行契约](references/gates-and-loops.md)。

本地 Git 和 `file:` 证据可以检查存在性及绑定；`host:` 等外部引用仍由 Host 负责真实性。独立测试和评审需要实际作者及执行者身份，程序检查身份不能冲突，但不替代 Host 的身份认证。

`persist: false` 是明确标记的模拟，不保证跨调用的重试额度。Git Handoff 保存结果和续接边界，不恢复 Agent 消息队列。详见 [交接与提交整理](references/git-handoff.md)。

## 编排行为验证

`tests/orchestration.test.mjs` 用临时 Git 仓库和真实 CLI 路径覆盖有界交付、必要标准修订后的恢复、上游变化、验收变更、重试额度、退出码及交接。它验证确定性编排契约，不等同于模型端到端评估。

修改 Skill 时，还应使用真实请求做独立前向试用：设计到设计结束、常规缺陷自修复、可选规则提议、必要规则修订、换上下文恢复和输入变更。记录错误放行、无谓阻塞、用户中断次数与上下文体积；模型或 Host 升级后重跑相关案例。使用现有会话和 CI 记录，不建立新的项目运行数据库。
