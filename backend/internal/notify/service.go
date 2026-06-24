package notify

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/smtp"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"xcloud-cnms/internal/model"
	"xcloud-cnms/internal/mongo"
)

var severityOrder = map[string]int{"critical": 0, "major": 1, "minor": 2, "warning": 3}

// Service 通知服务
type Service struct {
	mongo      *mongo.Client
	httpClient *http.Client
}

// New 创建通知服务
func New(mc *mongo.Client) *Service {
	return &Service{
		mongo:      mc,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// NotifyAlarm 告警触发时调用，根据通道配置发送通知
func (s *Service) NotifyAlarm(alarm model.Alarm) {
	if s.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	coll := s.mongo.Database.Collection("notification_channels")
	cursor, err := coll.Find(ctx, bson.M{"enabled": true})
	if err != nil {
		log.Printf("notify: query channels error: %v", err)
		return
	}
	defer cursor.Close(ctx)

	var channels []model.NotificationChannel
	if err := cursor.All(ctx, &channels); err != nil {
		log.Printf("notify: decode channels error: %v", err)
		return
	}

	for _, ch := range channels {
		if !shouldTrigger(alarm.Severity, ch.MinLevel) {
			continue
		}
		go s.send(ch, alarm)
	}
}

// CheckEscalation 检查未确认告警是否需要升级（由定时任务调用）
func (s *Service) CheckEscalation() {
	if s.mongo == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 读取升级规则
	rulesColl := s.mongo.Database.Collection("escalation_rules")
	cursor, err := rulesColl.Find(ctx, bson.M{"enabled": true})
	if err != nil {
		return
	}
	defer cursor.Close(ctx)

	var rules []model.EscalationRule
	if err := cursor.All(ctx, &rules); err != nil || len(rules) == 0 {
		return
	}

	// 查询未确认且未清除的告警
	alarmsColl := s.mongo.Database.Collection("alarms")
	alarmCursor, err := alarmsColl.Find(ctx, bson.M{
		"acknowledged": false,
		"cleared":      false,
	})
	if err != nil {
		return
	}
	defer alarmCursor.Close(ctx)

	var alarms []model.Alarm
	if err := alarmCursor.All(ctx, &alarms); err != nil {
		return
	}

	now := time.Now()
	for _, alarm := range alarms {
		for _, rule := range rules {
			if alarm.Severity != rule.Severity {
				continue
			}
			waitDuration := time.Duration(rule.MinutesWait) * time.Minute
			if now.Sub(alarm.Timestamp) < waitDuration {
				continue
			}
			// 查找升级目标通道
			ch := s.findChannel(rule.EscalateTo)
			if ch != nil {
				log.Printf("notify: escalating alarm %s (%s) via %s after %d min",
					alarm.Source, alarm.Severity, rule.EscalateTo, rule.MinutesWait)
				go s.send(*ch, alarm)
			}
		}
	}
}

// findChannel 按名称查找通知通道
func (s *Service) findChannel(name string) *model.NotificationChannel {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	coll := s.mongo.Database.Collection("notification_channels")
	var ch model.NotificationChannel
	if err := coll.FindOne(ctx, bson.M{"name": name, "enabled": true}).Decode(&ch); err != nil {
		return nil
	}
	return &ch
}

// send 发送通知到指定通道
func (s *Service) send(ch model.NotificationChannel, alarm model.Alarm) {
	var err error

	switch ch.Type {
	case "email":
		err = s.sendEmail(ch.Config, alarm)
	case "webhook":
		err = s.sendWebhook(ch.Config, alarm)
	case "wechat":
		err = s.sendWeChat(ch.Config, alarm)
	case "dingtalk":
		err = s.sendDingTalk(ch.Config, alarm)
	default:
		log.Printf("notify: unknown channel type %q", ch.Type)
		return
	}

	status := "sent"
	errMsg := ""
	if err != nil {
		status = "failed"
		errMsg = err.Error()
		log.Printf("notify: send to %s failed: %v", ch.Name, err)
	}

	// 记录通知日志
	s.logNotification(ch.Name, alarm, status, errMsg)
}

func (s *Service) logNotification(channel string, alarm model.Alarm, status, errMsg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	entry := model.NotificationLog{
		Channel:  channel,
		AlarmID:  alarm.ID.Hex(),
		Severity: alarm.Severity,
		Source:   alarm.Source,
		Message:  alarm.Message,
		Status:   status,
		Error:    errMsg,
		SentAt:   time.Now(),
	}

	coll := s.mongo.Database.Collection("notification_logs")
	coll.InsertOne(ctx, entry)
}

// -- Email sender ---------------------------------------------------------

func (s *Service) sendEmail(cfg model.ChannelConfig, alarm model.Alarm) error {
	if cfg.SMTPHost == "" || cfg.To == "" {
		return fmt.Errorf("incomplete email config")
	}

	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)
	subject := fmt.Sprintf("[xCloud Alarm] %s - %s", strings.ToUpper(alarm.Severity), alarm.Source)
	body := fmt.Sprintf("Severity: %s\nSource: %s\nMessage: %s\nTime: %s",
		alarm.Severity, alarm.Source, alarm.Message, alarm.Timestamp.Format(time.RFC3339))

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s",
		cfg.From, cfg.To, subject, body)

	var auth smtp.Auth
	if cfg.Username != "" && cfg.Password != "" {
		auth = smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.SMTPHost)
	}

	return smtp.SendMail(addr, auth, cfg.From, strings.Split(cfg.To, ","), []byte(msg))
}

