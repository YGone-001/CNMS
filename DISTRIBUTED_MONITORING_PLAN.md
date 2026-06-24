# xCloud-CNMS 分布式监控与远程部署方案

**版本:** v1.0
**日期:** 2026-06-01
**密级:** 内部

---

## 1. 背景与目标

### 1.1 现状分析

当前 xCloud-CNMS 采用**单机架构**，通过 `gopsutil` 库直接采集本机进程信息：

```
┌─────────────────────────────────────┐
│        xcloud-cnms (单机)            │
│  Go HTTP Server + React SPA         │
│  gopsutil → 本地进程采集             │
│  MongoDB → 本地数据存储              │
└─────────────────────────────────────┘
```

**局限性：**
- 只能监控部署在同一台机器上的 NF 进程
- 无法覆盖分布式部署场景（用户面/控制面分离）
- 无法实现远程 NF 部署与管理

### 1.2 目标架构

支持三种部署模式：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **单机模式** | 所有 NF 集中部署 | 开发测试、小规模验证 |
| **分域模式** | 用户面/控制面分离 | 中等规模商用部署 |
| **全分布式** | 每个 NF 独立节点 | 大规模商用部署 |

---

## 2. 整体架构设计

### 2.1 架构拓扑

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Central Dashboard (主控节点)                     │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Go Backend  │  │  React SPA   │  │   MongoDB    │              │
│  │  Port: 8088  │  │  Port: 3000  │  │  Port: 27017 │              │
│  └──────┬───────┘  └──────────────┘  └──────────────┘              │
│         │                                                            │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Alarm Engine │  │  AIOps Engine│  │  Scheduler   │              │
│  │  告警引擎     │  │  智能运维    │  │  定时任务     │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└────────┬─────────────────┬─────────────────┬────────────────────────┘
         │ REST/gRPC       │ REST/gRPC       │ SSH/Ansible
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Agent Node 01  │ │  Agent Node 02  │ │  Agent Node 03  │
│  用户面节点      │ │  控制面节点      │ │  边缘节点        │
│  10.0.1.10      │ │  10.0.1.20      │ │  10.0.2.10      │
│                 │ │                 │ │                 │
│  ┌─────┐┌─────┐│ │  ┌─────┐┌─────┐│ │  ┌─────┐┌─────┐│
│  │ UPF ││SGW-U││ │  │ AMF ││ SMF ││ │  │ MME ││ HSS ││
│  └─────┘└─────┘│ │  └─────┘└─────┘│ │  └─────┘└─────┘│
│  ┌────────────┐│ │  ┌────────────┐│ │  ┌────────────┐│
│  │ xcloud-    ││ │  │ xcloud-    ││ │  │ xcloud-    ││
│  │ agent      ││ │  │ agent      ││ │  │ agent      ││
│  └────────────┘│ │  └────────────┘│ │  └────────────┘│
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 2.2 组件职责

| 组件 | 部署位置 | 主要职责 |
|------|----------|----------|
| **xcloud-cnms** | 主控节点 | API 服务、前端展示、告警引擎、AIOps、调度器 |
| **MongoDB** | 主控节点 | 数据持久化、聚合分析 |
| **xcloud-agent** | 每台 NF 节点 | 进程采集、资源监控、数据上报、远程执行 |
| **NF 进程** | 各自节点 | 实际电信业务处理 |

### 2.3 通信协议

| 方向 | 协议 | 端口 | 用途 |
|------|------|------|------|
| Agent → 主控 | HTTP POST | 8088 | 数据上报（每 10 秒） |
| 主控 → Agent | SSH | 22 | 远程部署/运维命令 |
| 前端 → 主控 | WebSocket | 8088 | 实时状态推送 |
| 前端 → 主控 | REST API | 8088 | 配置管理/查询 |

---

## 3. Agent 采集代理设计

### 3.1 Agent 架构

