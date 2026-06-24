package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ConfigBackup NF 配置备份记录
type ConfigBackup struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	NFName    string        `bson:"nf_name" json:"nf_name"`       // NF 进程名
	FilePath  string        `bson:"file_path" json:"file_path"`   // 原始文件路径
	Content   string        `bson:"content" json:"content"`       // 配置文件内容
	Checksum  string        `bson:"checksum" json:"checksum"`     // SHA256 校验和
	Size      int64         `bson:"size" json:"size"`             // 文件大小(bytes)
	Version   int           `bson:"version" json:"version"`       // 版本号(自增)
	Comment   string        `bson:"comment,omitempty" json:"comment,omitempty"`
	CreatedAt time.Time     `bson:"created_at" json:"created_at"`
}
