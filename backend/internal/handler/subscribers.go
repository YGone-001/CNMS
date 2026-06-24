package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// CreateSubscriberRequest 创建订户请求
type CreateSubscriberRequest struct {
	IMSI                  string          `json:"imsi"`
	SubscribedRAUTAUTimer int             `json:"subscribed_rau_tau_timer,omitempty"`
	NetworkAccessMode     int             `json:"network_access_mode,omitempty"`
	SubscriberStatus      int             `json:"subscriber_status,omitempty"`
	AccessRestrData       int             `json:"access_restriction_data,omitempty"`
	Security              *model.Security `json:"security,omitempty"`
	Ambr                  *model.APNAMBR  `json:"ambr,omitempty"`
	Sessions              []model.Session `json:"sessions,omitempty"`
}

// subscriberListResponse 订户列表响应
type subscriberListResponse struct {
	Status      string             `json:"status"`
	Message     string             `json:"message,omitempty"`
	Subscribers []model.Subscriber `json:"subscribers,omitempty"`
	Count       int                `json:"count,omitempty"`
	Page        int                `json:"page,omitempty"`
	PageSize    int                `json:"page_size,omitempty"`
	Total       int64              `json:"total,omitempty"`
}

// GetSubscribers 查询订户列表（分页、按 IMSI 过滤）
func (h *Handler) GetSubscribers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, subscriberListResponse{Status: "error", Message: "method not allowed"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")

	// 构建过滤条件
	filter := bson.M{}
	if imsi := r.URL.Query().Get("imsi"); imsi != "" {
		filter["imsi"] = imsi
	}

	// 查询总数
	total, err := coll.CountDocuments(ctx, filter)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, subscriberListResponse{Status: "error", Message: "count failed: " + err.Error()})
		return
	}

	// 分页参数
	page := 1
	pageSize := 50
	if v := r.URL.Query().Get("page"); v != "" {
		fmt.Sscanf(v, "%d", &page)
		if page < 1 {
			page = 1
		}
	}
	if v := r.URL.Query().Get("page_size"); v != "" {
		fmt.Sscanf(v, "%d", &pageSize)
		if pageSize < 1 || pageSize > 200 {
			pageSize = 50
		}
	}

	skip := int64((page - 1) * pageSize)
	limit := int64(pageSize)
	opts := options.Find().SetSkip(skip).SetLimit(limit).SetSort(bson.M{"imsi": 1})

	cursor, err := coll.Find(ctx, filter, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, subscriberListResponse{Status: "error", Message: "query failed: " + err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var subs []model.Subscriber
	if err := cursor.All(ctx, &subs); err != nil {
		writeJSON(w, http.StatusInternalServerError, subscriberListResponse{Status: "error", Message: "decode failed: " + err.Error()})
		return
	}
	if subs == nil {
		subs = []model.Subscriber{}
	}

	writeJSON(w, http.StatusOK, subscriberListResponse{
		Status:      "ok",
		Message:     fmt.Sprintf("found %d subscriber(s), page %d/%d", total, page, (total+int64(pageSize)-1)/int64(pageSize)),
		Subscribers: subs,
		Count:       len(subs),
		Page:        page,
		PageSize:    pageSize,
		Total:       total,
	})
}

// CreateSubscriber 创建订户
func (h *Handler) CreateSubscriber(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	var req CreateSubscriberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	if req.IMSI == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "imsi is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")

	// 检查 IMSI 是否已存在
	count, _ := coll.CountDocuments(ctx, bson.M{"imsi": req.IMSI})
	if count > 0 {
		writeJSON(w, http.StatusConflict, mmlResponse{Status: "error", Message: "subscriber already exists"})
		return
	}

	// 构建订户文档，填充默认值
	sub := model.Subscriber{
		ID:                    bson.NewObjectID(),
		IMSI:                  req.IMSI,
		SubscribedRAUTAUTimer: req.SubscribedRAUTAUTimer,
		NetworkAccessMode:     req.NetworkAccessMode,
		SubscriberStatus:      req.SubscriberStatus,
		AccessRestrData:       req.AccessRestrData,
	}

	if req.Security != nil {
		sub.Security = *req.Security
	} else {
		sub.Security = model.Security{
			K:   "465B5CE8B199B49FAA5F0A2EE238A6BC",
			Amf: "8000",
		}
	}

	if req.Ambr != nil {
		sub.Ambr = *req.Ambr
	} else {
		sub.Ambr = model.APNAMBR{
			Downlink: model.QoSValue{Value: 1, Unit: 3},
			Uplink:   model.QoSValue{Value: 1, Unit: 3},
		}
	}

	if len(req.Sessions) > 0 {
		sub.Sessions = req.Sessions
	} else {
		sub.Sessions = []model.Session{
			{
				Name: "internet",
				Type: 3,
				Ambr: model.APNAMBR{
					Downlink: model.QoSValue{Value: 1, Unit: 3},
					Uplink:   model.QoSValue{Value: 1, Unit: 3},
				},
				QoS: 9,
			},
		}
	}

	if _, err := coll.InsertOne(ctx, sub); err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "insert failed: " + err.Error()})
		return
	}

	h.writeAuditLog(r, "CREATE-SUB", "subscriber", req.IMSI)

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: "subscriber created",
		IMSI:    req.IMSI,
	})
}