```
┌──────────────────────────────────────────────┐
│              xcloud-agent                     │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Process Probe│  │ Host Collector       │ │
│  │ 进程探测      │  │ 主机资源采集         │ │
│  └──────┬───────┘  └──────────┬───────────┘ │
│         │                     │              │
│  ┌──────┴─────────────────────┴───────────┐ │
│  │           Reporter (数据上报)           │ │
│  │  HTTP POST → /api/v1/agent/report      │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │         Executor (命令执行)             │ │
│  │  接收主控指令，执行 NF 管理操作          │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 3.2 Agent 配置文件

```json
{
  "node_id": "up-node-01",
  "node_name": "User Plane Node",
  "address": "10.0.1.10",
  "site": "jiangmen-dc",
  "center_url": "http://10.0.1.100:8088",
  "agent_key": "your-secret-key-here",
  "report_interval": 10,
  "nf_list": [
    {
      "name": "upfd",
      "type": "systemd",
      "service": "upfd.service"
    },
    {
      "name": "sgwud",
      "type": "systemd",
      "service": "sgwud.service"
    },
    {
      "name": "pgwud",
      "type": "process",
      "process_name": "pgwud"
    }
  ]
}
```

### 3.3 上报数据格式

```json
{
  "node_id": "up-node-01",
  "node_name": "User Plane Node",
  "timestamp": "2026-06-01T16:30:00Z",
  "processes": [
    {
      "name": "upfd",
      "pid": 12345,
      "cpu_percent": 23.5,
      "memory_rss": 536870912,
      "memory_vms": 1073741824,
      "memory_percent": 12.8,
      "running": true
    },
    {
      "name": "sgwud",
      "pid": 12346,
      "cpu_percent": 15.2,
      "memory_rss": 268435456,
      "memory_vms": 536870912,
      "memory_percent": 6.4,
      "running": true
    }
  ],
  "host_info": {
    "cpu_usage": 35.2,
    "memory_total": 17179869184,
    "memory_used": 8589934592,
    "disk_total": 107374182400,
    "disk_used": 53687091200
  }
}
```

### 3.4 Agent 核心模块

| 模块 | 功能 | 采集方式 |
|------|------|----------|
| **ProcessProbe** | NF 进程状态 | systemctl / gopsutil |
| **HostCollector** | 主机 CPU/内存/磁盘 | gopsutil |
| **NetworkCollector** | 网络接口流量 | /proc/net/dev |
| **LogCollector** | NF 日志采集 | 文件 tail |
| **Reporter** | 数据上报 | HTTP POST |
| **Executor** | 命令执行 | 接收主控指令 |

---

## 4. 主控端扩展设计

### 4.1 新增 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/agent/report` | 接收 Agent 数据上报 |
| GET | `/api/v1/agent/nodes` | 获取所有 Agent 节点列表 |
| GET | `/api/v1/agent/nodes/{id}` | 获取节点详情及 NF 状态 |
| PUT | `/api/v1/agent/nodes/{id}` | 更新节点配置 |
| DELETE | `/api/v1/agent/nodes/{id}` | 删除节点 |
| POST | `/api/v1/agent/nodes/{id}/command` | 向节点发送命令 |
| GET | `/api/v1/deploy/tasks` | 获取部署任务列表 |
| POST | `/api/v1/deploy/tasks` | 创建部署任务 |
| GET | `/api/v1/deploy/tasks/{id}` | 获取部署任务状态 |

### 4.2 数据模型扩展

#### AgentNode 集合

```go
type AgentNode struct {
    ID          bson.ObjectID `bson:"_id,omitempty" json:"_id"`
    NodeID      string        `bson:"node_id" json:"node_id"`
    NodeName    string        `bson:"node_name" json:"node_name"`
    Address     string        `bson:"address" json:"address"`
    Site        string        `bson:"site" json:"site"`
    AgentKey    string        `bson:"agent_key" json:"-"`
    Status      string        `bson:"status" json:"status"`       // online/offline
    LastReport  time.Time     `bson:"last_report" json:"last_report"`
    HostInfo    HostInfo      `bson:"host_info" json:"host_info"`
    NFList      []NFConfig    `bson:"nf_list" json:"nf_list"`
    CreatedAt   time.Time     `bson:"created_at" json:"created_at"`
}
```

#### DeployTask 集合

```go
type DeployTask struct {
    ID          bson.ObjectID `bson:"_id,omitempty" json:"_id"`
    TaskID      string        `bson:"task_id" json:"task_id"`
    NFName      string        `bson:"nf_name" json:"nf_name"`
    Version     string        `bson:"version" json:"version"`
    TargetNodes []string      `bson:"target_nodes" json:"target_nodes"`
    Status      string        `bson:"status" json:"status"`       // pending/running/success/failed
    Progress    int           `bson:"progress" json:"progress"`   // 0-100
    Logs        []string      `bson:"logs" json:"logs"`
    CreatedAt   time.Time     `bson:"created_at" json:"created_at"`
    CompletedAt time.Time     `bson:"completed_at,omitempty" json:"completed_at"`
}
```

