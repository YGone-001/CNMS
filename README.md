# xCloud-CNMS

5G Core Network Monitoring and Management Platform

## Features

- **Real-time Monitoring**: Process status, CPU, memory via WebSocket
- **MML Terminal**: Man-Machine Language commands for network management
- **Subscriber Management**: CRUD operations on subscriber data
- **Network Topology**: 5GC SBA architecture visualization
- **Alarm System**: Real-time alarms with ACK/CLR, history, webhook notifications
- **Metrics History**: Historical performance data with trend charts
- **Audit Logs**: Track all system operations
- **Scheduled Tasks**: Automated periodic jobs
- **User Management**: Multi-user with role-based access control
- **API Documentation**: OpenAPI 3.0 spec with interactive docs

## Quick Start

### Docker Deployment (Recommended)

```bash
# Start with docker-compose
docker-compose up -d

# Access the web UI
open http://localhost:8080
```

### Manual Build

```bash
# One-click build
./build.sh

# Run
cd backend && ./xcloud-cnms -config config/config.json
```

### Prerequisites

- Go 1.24+
- Node.js 18+
- MongoDB 7+

## Configuration

Edit `config.json` or `backend/config/config.json`:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8080
  },
  "mongodb": {
    "uri": "mongodb://localhost:27017",
    "database": "xCloud"
  },
  "log_dir": "/var/log/xCloud",
  "notify": {
    "webhook_url": "https://hooks.example.com/alarm",
    "min_level": "major"
  },
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "admin123",
    "jwt_key": "your-secret-key-here"
  }
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `server.host` | Listen address | `0.0.0.0` |
| `server.port` | Listen port | `8080` |
| `mongodb.uri` | MongoDB connection URI | `mongodb://localhost:27017` |
| `mongodb.database` | Database name | `xCloud` |
| `log_dir` | NF log directory | `/var/log/xCloud` |
| `notify.webhook_url` | Alarm webhook URL (empty to disable) | - |
| `notify.min_level` | Minimum severity for notifications | `major` |
| `auth.enabled` | Enable JWT authentication | `false` |
| `auth.username` | Login username | `admin` |
| `auth.password` | Login password | `admin123` |
| `auth.jwt_key` | JWT signing secret | - |

## MML Commands

### Subscriber Operations

| Command | Description |
|---------|-------------|
| `ADD-SUB: IMSI=460110000000001, APN=internet;` | Add subscriber |
| `DEL-SUB: IMSI=460110000000001;` | Delete subscriber |
| `LST-SUB:;` | List all subscribers (paginated) |
| `LST-SUB: IMSI=460110000000001;` | Query specific subscriber |
| `LST-SUB: PAGE=1, PAGE_SIZE=10;` | List with pagination |
| `MOD-SUB: IMSI=460110000000001, APN=5gnet, QOS=5;` | Modify subscriber |
| `ADD-SUB-BATCH: FILE=subscribers.csv;` | Batch import from CSV |
| `EXP-SUB: FILE=subscribers.json;` | Export all subscribers |
| `IMP-SUB: FILE=subscribers.json;` | Import from JSON |

### Network Function Control

| Command | Description |
|---------|-------------|
| `CTRL-NF: NAME=amfd, ACTION=restart;` | Restart NF service |
| `CTRL-NF: NAME=amfd, ACTION=stop;` | Stop NF service |
| `CTRL-NF: NAME=amfd, ACTION=start;` | Start NF service |

### Alarm Management

| Command | Description |
|---------|-------------|
| `ACK-ALARM: ID=<alarm_id>;` | Acknowledge alarm |
| `CLR-ALARM: ID=<alarm_id>;` | Clear alarm |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/v1/auth/login` | User login |
| POST | `/api/v1/mml/execute` | Execute MML command |
| WS | `/api/v1/monitor/ws` | Real-time monitoring stream |
| GET | `/api/v1/alarms` | Query alarm history |
| GET | `/api/v1/nf/logs` | Get NF logs |
| GET | `/api/v1/metrics/history` | Query metrics history |
| GET | `/api/v1/audit/logs` | Query audit logs |
| GET | `/api/v1/tasks` | List scheduled tasks |
| GET | `/api/v1/users` | List users |
| GET | `/api/docs` | OpenAPI 3.0 spec |

Full API documentation is available at `/docs` in the web UI.

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, user management |
| **Operator** | MML commands, alarm management |
| **Viewer** | Read-only access |

## Monitoring Targets

The system monitors these xCloud core processes:

`amfd`, `ausfd`, `bsfd`, `drad`, `hssd`, `mmed`, `nrfd`, `nssfd`, `ocsd`, `pcfd`, `pcrfd`, `pgwcd`, `pgwud`, `scpd`, `sgwcd`, `sgwud`, `smfd`, `udmd`, `udrd`, `upfd`

## Alarm Thresholds

| Condition | Severity |
|-----------|----------|
| Process not running | Critical |
| CPU > 80% | Major |
| Memory > 80% | Minor |

## Project Structure

```
xcloud-cnms/
├── backend/
│   ├── main.go                    # Entry point
│   ├── config/config.json         # Default config
│   └── internal/
│       ├── auth/jwt.go            # JWT authentication
│       ├── config/                # Config loading + hot reload
│       ├── handler/               # HTTP handlers
│       ├── mml/parser.go          # MML command parser
│       ├── model/                 # Data models
│       ├── mongo/client.go        # MongoDB wrapper
│       ├── monitor/probe.go       # Process monitoring
│       ├── router/router.go       # Route registration
│       └── ws/handler.go          # WebSocket + alarm generation
├── frontend/
│   └── src/
│       ├── pages/                 # Page components
│       ├── components/            # Shared components
│       ├── context/               # React context
│       ├── hooks/                 # Custom hooks
│       ├── types/                 # TypeScript types
│       └── utils/                 # Utilities
├── Dockerfile                     # Multi-stage Docker build
├── docker-compose.yml             # Docker Compose config
├── build.sh                       # Build script
└── README.md                      # This file
```

## License

Internal use only.
