package model

import "go.mongodb.org/mongo-driver/v2/bson"

// Security 认证密钥信息
type Security struct {
	K   string `bson:"k" json:"k"`
	Amf string `bson:"amf" json:"amf"`
	Op  string `bson:"op,omitempty" json:"op,omitempty"`
	Opc string `bson:"opc,omitempty" json:"opc,omitempty"`
}

// QoSValue 带宽值，包含数值和单位
type QoSValue struct {
	Value int `bson:"value" json:"value"`
	Unit  int `bson:"unit" json:"unit"`
}

// APNAMBR APN 聚合最大比特率
type APNAMBR struct {
	Downlink QoSValue `bson:"downlink" json:"downlink"`
	Uplink   QoSValue `bson:"uplink" json:"uplink"`
}

// Session PDU 会话配置
type Session struct {
	Name        string  `bson:"name" json:"name"`
	Type        int     `bson:"type" json:"type"`
	Ambr        APNAMBR `bson:"ambr" json:"ambr"`
	QoS         int     `bson:"qos" json:"qos"`
	Enable5gQoS bool    `bson:"_5qi,omitempty" json:"enable_5g_qos,omitempty"`
}

// Subscriber xCloud subscribers 集合文档结构
type Subscriber struct {
	ID                    bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	IMSI                  string        `bson:"imsi" json:"imsi"`
	SubscribedRAUTAUTimer int           `bson:"subscribed_rau_tau_timer" json:"subscribed_rau_tau_timer"`
	NetworkAccessMode     int           `bson:"network_access_mode" json:"network_access_mode"`
	SubscriberStatus      int           `bson:"subscriber_status" json:"subscriber_status"`
	AccessRestrData       int           `bson:"access_restriction_data" json:"access_restriction_data"`
	Security              Security      `bson:"security" json:"security"`
	Ambr                  APNAMBR       `bson:"ambr" json:"ambr"`
	Sessions              []Session     `bson:"sessions" json:"sessions"`
}
