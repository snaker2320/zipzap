# ZipZap

ZipZap 是面向 AI 开发协作的 Git-native Skill。它让 Agent 在动手前读取正确的项目标准，在交付前通过与风险相匹配的检查，并把可追溯的结果留在 Git 中。

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

代码、提交和 Git Checkpoint 保存可交付事实。临时循环状态只存在于用户缓存，不污染项目，也不与 Git 建立平行状态机。

### 治理并只加载当前需要的标准

ZipZap 根据当前动作、影响域、产物、改动路径和风险，从 `standards/` 中选择相关规则。索引从项目现有 Markdown 和少量适用性元数据中动态生成，不写入项目。Agent 只读取命中的完整文件，避免一次加载所有规范。

发现缺少规范、重复 ID、适用范围不明、内容过薄或示例替代规则时，ZipZap 只给出治理诊断和最小修改建议。创建、拆分、合并、移动或清理规范仍需预览和人工确认，项目原始规范始终是权威来源。

### 使用最小工作契约

小而明确的修改使用 Direct Work，直接产出结果。需要阶段交接时才使用 Staged Work，并明确起点和终点，例如只完成 Design，而不是默认走完整个研发流程。

### 检查强度与实际风险匹配

Gate 根据本次动作的影响和风险决定是否需要范围确认、人工授权、验证或独立评审。项目标准可以提高要求，但不能绕过失败的 Gate。

### 失败反馈有边界

问题以稳定指纹去重并回到对应工作阶段。提交结果未通过检查后，最多允许一次自动修正；再次失败就带着证据停止，交由人处理。

### 角色按需出现

Product、Developer、Tester、Reviewer 是职责，不是固定团队，也不要求用户选择协作模式。只有下一步确实需要时才激活相应角色；独立性由实际行为保证。

### 项目拥有真正的执行命令

Build、Deploy、Probe、Smoke 和 Rollback 命令由项目自己维护和执行。ZipZap 负责发现候选命令、检查映射和验证证据，不执行输入文件中的任意命令。生产部署不在当前契约范围内。

## 它如何工作

```text
用户目标
   ↓
AGENTS.md + standards/ 路由
   ↓
Direct Work，或显式范围的 Staged Work
   ↓
执行工作 ──→ Gate ──通过──→ Git Checkpoint / Handoff
                 │
                 └─失败──→ Feedback → 修正 → 重新验证
```

Staged Work 可使用以下节点：

```text
Plan → Design → Implement → Verify → Deploy → Maintain
```

节点不会自动前进。一次工作可以停在任意明确的完成节点，例如 `Plan → Design`。

## 核心概念

| 概念 | 简单理解 |
| --- | --- |
| Standards | 项目自己的规则，存放在 `standards/` |
| Direct Work | 不需要阶段交接的有界工作 |
| Staged Work | 需要明确阶段、产物和提交绑定的工作 |
| Gate | 根据影响和风险检查范围、授权、验证与评审 |
| Feedback | 记录、去重并关闭真实问题项 |
| Git Checkpoint | 在 Git 提交中保存范围、验证证据和遗留问题 |
| Handoff | 将完整的多提交交付范围交给下一位协作者 |

## 快速开始

### 1. 安装本地 Skill

需要 Node.js 20 或更高版本。

```sh
npm ci
npm run install:local
```

安装内容来自自包含的 `dist/skill`。已安装的 Skill 不需要、也不应该再次运行 `npm install`。

### 2. 让项目声明使用 ZipZap

在项目的 `AGENTS.md` 中说明使用 ZipZap，并声明 `standards/` 是项目标准来源。例如：

```md
- Use the installed ZipZap Skill for standards routing, gates, feedback, and Git Handoff.
- Project standards under `standards/` are authoritative.
- Route by the active action, affected domains, artifacts, changed paths, and risk; load every selected file in full.
- Do not bypass a blocking gate or claim unrecorded verification.
```

CLI 入口由 `SKILL.md` 以相对路径 `scripts/zipzap.mjs` 声明，并从已安装 Skill 内解析。项目的 `AGENTS.md` 不需要、也不应硬编码 Skill 安装路径。

如果项目还没有标准目录，让 Agent 使用 ZipZap 初始化即可。初始化始终先预览，再凭同一 fingerprint 确认应用；它不会自动覆盖已有的 `AGENTS.md`。

### 3. 像平常一样描述工作

不需要学习一套任务语法。直接告诉 Agent 目标和边界，例如：

```text
使用 ZipZap，按项目标准修复登录超时问题，完成实现和验证，不部署。
```

Agent 会负责路由标准、选择 Direct 或 Staged Work、执行所需 Gate，并在需要交接时准备 Git Handoff。

## CLI 使用

CLI 主要供 Agent 和高级用户调用。`--input` 接收带 `.json`、`.yaml` 或 `.yml` 扩展名的文件路径，机器输出为 JSON；`--compact` 可输出紧凑结果。

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

# 推进 Work、Feedback 或 Maintenance
node scripts/zipzap.mjs loop \
  --input examples/zipzap/loop.yml \
  --compact

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
config/       内置工作流、风险和角色规则
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