### 4.3 告警规则扩展

支持基于节点和 NF 类型的告警规则：

```json
{
  "name": "agent_offline",
  "description": "Agent node offline for more than 5 minutes",
  "condition": "node.last_report < now() - 5m",
  "severity": "critical",
  "enabled": true
}
```

---

## 5. 远程部署方案

### 5.1 部署方式对比

| 方式 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **SSH 直连** | 简单直接、无额外依赖 | 不适合大规模、无编排能力 | 小规模 (< 10 节点) |
| **Ansible** | 幂等性、批量执行、成熟生态 | 需要 Python 环境 | 中等规模 (10-100 节点) |
| **Kubernetes** | 容器化、自动扩缩、服务发现 | 架构复杂、学习成本高 | 云原生大规模部署 |

### 5.2 SSH 远程部署流程

```
┌──────────────┐     SSH      ┌──────────────┐
│  主控节点     │ ──────────→ │  NF 节点      │
│              │              │              │
│  1. 连接验证  │              │  1. 停止旧服务 │
│  2. 传输包    │              │  2. 备份旧版本 │
│  3. 执行脚本  │              │  3. 解压新版本 │
│  4. 验证结果  │              │  4. 启动服务   │
└──────────────┘              └──────────────┘
```

### 5.3 部署脚本示例

#### 单节点部署

```bash
#!/bin/bash
# deploy-nf.sh - 部署单个 NF 到指定节点

NODE_IP=$1
NF_NAME=$2
NF_VERSION=$3
SSH_USER=${4:-root}

echo "Deploying $NF_NAME v$NF_VERSION to $NODE_IP..."

# 1. 停止服务
ssh $SSH_USER@$NODE_IP "sudo systemctl stop $NF_NAME || true"

# 2. 备份
ssh $SSH_USER@$NODE_IP "sudo cp -r /opt/nf/$NF_NAME /opt/nf/$NF_NAME.bak.$(date +%Y%m%d%H%M%S) || true"

# 3. 传输新版本
scp packages/$NF_NAME-$NF_VERSION.tar.gz $SSH_USER@$NODE_IP:/tmp/

# 4. 解压部署
ssh $SSH_USER@$NODE_IP "
    sudo tar xzf /tmp/$NF_NAME-$NF_VERSION.tar.gz -C /opt/nf/
    sudo systemctl start $NF_NAME
    sudo systemctl enable $NF_NAME
"

# 5. 验证
sleep 3
STATUS=$(ssh $SSH_USER@$NODE_IP "sudo systemctl is-active $NF_NAME")
if [ "$STATUS" = "active" ]; then
    echo "SUCCESS: $NF_NAME deployed"
else
    echo "FAIL: $NF_NAME failed to start"
    exit 1
fi
```

#### 批量部署

```bash
#!/bin/bash
# deploy-batch.sh - 批量部署 NF 到多个节点

NF_NAME=$1
NF_VERSION=$2

# 节点配置
declare -A NODES=(
    ["up-node-01"]="10.0.1.10"
    ["cp-node-01"]="10.0.1.20"
    ["dm-node-01"]="10.0.1.30"
    ["edge-node-01"]="10.0.2.10"
)

for node_id in "${!NODES[@]}"; do
    ip=${NODES[$node_id]}
    echo "Deploying to $node_id ($ip)..."
    
    bash deploy-nf.sh $ip $NF_NAME $NF_VERSION &
done

wait
echo "All deployments completed"
```

### 5.4 Ansible Playbook

