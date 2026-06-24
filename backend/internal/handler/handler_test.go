package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"xcloud-cnms/internal/config"
)

func TestHealth(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "ok" {
		t.Errorf("status = %q, want %q", resp["status"], "ok")
	}
}

func TestLoginMethodNotAllowed(t *testing.T) {
	h := &Handler{Auth: config.AuthConfig{Username: "admin", Password: "admin123"}}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/login", nil)
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestLoginSuccess(t *testing.T) {
	h := &Handler{Auth: config.AuthConfig{Username: "admin", Password: "admin123"}}

	body, _ := json.Marshal(LoginRequest{Username: "admin", Password: "admin123"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp LoginResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Status != "ok" {
		t.Errorf("status = %q, want %q", resp.Status, "ok")
	}
	if resp.Token == "" {
		t.Error("token is empty")
	}
}

func TestLoginInvalidCredentials(t *testing.T) {
	h := &Handler{Auth: config.AuthConfig{Username: "admin", Password: "admin123"}}

	body, _ := json.Marshal(LoginRequest{Username: "admin", Password: "wrong"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestMMLExecuteMethodNotAllowed(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/mml/execute", nil)
	w := httptest.NewRecorder()

	h.MMLExecute(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestMMLExecuteInvalidBody(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/mml/execute", bytes.NewReader([]byte("not json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.MMLExecute(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestMMLExecuteInvalidCommand(t *testing.T) {
	h := &Handler{}

	body, _ := json.Marshal(mmlRequest{Command: "INVALID"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/mml/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.MMLExecute(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestMMLExecuteUnsupportedCommand(t *testing.T) {
	h := &Handler{}

	body, _ := json.Marshal(mmlRequest{Command: "UNKNOWN: KEY=VAL;"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/mml/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.MMLExecute(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}

	var resp mmlResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Message == "" {
		t.Error("error message is empty")
	}
}

func TestGetAlarmHistoryMethodNotAllowed(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/alarms", nil)
	w := httptest.NewRecorder()

	h.GetAlarmHistory(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestGetNFLogsMissingName(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/nf/logs", nil)
	w := httptest.NewRecorder()

	h.GetNFLogs(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestGetNFLogsInvalidName(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/nf/logs?name=../etc/passwd", nil)
	w := httptest.NewRecorder()

	h.GetNFLogs(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestGetMetricsHistoryMethodNotAllowed(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/metrics/history", nil)
	w := httptest.NewRecorder()

	h.GetMetricsHistory(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestGetAuditLogsMethodNotAllowed(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/audit/logs", nil)
	w := httptest.NewRecorder()

	h.GetAuditLogs(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestGetScheduledTasksMethodNotAllowed(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tasks", nil)
	w := httptest.NewRecorder()

	h.GetScheduledTasks(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestGetUsersMethodNotAllowed(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", nil)
	w := httptest.NewRecorder()

	h.GetUsers(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", w.Code)
	}
}

func TestSwaggerSpec(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodGet, "/api/docs", nil)
	w := httptest.NewRecorder()

	h.SwaggerSpec(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("content-type = %q, want application/json", w.Header().Get("Content-Type"))
	}

	// Verify it's valid JSON
	var spec map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&spec); err != nil {
		t.Errorf("invalid JSON: %v", err)
	}

	if spec["openapi"] != "3.0.3" {
		t.Errorf("openapi = %v, want 3.0.3", spec["openapi"])
	}
}