// UpdateSubscriber 更新订户
func (h *Handler) UpdateSubscriber(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	imsi := r.URL.Query().Get("imsi")
	if imsi == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "imsi parameter required"})
		return
	}

	var req CreateSubscriberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "invalid request body"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")

	// 检查订户是否存在
	var existing model.Subscriber
	if err := coll.FindOne(ctx, bson.M{"imsi": imsi}).Decode(&existing); err != nil {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "subscriber not found"})
		return
	}

	// 构建更新字段
	setFields := bson.M{}
	if req.SubscribedRAUTAUTimer != 0 {
		setFields["subscribed_rau_tau_timer"] = req.SubscribedRAUTAUTimer
	}
	if req.NetworkAccessMode != 0 {
		setFields["network_access_mode"] = req.NetworkAccessMode
	}
	if req.SubscriberStatus != 0 {
		setFields["subscriber_status"] = req.SubscriberStatus
	}
	if req.AccessRestrData != 0 {
		setFields["access_restriction_data"] = req.AccessRestrData
	}
	if req.Security != nil {
		setFields["security"] = *req.Security
	}
	if req.Ambr != nil {
		setFields["ambr"] = *req.Ambr
	}
	if len(req.Sessions) > 0 {
		setFields["sessions"] = req.Sessions
	}

	if len(setFields) == 0 {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "no fields to update"})
		return
	}

	result, err := coll.UpdateOne(ctx, bson.M{"imsi": imsi}, bson.M{"$set": setFields})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "update failed: " + err.Error()})
		return
	}
	if result.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "subscriber not found"})
		return
	}

	h.writeAuditLog(r, "UPDATE-SUB", "subscriber", imsi)

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: fmt.Sprintf("subscriber %s updated (%d field(s))", imsi, len(setFields)),
		IMSI:    imsi,
	})
}

// DeleteSubscriber 删除订户
func (h *Handler) DeleteSubscriber(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, mmlResponse{Status: "error", Message: "method not allowed"})
		return
	}

	imsi := r.URL.Query().Get("imsi")
	if imsi == "" {
		writeJSON(w, http.StatusBadRequest, mmlResponse{Status: "error", Message: "imsi parameter required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("subscribers")
	result, err := coll.DeleteOne(ctx, bson.M{"imsi": imsi})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, mmlResponse{Status: "error", Message: "delete failed: " + err.Error()})
		return
	}
	if result.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, mmlResponse{Status: "error", Message: "subscriber not found"})
		return
	}

	h.writeAuditLog(r, "DELETE-SUB", "subscriber", imsi)

	writeJSON(w, http.StatusOK, mmlResponse{
		Status:  "ok",
		Message: "subscriber deleted",
		IMSI:    imsi,
	})
}