```yaml
# playbooks/deploy-nf.yml
---
- name: Deploy NF to distributed nodes
  hosts: "{{ target_group }}"
  become: yes
  vars:
    nf_name: "{{ nf_name }}"
    nf_version: "{{ nf_version }}"
    nf_package: "{{ nf_name }}-{{ nf_version }}.tar.gz"
    nf_repo: "http://repo.internal/nf"
    nf_dir: "/opt/nf"
  
  tasks:
    - name: Get current NF status
      systemd:
        name: "{{ nf_name }}"
      register: nf_status
      ignore_errors: yes
      
    - name: Stop NF service
      systemd:
        name: "{{ nf_name }}"
        state: stopped
      when: nf_status.status.ActiveState is defined and nf_status.status.ActiveState == "active"
      
    - name: Backup current version
      archive:
        path: "{{ nf_dir }}/{{ nf_name }}"
        dest: "{{ nf_dir }}/{{ nf_name }}.bak.{{ ansible_date_time.iso8601_basic_short }}.tar.gz"
        format: gz
      ignore_errors: yes
      
    - name: Download NF package
      get_url:
        url: "{{ nf_repo }}/{{ nf_name }}/{{ nf_package }}"
        dest: "/tmp/{{ nf_package }}"
        mode: '0644'
      register: download_result
      
    - name: Extract NF package
      unarchive:
        src: "/tmp/{{ nf_package }}"
        dest: "{{ nf_dir }}/"
        remote_src: yes
      when: download_result is succeeded
      
    - name: Update NF configuration
      template:
        src: "templates/{{ nf_name }}.conf.j2"
        dest: "{{ nf_dir }}/{{ nf_name }}/config/{{ nf_name }}.conf"
        backup: yes
      when: nf_name_conf is defined
      
    - name: Start NF service
      systemd:
        name: "{{ nf_name }}"
        state: started
        enabled: yes
        daemon_reload: yes
      register: start_result
      
    - name: Wait for NF to be ready
      wait_for:
        port: "{{ nf_port | default(8080) }}"
        timeout: 30
      ignore_errors: yes
      
    - name: Verify NF status
      systemd:
        name: "{{ nf_name }}"
      register: final_status
      
    - name: Report deployment result
      debug:
        msg: >-
          Node: {{ inventory_hostname }}
          NF: {{ nf_name }}
          Version: {{ nf_version }}
          Status: {{ final_status.status.ActiveState | default('unknown') }}
          
    - name: Rollback on failure
      block:
        - name: Stop failed service
          systemd:
            name: "{{ nf_name }}"
            state: stopped
            
        - name: Restore backup
          unarchive:
            src: "{{ nf_dir }}/{{ nf_name }}.bak.{{ ansible_date_time.iso8601_basic_short }}.tar.gz"
            dest: "{{ nf_dir }}/"
            remote_src: yes
            
        - name: Start rolled-back service
          systemd:
            name: "{{ nf_name }}"
            state: started
      when: final_status.status.ActiveState | default('') != "active"
```

---

## 6. 前端展示扩展

### 6.1 新增页面

#### Agent 节点管理页面

```
/agent-nodes 路由
├── 节点概览卡片
│   ├── 总节点数
│   ├── 在线节点数
│   ├── 离线节点数
│   └── NF 总数
├── 节点列表表格
│   ├── 节点 ID
│   ├── 节点名称
│   ├── 地址
│   ├── 所属站点
│   ├── 状态 (在线/离线)
│   ├── 最后上报时间
│   ├── CPU 使用率
│   ├── 内存使用率
│   └── 操作 (详情/编辑/删除)
└── 节点详情抽屉
    ├── 主机信息
    │   ├── CPU 使用率图表
    │   ├── 内存使用率图表
    │   └── 磁盘使用率图表
    ├── NF 列表
    │   ├── 进程名
    │   ├── PID
    │   ├── 状态
    │   ├── CPU
    │   └── 内存
    └── 快捷操作
        ├── 重启 NF
        ├── 查看日志
        └── 发送命令
```

#### 远程部署页面

```
/deploy 路由
├── 部署任务列表
│   ├── 任务 ID
│   ├── NF 名称
│   ├── 版本
│   ├── 目标节点
│   ├── 状态
│   ├── 进度条
│   └── 操作 (查看日志/重试/取消)
├── 创建部署任务
│   ├── 选择 NF (下拉)
│   ├── 选择版本 (下拉)
│   ├── 选择目标节点 (多选)
│   └── 确认部署
└── 部署详情
    ├── 任务信息
    ├── 节点进度
    └── 执行日志
```

### 6.2 拓扑图扩展

在现有网络拓扑图基础上，增加节点层级：

