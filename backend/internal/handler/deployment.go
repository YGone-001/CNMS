package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"xcloud-cnms/internal/monitor"
)

// GetDeploymentTemplates 获取所有部署模板
func (h *Handler) GetDeploymentTemplates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	templates := monitor.GetDefaultTemplates()

	// 转换为数组格式
	var templateList []monitor.DeploymentTemplate
	for _, t := range templates {
		templateList = append(templateList, *t)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"templates": templateList,
	})
}

// GetDeploymentStatus 获取当前部署状态（增强版）
func (h *Handler) GetDeploymentStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	// 从数据库读取当前模板配置
	templateName := h.getDeploymentTemplate()
	templates := monitor.GetDefaultTemplates()

	template, ok := templates[templateName]
	if !ok {
		template = monitor.GetDefaultTemplate()
	}

	// 创建探针并获取状态
	probe := monitor.NewWithTemplate(template)
	status, err := probe.GetCurrentStatusEnhanced()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"data":   status,
	})
}

// SetDeploymentTemplate 设置部署模板
func (h *Handler) SetDeploymentTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	var req struct {
		Template string `json:"template"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "invalid request body",
		})
		return
	}

	// 验证模板是否存在
	templates := monitor.GetDefaultTemplates()
	if _, ok := templates[req.Template]; !ok {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "invalid template name",
		})
		return
	}

	// 保存到数据库
	if err := h.saveDeploymentTemplate(req.Template); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "ok",
		"template": req.Template,
	})
}

// getDeploymentTemplate 从数据库获取当前部署模板
func (h *Handler) getDeploymentTemplate() string {
	if h.Mongo == nil {
		return "auto" // 默认使用自动检测模式
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("settings")
	var result struct {
		Value string `bson:"value"`
	}

	err := coll.FindOne(ctx, map[string]interface{}{
		"key": "deployment_template",
	}).Decode(&result)

	if err != nil {
		return "auto" // 默认使用自动检测模式
	}

	return result.Value
}

// saveDeploymentTemplate 保存部署模板到数据库
func (h *Handler) saveDeploymentTemplate(template string) error {
	if h.Mongo == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	coll := h.Mongo.Database.Collection("settings")

	// 使用 upsert 更新或插入
	_, err := coll.UpdateOne(ctx,
		map[string]interface{}{"key": "deployment_template"},
		map[string]interface{}{
			"$set": map[string]interface{}{
				"key":   "deployment_template",
				"value": template,
			},
		},
	)

	return err
}

// GetComponentStatus 获取单个组件的详细状态
func (h *Handler) GetComponentStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "method not allowed",
		})
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "component name is required",
		})
		return
	}

	// 获取当前模板
	templateName := h.getDeploymentTemplate()
	templates := monitor.GetDefaultTemplates()
	template, ok := templates[templateName]
	if !ok {
		template = monitor.GetDefaultTemplate()
	}

	// 查找组件配置
	var comp *monitor.ComponentConfig
	for _, c := range template.Components {
		if c.Name == name {
			comp = &c
			break
		}
	}

	if comp == nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{
			"status":  "error",
			"message": "component not found in template",
		})
		return
	}

	// 获取进程状态
	probe := monitor.NewWithTemplate(template)
	status, err := probe.GetCurrentStatusEnhanced()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"status":  "error",
			"message": err.Error(),
		})
		return
	}

	// 查找进程状态
	var procStatus *monitor.ProcessStatusEnhanced
	for _, ps := range status.Processes {
		if ps.Name == name {
			procStatus = &ps
			break
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"component": comp,
		"process":   procStatus,
	})
}
