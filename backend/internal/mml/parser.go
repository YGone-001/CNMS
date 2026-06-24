package mml

import (
	"fmt"
	"regexp"
	"strings"

	"xcloud-cnms/internal/model"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Command 解析后的 MML 命令
type Command struct {
	Name   string            // 操作名，如 ADD-SUB
	Params map[string]string // 参数键值对
}

// 命令格式: CMD-NAME: KEY1=VAL1, KEY2=VAL2; 或 CMD-NAME:;
var mmlPattern = regexp.MustCompile(`^\s*([A-Z][A-Z0-9-]*)\s*:\s*(.*?)\s*;\s*$`)

// Parse 将 MML 命令字符串解析为 Command 结构体
// 示例输入: "ADD-SUB: IMSI=460110000000001, APN=internet;" 或 "LST-SUB:;"
func Parse(input string) (*Command, error) {
	matches := mmlPattern.FindStringSubmatch(input)
	if matches == nil {
		return nil, fmt.Errorf("invalid MML format: %s", input)
	}

	cmd := &Command{
		Name:   matches[1],
		Params: make(map[string]string),
	}

	// 参数部分可为空（如 LST-SUB:;）
	paramStr := strings.TrimSpace(matches[2])
	if paramStr != "" {
		pairs := strings.Split(paramStr, ",")
		for _, pair := range pairs {
			pair = strings.TrimSpace(pair)
			kv := strings.SplitN(pair, "=", 2)
			if len(kv) != 2 {
				return nil, fmt.Errorf("invalid parameter: %s", pair)
			}
			key := strings.TrimSpace(kv[0])
			val := strings.TrimSpace(kv[1])
			cmd.Params[key] = val
		}
	}

	return cmd, nil
}

// ValidateDELSub 校验 DEL-SUB 命令参数，返回 IMSI
func ValidateDELSub(cmd *Command) (string, error) {
	imsi, ok := cmd.Params["IMSI"]
	if !ok || imsi == "" {
		return "", fmt.Errorf("IMSI is required")
	}
	return imsi, nil
}

// ValidateLSTSub 校验 LST-SUB 命令参数，返回 IMSI（可为空表示全量查询）及分页参数
func ValidateLSTSub(cmd *Command) (imsi string, page int, pageSize int, err error) {
	imsi = cmd.Params["IMSI"]

	page = 1
	pageSize = 20

	if v, ok := cmd.Params["PAGE"]; ok {
		if _, parseErr := fmt.Sscanf(v, "%d", &page); parseErr != nil || page < 1 {
			return "", 0, 0, fmt.Errorf("invalid PAGE value: %s", v)
		}
	}
	if v, ok := cmd.Params["PAGE_SIZE"]; ok {
		if _, parseErr := fmt.Sscanf(v, "%d", &pageSize); parseErr != nil || pageSize < 1 || pageSize > 100 {
			return "", 0, 0, fmt.Errorf("invalid PAGE_SIZE value: %s (allowed: 1-100)", v)
		}
	}

	return imsi, page, pageSize, nil
}

// ValidateMODSub 校验 MOD-SUB 命令参数，返回 IMSI 和待修改字段
func ValidateMODSub(cmd *Command) (string, map[string]string, error) {
	imsi, ok := cmd.Params["IMSI"]
	if !ok || imsi == "" {
		return "", nil, fmt.Errorf("IMSI is required")
	}
	// 收集除 IMSI 外的可修改字段
	allowed := map[string]bool{"APN": true, "QOS": true, "AMBR_DL": true, "AMBR_UL": true, "AMBR_UNIT": true}
	updates := make(map[string]string)
	for k, v := range cmd.Params {
		if k == "IMSI" {
			continue
		}
		if !allowed[k] {
			return "", nil, fmt.Errorf("unsupported field: %s (allowed: APN, QOS, AMBR_DL, AMBR_UL, AMBR_UNIT)", k)
		}
		updates[k] = v
	}
	if len(updates) == 0 {
		return "", nil, fmt.Errorf("at least one field to modify is required")
	}
	return imsi, updates, nil
}

// CtrlNFParams CTRL-NF 命令参数
type CtrlNFParams struct {
	Name   string // 网元进程名，如 amfd
	Action string // 操作类型，如 restart
}

// ValidateACKAlarm 校验 ACK-ALARM 命令参数
func ValidateACKAlarm(cmd *Command) (string, error) {
	id, ok := cmd.Params["ID"]
	if !ok || id == "" {
		return "", fmt.Errorf("ID is required")
	}
	return id, nil
}

// ValidateCLRAlarm 校验 CLR-ALARM 命令参数
func ValidateCLRAlarm(cmd *Command) (string, error) {
	id, ok := cmd.Params["ID"]
	if !ok || id == "" {
		return "", fmt.Errorf("ID is required")
	}
	return id, nil
}

// ValidateBatchSub 校验 ADD-SUB-BATCH 命令参数
func ValidateBatchSub(cmd *Command) (string, error) {
	file, ok := cmd.Params["FILE"]
	if !ok || file == "" {
		return "", fmt.Errorf("FILE is required")
	}
	return file, nil
}

// ValidateExportSub 校验 EXP-SUB 命令参数
func ValidateExportSub(cmd *Command) (string, error) {
	file, ok := cmd.Params["FILE"]
	if !ok || file == "" {
		return "", fmt.Errorf("FILE is required")
	}
	return file, nil
}

// ValidateImportSub 校验 IMP-SUB 命令参数
func ValidateImportSub(cmd *Command) (string, error) {
	file, ok := cmd.Params["FILE"]
	if !ok || file == "" {
		return "", fmt.Errorf("FILE is required")
	}
	return file, nil
}

// ValidateCtrlNF 校验 CTRL-NF 命令参数
func ValidateCtrlNF(cmd *Command) (*CtrlNFParams, error) {
	name, ok := cmd.Params["NAME"]
	if !ok || name == "" {
		return nil, fmt.Errorf("NAME is required")
	}
	action, ok := cmd.Params["ACTION"]
	if !ok || action == "" {
		return nil, fmt.Errorf("ACTION is required")
	}
	if action != "restart" && action != "stop" && action != "start" {
		return nil, fmt.Errorf("unsupported ACTION: %s (allowed: start, stop, restart)", action)
	}
	return &CtrlNFParams{Name: name, Action: action}, nil
}

// ToSubscriber 将 MML 命令转换为 xCloud Subscriber 文档
// 仅支持 ADD-SUB 命令
func ToSubscriber(cmd *Command) (*model.Subscriber, error) {
	if cmd.Name != "ADD-SUB" {
		return nil, fmt.Errorf("unsupported command: %s", cmd.Name)
	}

	imsi, ok := cmd.Params["IMSI"]
	if !ok || imsi == "" {
		return nil, fmt.Errorf("IMSI is required")
	}

	sub := &model.Subscriber{
		ID:                    bson.NewObjectID(),
		IMSI:                  imsi,
		SubscribedRAUTAUTimer: 12,
		NetworkAccessMode:     0,
		SubscriberStatus:      0,
		AccessRestrData:       8,
		Security: model.Security{
			K:   "465B5CE8B199B49FAA5F0A2EE238A6BC",
			Amf: "8000",
		},
		Ambr: model.APNAMBR{
			Downlink: model.QoSValue{Value: 1, Unit: 3},
			Uplink:   model.QoSValue{Value: 1, Unit: 3},
		},
	}

	// APN 参数可选，默认 internet
	apn := cmd.Params["APN"]
	if apn == "" {
		apn = "internet"
	}
	sub.Sessions = []model.Session{
		{
			Name: apn,
			Type: 3, // IPv4v6
			Ambr: model.APNAMBR{
				Downlink: model.QoSValue{Value: 1, Unit: 3},
				Uplink:   model.QoSValue{Value: 1, Unit: 3},
			},
			QoS: 9,
		},
	}

	return sub, nil
}