```
Region
├── Site: Jiangmen Core DC
│   ├── Node: CP Node (10.0.1.20)
│   │   ├── AMF
│   │   ├── SMF
│   │   └── NRF
│   └── Node: DM Node (10.0.1.30)
│       ├── UDM
│       ├── UDR
│       └── HSS
└── Site: Maoming Edge
    └── Node: Edge Node (10.0.2.10)
        ├── MME
        ├── SGW-C
        └── PGW-C
```

---

## 7. 安全设计

### 7.1 Agent 认证

```
Agent 启动 → 携带 agent_key → POST /api/v1/agent/report
                                    ↓
                            主控验证 agent_key
                                    ↓
                        验证通过 → 存储数据
                        验证失败 → 返回 401
```

### 7.2 SSH 密钥管理

```bash
# 主控节点生成密钥对
ssh-keygen -t ed25519 -f ~/.ssh/xcloud_deploy -N ""

# 分发公钥到所有 NF 节点
for node in 10.0.1.10 10.0.1.20 10.0.1.30; do
    ssh-copy-id -i ~/.ssh/xcloud_deploy.pub root@$node
done
```

### 7.3 通信加密

| 通信路径 | 加密方式 |
|----------|----------|
| Agent → 主控 | HTTPS (TLS 1.3) |
| 主控 → Agent | SSH (Ed25519) |
| 前端 → 主控 | WSS (WebSocket Secure) |

---

## 8. 部署清单

### 8.1 主控节点

| 资源 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 4 核 | 8 核 |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 100 GB SSD | 500 GB SSD |
| 网络 | 1 Gbps | 10 Gbps |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

**软件依赖：**
- Go 1.24+
- Node.js 18+
- MongoDB 6.0+

### 8.2 NF 节点

| 资源 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 8 核 | 16 核 |
| 内存 | 16 GB | 64 GB |
| 磁盘 | 200 GB SSD | 1 TB SSD |
| 网络 | 10 Gbps | 25 Gbps |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

**软件依赖：**
- xcloud-agent
- 各 NF 运行环境

### 8.3 端口规划

| 服务 | 端口 | 协议 | 说明 |
|------|------|------|------|
| xcloud-cnms API | 8088 | HTTP | 主控 API |
| xcloud-cnms Frontend | 3000 | HTTP | 前端开发服务器 |
| MongoDB | 27017 | TCP | 数据库 |
| Agent Report | 8088 | HTTP | Agent 上报端口 |
| SSH | 22 | TCP | 远程管理 |

---

## 9. 实施计划

### 9.1 阶段划分

| 阶段 | 时间 | 目标 | 交付物 |
|------|------|------|--------|
| **P1: Agent 原型** | 2 周 | 完成 Agent 采集与上报 | agent 二进制、API 接口 |
| **P2: 主控集成** | 2 周 | 主控接收并展示 Agent 数据 | 后端 API、前端页面 |
| **P3: 远程部署** | 2 周 | SSH 远程部署 NF | 部署模块、部署页面 |
| **P4: 批量管理** | 2 周 | Ansible 集成、批量操作 | Playbook、批量页面 |
| **P5: 安全加固** | 1 周 | 认证、加密、审计 | 安全模块 |

### 9.2 里程碑

```
Week 1-2:  Agent 采集原型
           ├── 进程采集模块
           ├── 主机资源采集
           ├── HTTP 上报模块
           └── 配置文件解析

Week 3-4:  主控端集成
           ├── Agent 上报 API
           ├── 节点管理 API
           ├── 前端节点页面
           └── 实时状态推送

Week 5-6:  远程部署功能
           ├── SSH 连接模块
           ├── NF 部署流程
           ├── 部署任务管理
           └── 部署页面开发

Week 7-8:  批量管理能力
           ├── Ansible 集成
           ├── 批量部署脚本
           ├── 批量操作页面
           └── 进度追踪

Week 9:    安全与优化
           ├── Agent 认证
           ├── 通信加密
           ├── 性能优化
           └── 文档完善
```

---

## 10. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| Agent 离线 | 无法采集节点数据 | 心跳检测、告警通知、自动重连 |
| 网络延迟 | 上报数据延迟 | 本地缓存、断点续传 |
| SSH 连接失败 | 无法远程部署 | 多路径尝试、备用连接方式 |
| 大规模部署性能 | 部署耗时过长 | 并行部署、分批执行 |
| 安全漏洞 | 未授权访问 | 认证机制、最小权限、审计日志 |

