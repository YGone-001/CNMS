package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// MetricPoint 单个指标数据点
type MetricPoint struct {
	ID            bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name          string        `bson:"name" json:"name"`
	PID           int32         `bson:"pid" json:"pid"`
	CPUPercent    float64       `bson:"cpu_percent" json:"cpu_percent"`
	MemoryRSS     uint64        `bson:"memory_rss" json:"memory_rss"`
	MemoryVMS     uint64        `bson:"memory_vms" json:"memory_vms"`
	MemoryPercent float32       `bson:"memory_percent" json:"memory_percent"`
	Running       bool          `bson:"running" json:"running"`
	Timestamp     time.Time     `bson:"timestamp" json:"timestamp"`
}

// ScheduledTask 定时任务
type ScheduledTask struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name      string        `bson:"name" json:"name"`
	Type      string        `bson:"type" json:"type"` // health_check, restart, cleanup, custom
	Cron      string        `bson:"cron" json:"cron"` // cron expression
	Target    string        `bson:"target,omitempty" json:"target,omitempty"`
	Command   string        `bson:"command,omitempty" json:"command,omitempty"`
	Enabled   bool          `bson:"enabled" json:"enabled"`
	LastRun   *time.Time    `bson:"last_run,omitempty" json:"last_run,omitempty"`
	NextRun   *time.Time    `bson:"next_run,omitempty" json:"next_run,omitempty"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
}

// AuditLog 操作审计日志
type AuditLog struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	User      string        `bson:"user" json:"user"`
	Action    string        `bson:"action" json:"action"`
	Resource  string        `bson:"resource" json:"resource"`
	Detail    string        `bson:"detail,omitempty" json:"detail,omitempty"`
	IP        string        `bson:"ip" json:"ip"`
	Timestamp time.Time     `bson:"timestamp" json:"timestamp"`
}

// User 用户
type User struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Username  string        `bson:"username" json:"username"`
	Password  string        `bson:"password" json:"password,omitempty"` // bcrypt hash
	Role      string        `bson:"role" json:"role"`                   // admin, operator, viewer
	Enabled   bool          `bson:"enabled" json:"enabled"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
	LastLogin *time.Time    `bson:"last_login,omitempty" json:"last_login,omitempty"`
}
