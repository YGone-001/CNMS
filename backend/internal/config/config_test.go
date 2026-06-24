package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoad(t *testing.T) {
	// Create temp config file
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")

	content := `{
		"server": {"host": "127.0.0.1", "port": 9090},
		"mongodb": {"uri": "mongodb://test:27017", "database": "testdb"},
		"log_dir": "/tmp/logs",
		"auth": {"enabled": true, "username": "testuser", "password": "testpass", "jwt_key": "key123"}
	}`
	if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := Load(cfgPath)
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}

	if cfg.Server.Host != "127.0.0.1" {
		t.Errorf("host = %q, want %q", cfg.Server.Host, "127.0.0.1")
	}
	if cfg.Server.Port != 9090 {
		t.Errorf("port = %d, want 9090", cfg.Server.Port)
	}
	if cfg.MongoDB.URI != "mongodb://test:27017" {
		t.Errorf("uri = %q, want %q", cfg.MongoDB.URI, "mongodb://test:27017")
	}
	if cfg.MongoDB.Database != "testdb" {
		t.Errorf("database = %q, want %q", cfg.MongoDB.Database, "testdb")
	}
	if cfg.LogDir != "/tmp/logs" {
		t.Errorf("log_dir = %q, want %q", cfg.LogDir, "/tmp/logs")
	}
	if !cfg.Auth.Enabled {
		t.Error("auth.enabled should be true")
	}
	if cfg.Auth.Username != "testuser" {
		t.Errorf("auth.username = %q, want %q", cfg.Auth.Username, "testuser")
	}
}

func TestLoadDefaults(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")

	content := `{"mongodb": {"uri": "mongodb://localhost:27017", "database": "xCloud"}}`
	if err := os.WriteFile(cfgPath, []byte(content), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := Load(cfgPath)
	if err != nil {
		t.Fatalf("Load error: %v", err)
	}

	if cfg.Server.Host != "0.0.0.0" {
		t.Errorf("default host = %q, want %q", cfg.Server.Host, "0.0.0.0")
	}
	if cfg.Server.Port != 8080 {
		t.Errorf("default port = %d, want 8080", cfg.Server.Port)
	}
	if cfg.LogDir != "/var/log/xCloud" {
		t.Errorf("default log_dir = %q, want %q", cfg.LogDir, "/var/log/xCloud")
	}
}

func TestLoadFileNotFound(t *testing.T) {
	_, err := Load("/nonexistent/config.json")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")

	if err := os.WriteFile(cfgPath, []byte("not json"), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	_, err := Load(cfgPath)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}