---

## 附录 A: Agent 安装脚本

```bash
#!/bin/bash
# install-agent.sh - xCloud-CNMS Agent 安装脚本

set -e

CENTER_URL="${1:-http://10.0.1.100:8088}"
NODE_ID="${2:-$(hostname)}"
NODE_NAME="${3:-$(hostname)}"
NF_LIST="${4:-}"

echo "=========================================="
echo "  xCloud-CNMS Agent Installer"
echo "=========================================="
echo "Center URL: $CENTER_URL"
echo "Node ID:    $NODE_ID"
echo "Node Name:  $NODE_NAME"
echo "NF List:    $NF_LIST"
echo "=========================================="

# 创建目录
sudo mkdir -p /opt/xcloud-agent
sudo mkdir -p /etc/xcloud-agent
sudo mkdir -p /var/log/xcloud-agent

# 下载 Agent
echo "Downloading agent..."
wget -q http://repo.internal/xcloud/agent/latest/xcloud-agent \
    -O /opt/xcloud-agent/xcloud-agent
chmod +x /opt/xcloud-agent/xcloud-agent

# 生成配置
echo "Generating configuration..."
cat > /etc/xcloud-agent/agent.json << EOF
{
  "node_id": "$NODE_ID",
  "node_name": "$NODE_NAME",
  "center_url": "$CENTER_URL",
  "report_interval": 10,
  "log_file": "/var/log/xcloud-agent/agent.log",
  "nf_list": [
$(echo "$NF_LIST" | tr ',' '\n' | sed 's/^/    { "name": "/' | sed 's/$/", "type": "systemd" },/' | sed '$ s/,$//')
  ]
}
EOF

# 创建 systemd 服务
echo "Creating systemd service..."
cat > /etc/systemd/system/xcloud-agent.service << EOF
[Unit]
Description=xCloud-CNMS Agent
After=network.target

[Service]
Type=simple
ExecStart=/opt/xcloud-agent/xcloud-agent -config /etc/xcloud-agent/agent.json
Restart=always
RestartSec=5
StandardOutput=append:/var/log/xcloud-agent/agent.log
StandardError=append:/var/log/xcloud-agent/agent.log

[Install]
WantedBy=multi-user.target
EOF

# 启动服务
echo "Starting agent service..."
sudo systemctl daemon-reload
sudo systemctl enable xcloud-agent
sudo systemctl start xcloud-agent

# 验证
sleep 2
if sudo systemctl is-active xcloud-agent; then
    echo "=========================================="
    echo "  Agent installed successfully!"
    echo "=========================================="
    echo "Service status:"
    sudo systemctl status xcloud-agent --no-pager
else
    echo "ERROR: Agent failed to start"
    sudo journalctl -u xcloud-agent --no-pager -n 20
    exit 1
fi
```

---

## 附录 B: 主控端批量部署脚本

```bash
#!/bin/bash
# deploy-all-agents.sh - 批量部署 Agent 到所有 NF 节点

CENTER_URL="http://10.0.1.100:8088"

# 节点定义: IP|节点ID|节点名称|NF列表
NODES=(
    "10.0.1.10|up-node-01|User Plane Node|upfd,sgwud,pgwud"
    "10.0.1.20|cp-node-01|Control Plane Node|amfd,smfd,nrfd,nssfd,scpd,bsfd"
    "10.0.1.30|dm-node-01|Data Management Node|udmd,udrd,ausfd,hssd"
    "10.0.2.10|edge-node-01|Edge Node|mmed,sgwcd,pgwcd"
)

echo "Deploying agents to ${#NODES[@]} nodes..."

for node_info in "${NODES[@]}"; do
    IFS='|' read -r ip id name nfs <<< "$node_info"
    
    echo "[$id] Deploying to $ip ($name)..."
    
    # 复制安装脚本
    scp -q install-agent.sh root@$ip:/tmp/
    
    # 远程执行
    ssh root@$ip "bash /tmp/install-agent.sh $CENTER_URL $id $name $nfs" &
done

wait

echo "=========================================="
echo "  All agents deployed!"
echo "=========================================="
```

---

**文档结束**
