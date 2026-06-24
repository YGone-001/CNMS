package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Site 站点/Region 模型
type Site struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name        string        `bson:"name" json:"name"`                 // 站点名称 (如 "Beijing-DC1")
	Address     string        `bson:"address,omitempty" json:"address"` // 站点地址/IP
	Description string        `bson:"description,omitempty" json:"description"`
	Enabled     bool          `bson:"enabled" json:"enabled"`
	NRFURL      string        `bson:"nrf_url,omitempty" json:"nrf_url"` // NRF 地址
	Type        string        `bson:"type,omitempty" json:"type"`       // 站点类型: region, dc, node
	ParentID    string        `bson:"parent_id,omitempty" json:"parent_id"` // 父站点 ID（用于构建树形结构）
	NFIds       []string      `bson:"nf_ids,omitempty" json:"nf_ids"`   // 关联的 NF 进程名列表
	CreatedAt   time.Time     `bson:"created_at" json:"created_at"`
}
