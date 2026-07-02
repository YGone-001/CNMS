package handler

import (
	"net/http"
)

// SwaggerSpec 返回 OpenAPI 3.0 规范文档
func (h *Handler) SwaggerSpec(w http.ResponseWriter, r *http.Request) {
	spec := `{
  "openapi": "3.0.3",
  "info": {
    "title": "xCloud-CNMS API",
    "description": "5G Core Network Monitoring and Management Platform API",
    "version": "1.1.0",
    "contact": {
      "name": "xCloud Support"
    }
  },
  "servers": [
    {
      "url": "/api",
      "description": "API Server"
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": ["System"],
        "summary": "Health check",
        "operationId": "healthCheck",
        "responses": {
          "200": {
            "description": "Service is healthy",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string", "example": "ok" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/auth/login": {
      "post": {
        "tags": ["Authentication"],
        "summary": "User login",
        "operationId": "login",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["username", "password"],
                "properties": {
                  "username": { "type": "string", "example": "admin" },
                  "password": { "type": "string", "example": "admin123" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Login successful",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "message": { "type": "string" },
                    "token": { "type": "string" }
                  }
                }
              }
            }
          },
          "401": { "description": "Invalid credentials" }
        }
      }
    },
    "/v1/mml/execute": {
      "post": {
        "tags": ["MML"],
        "summary": "Execute MML command",
        "operationId": "executeMML",
        "description": "Execute a Man-Machine Language command for network management",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["command"],
                "properties": {
                  "command": {
                    "type": "string",
                    "description": "MML command string",
                    "example": "LST-SUB: PAGE=1, PAGE_SIZE=20;"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Command executed",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/MmlResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/monitor/ws": {
      "get": {
        "tags": ["Monitoring"],
        "summary": "WebSocket monitoring stream",
        "operationId": "monitorWS",
        "description": "Establish WebSocket connection for real-time process status (push every 2s)",
        "responses": {
          "101": { "description": "WebSocket upgrade" }
        }
      }
    },
    "/v1/alarms": {
      "get": {
        "tags": ["Alarms"],
        "summary": "Query alarm history",
        "operationId": "getAlarms",
        "parameters": [
          { "name": "severity", "in": "query", "schema": { "type": "string", "enum": ["critical", "major", "minor", "warning"] } },
          { "name": "source", "in": "query", "schema": { "type": "string" } },
          { "name": "active", "in": "query", "schema": { "type": "string" }, "description": "Set to 'true' for active alarms only" },
          { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
          { "name": "page_size", "in": "query", "schema": { "type": "integer", "default": 50 } }
        ],
        "responses": {
          "200": {
            "description": "Alarm list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "alarms": { "type": "array", "items": { "$ref": "#/components/schemas/Alarm" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/nf/logs": {
      "get": {
        "tags": ["Logs"],
        "summary": "Get NF logs",
        "operationId": "getNFLogs",
        "parameters": [
          { "name": "name", "in": "query", "required": true, "schema": { "type": "string" }, "description": "NF process name" },
          { "name": "tail", "in": "query", "schema": { "type": "integer", "default": 100 } },
          { "name": "keyword", "in": "query", "schema": { "type": "string" } },
          { "name": "level", "in": "query", "schema": { "type": "string", "enum": ["ERROR", "WARN", "INFO", "DEBUG"] } }
        ],
        "responses": {
          "200": {
            "description": "Log lines",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "logs": { "type": "array", "items": { "$ref": "#/components/schemas/LogLine" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/metrics/history": {
      "get": {
        "tags": ["Metrics"],
        "summary": "Query metrics history",
        "operationId": "getMetricsHistory",
        "parameters": [
          { "name": "name", "in": "query", "schema": { "type": "string" }, "description": "Process name filter" },
          { "name": "from", "in": "query", "schema": { "type": "string", "format": "date-time" } },
          { "name": "to", "in": "query", "schema": { "type": "string", "format": "date-time" } },
          { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
          { "name": "page_size", "in": "query", "schema": { "type": "integer", "default": 500 } }
        ],
        "responses": {
          "200": {
            "description": "Metrics data points",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "data": { "type": "array", "items": { "$ref": "#/components/schemas/MetricPoint" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/audit/logs": {
      "get": {
        "tags": ["Audit"],
        "summary": "Query audit logs",
        "operationId": "getAuditLogs",
        "parameters": [
          { "name": "user", "in": "query", "schema": { "type": "string" } },
          { "name": "action", "in": "query", "schema": { "type": "string" } },
          { "name": "resource", "in": "query", "schema": { "type": "string" } },
          { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
          { "name": "page_size", "in": "query", "schema": { "type": "integer", "default": 50 } }
        ],
        "responses": {
          "200": {
            "description": "Audit log entries",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "logs": { "type": "array", "items": { "$ref": "#/components/schemas/AuditLog" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/tasks": {
      "get": {
        "tags": ["Tasks"],
        "summary": "List scheduled tasks",
        "operationId": "getTasks",
        "responses": {
          "200": {
            "description": "Task list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "tasks": { "type": "array", "items": { "$ref": "#/components/schemas/ScheduledTask" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/users": {
      "get": {
        "tags": ["Users"],
        "summary": "List users",
        "operationId": "getUsers",
        "responses": {
          "200": {
            "description": "User list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "users": { "type": "array", "items": { "$ref": "#/components/schemas/User" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/capture/start": {
      "post": {
        "tags": ["Capture"],
        "summary": "Start packet capture",
        "operationId": "startCapture",
        "description": "Start a tcpdump packet capture session. Only one session can run at a time.",
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string", "description": "User-defined capture name" },
                  "interface": { "type": "string", "default": "any", "description": "Network interface" },
                  "protocol": { "type": "string", "description": "Protocol preset key (volte_full, sip, diameter, gtp, etc.)" },
                  "filter": { "type": "string", "description": "Custom BPF filter expression (overrides protocol preset)" },
                  "max_duration": { "type": "integer", "default": 300, "maximum": 3600, "description": "Max capture duration in seconds" },
                  "max_size": { "type": "integer", "default": 100, "maximum": 500, "description": "Max file size in MB" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Capture started", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/CaptureSession" } } } },
          "409": { "description": "Another capture is already running" }
        }
      }
    },
    "/v1/capture/stop": {
      "post": {
        "tags": ["Capture"],
        "summary": "Stop packet capture",
        "operationId": "stopCapture",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["id"],
                "properties": {
                  "id": { "type": "string", "description": "Capture session ID" }
                }
              }
            }
          }
        },
        "responses": {
          "200": { "description": "Capture stopped", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/CaptureSession" } } } },
          "400": { "description": "Session is not running" }
        }
      }
    },
    "/v1/capture/sessions": {
      "get": {
        "tags": ["Capture"],
        "summary": "List capture sessions",
        "operationId": "getCaptureSessions",
        "parameters": [
          { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
          { "name": "page_size", "in": "query", "schema": { "type": "integer", "default": 20 } },
          { "name": "status", "in": "query", "schema": { "type": "string", "enum": ["running", "completed", "error"] } }
        ],
        "responses": {
          "200": {
            "description": "Session list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "sessions": { "type": "array", "items": { "$ref": "#/components/schemas/CaptureSession" } },
                    "total": { "type": "integer" }
                  }
                }
              }
            }
          }
        }
      },
      "delete": {
        "tags": ["Capture"],
        "summary": "Delete capture session and PCAP file",
        "operationId": "deleteCaptureSession",
        "parameters": [
          { "name": "id", "in": "query", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": { "description": "Deleted" },
          "400": { "description": "Cannot delete a running session" }
        }
      }
    },
    "/v1/capture/download": {
      "get": {
        "tags": ["Capture"],
        "summary": "Download PCAP file",
        "operationId": "downloadCapture",
        "parameters": [
          { "name": "id", "in": "query", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "PCAP file stream",
            "content": {
              "application/octet-stream": {
                "schema": { "type": "string", "format": "binary" }
              }
            }
          },
          "400": { "description": "Capture not completed" }
        }
      }
    },
    "/v1/capture/presets": {
      "get": {
        "tags": ["Capture"],
        "summary": "List protocol preset templates",
        "operationId": "getCapturePresets",
        "responses": {
          "200": {
            "description": "Preset list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string" },
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "key": { "type": "string" },
                          "label": { "type": "string" },
                          "filter": { "type": "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "MmlResponse": {
        "type": "object",
        "properties": {
          "status": { "type": "string", "enum": ["ok", "error"] },
          "message": { "type": "string" },
          "imsi": { "type": "string" },
          "subscribers": { "type": "array", "items": { "type": "object" } },
          "count": { "type": "integer" },
          "page": { "type": "integer" },
          "page_size": { "type": "integer" },
          "total": { "type": "integer" }
        }
      },
      "Alarm": {
        "type": "object",
        "properties": {
          "_id": { "type": "string" },
          "severity": { "type": "string", "enum": ["critical", "major", "minor", "warning"] },
          "source": { "type": "string" },
          "message": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" },
          "acknowledged": { "type": "boolean" },
          "ack_by": { "type": "string" },
          "ack_at": { "type": "string", "format": "date-time" },
          "cleared": { "type": "boolean" },
          "cleared_by": { "type": "string" },
          "cleared_at": { "type": "string", "format": "date-time" }
        }
      },
      "LogLine": {
        "type": "object",
        "properties": {
          "timestamp": { "type": "string" },
          "level": { "type": "string" },
          "message": { "type": "string" }
        }
      },
      "MetricPoint": {
        "type": "object",
        "properties": {
          "_id": { "type": "string" },
          "name": { "type": "string" },
          "pid": { "type": "integer" },
          "cpu_percent": { "type": "number" },
          "memory_rss": { "type": "integer" },
          "memory_vms": { "type": "integer" },
          "memory_percent": { "type": "number" },
          "running": { "type": "boolean" },
          "timestamp": { "type": "string", "format": "date-time" }
        }
      },
      "AuditLog": {
        "type": "object",
        "properties": {
          "_id": { "type": "string" },
          "user": { "type": "string" },
          "action": { "type": "string" },
          "resource": { "type": "string" },
          "detail": { "type": "string" },
          "ip": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" }
        }
      },
      "ScheduledTask": {
        "type": "object",
        "properties": {
          "_id": { "type": "string" },
          "name": { "type": "string" },
          "type": { "type": "string" },
          "cron": { "type": "string" },
          "target": { "type": "string" },
          "command": { "type": "string" },
          "enabled": { "type": "boolean" },
          "last_run": { "type": "string", "format": "date-time" },
          "next_run": { "type": "string", "format": "date-time" },
          "created_at": { "type": "string", "format": "date-time" }
        }
      },
      "User": {
        "type": "object",
        "properties": {
          "_id": { "type": "string" },
          "username": { "type": "string" },
          "role": { "type": "string", "enum": ["admin", "operator", "viewer"] },
          "enabled": { "type": "boolean" },
          "created_at": { "type": "string", "format": "date-time" },
          "last_login": { "type": "string", "format": "date-time" }
        }
      },
      "CaptureSession": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "status": { "type": "string", "enum": ["idle", "running", "stopping", "completed", "error"] },
          "interface": { "type": "string" },
          "filter": { "type": "string" },
          "protocol": { "type": "string" },
          "max_duration": { "type": "integer" },
          "max_size": { "type": "integer" },
          "file_path": { "type": "string" },
          "file_size": { "type": "integer" },
          "packet_count": { "type": "integer" },
          "pid": { "type": "integer" },
          "started_by": { "type": "string" },
          "started_at": { "type": "string", "format": "date-time" },
          "stopped_at": { "type": "string", "format": "date-time" },
          "error": { "type": "string" }
        }
      }
    },
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    }
  },
  "security": [{ "bearerAuth": [] }]
}`

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(spec))
}
