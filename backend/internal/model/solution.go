package model

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Attachment 知识库附件
type KbAttachment struct {
	OriginalName string `bson:"original_name" json:"original_name"`
	URL          string `bson:"url" json:"url"`
	Size         int64  `bson:"size" json:"size"`
	Type         string `bson:"type" json:"type"`
}

// Solution 知识库条目 (solutions 集合)
type Solution struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Title       string        `bson:"title" json:"title"`
	Protocol    string        `bson:"protocol" json:"protocol"`
	Phenomenon  string        `bson:"phenomenon" json:"phenomenon"`
	RootCause   string        `bson:"root_cause" json:"root_cause"`
	Solution    string        `bson:"solution" json:"solution"`
	Tags        []string      `bson:"tags" json:"tags"`
	Attachments []KbAttachment `bson:"attachments" json:"attachments"`
	CreatedAt   time.Time     `bson:"created_at" json:"created_at"`
	OwnerID     string        `bson:"owner_id" json:"owner_id"`
}