// -- Webhook sender -------------------------------------------------------

func (s *Service) sendWebhook(cfg model.ChannelConfig, alarm model.Alarm) error {
	if cfg.URL == "" {
		return fmt.Errorf("webhook URL is empty")
	}

	payload := map[string]interface{}{
		"severity":   alarm.Severity,
		"source":     alarm.Source,
		"message":    alarm.Message,
		"timestamp":  alarm.Timestamp.Format(time.RFC3339),
		"alarm_id":   alarm.ID.Hex(),
		"count":      alarm.Count,
	}

	data, _ := json.Marshal(payload)
	resp, err := s.httpClient.Post(cfg.URL, "application/json", bytes.NewReader(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned %d", resp.StatusCode)
	}
	return nil
}

// -- WeChat Work sender ---------------------------------------------------

func (s *Service) sendWeChat(cfg model.ChannelConfig, alarm model.Alarm) error {
	if cfg.URL == "" {
		return fmt.Errorf("WeChat webhook URL is empty")
	}

	content := fmt.Sprintf("**告警通知**\n> 级别: %s\n> 来源: %s\n> 详情: %s\n> 时间: %s",
		alarm.Severity, alarm.Source, alarm.Message, alarm.Timestamp.Format("2006-01-02 15:04:05"))

	payload := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]string{"content": content},
	}

	data, _ := json.Marshal(payload)
	resp, err := s.httpClient.Post(cfg.URL, "application/json", bytes.NewReader(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("WeChat returned %d", resp.StatusCode)
	}
	return nil
}

// -- DingTalk sender ------------------------------------------------------

func (s *Service) sendDingTalk(cfg model.ChannelConfig, alarm model.Alarm) error {
	if cfg.URL == "" {
		return fmt.Errorf("DingTalk webhook URL is empty")
	}

	url := cfg.URL
	if cfg.Secret != "" {
		timestamp := time.Now().UnixMilli()
		stringToSign := fmt.Sprintf("%d\n%s", timestamp, cfg.Secret)
		mac := hmac.New(sha256.New, []byte(cfg.Secret))
		mac.Write([]byte(stringToSign))
		sign := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		url = fmt.Sprintf("%s&timestamp=%d&sign=%s", url, timestamp, sign)
	}

	content := fmt.Sprintf("[xCloud] %s | %s | %s",
		strings.ToUpper(alarm.Severity), alarm.Source, alarm.Message)

	payload := map[string]interface{}{
		"msgtype": "text",
		"text":    map[string]string{"content": content},
	}

	data, _ := json.Marshal(payload)
	resp, err := s.httpClient.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("DingTalk returned %d", resp.StatusCode)
	}
	return nil
}

// shouldTrigger 判断告警级别是否达到通知阈值
func shouldTrigger(alarmSeverity, minLevel string) bool {
	a, ok1 := severityOrder[alarmSeverity]
	m, ok2 := severityOrder[minLevel]
	if !ok1 || !ok2 {
		return false
	}
	return a <= m
}
