package config

import (
	"log"
	"os"
	"sync"
	"time"
)

// Watcher 配置文件热加载监视器
type Watcher struct {
	path     string
	mu       sync.RWMutex
	current  *AppConfig
	onChange func(*AppConfig)
	lastMod  time.Time
}

// NewWatcher 创建配置监视器
func NewWatcher(path string, initial *AppConfig, onChange func(*AppConfig)) *Watcher {
	info, err := os.Stat(path)
	var modTime time.Time
	if err == nil {
		modTime = info.ModTime()
	}

	return &Watcher{
		path:     path,
		current:  initial,
		onChange: onChange,
		lastMod:  modTime,
	}
}

// Get 获取当前配置（线程安全）
func (w *Watcher) Get() *AppConfig {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.current
}

// Start 启动配置文件监视，每 5 秒检查一次文件变化
func (w *Watcher) Start() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			w.check()
		}
	}()
}

func (w *Watcher) check() {
	info, err := os.Stat(w.path)
	if err != nil {
		return
	}

	if !info.ModTime().After(w.lastMod) {
		return
	}

	cfg, err := Load(w.path)
	if err != nil {
		log.Printf("config reload failed: %v", err)
		return
	}

	w.mu.Lock()
	w.current = cfg
	w.lastMod = info.ModTime()
	w.mu.Unlock()

	log.Printf("config reloaded from %s", w.path)
	if w.onChange != nil {
		w.onChange(cfg)
	}
}

// Reload 手动触发配置重载
func (w *Watcher) Reload() error {
	cfg, err := Load(w.path)
	if err != nil {
		return err
	}

	w.mu.Lock()
	w.current = cfg
	info, _ := os.Stat(w.path)
	if info != nil {
		w.lastMod = info.ModTime()
	}
	w.mu.Unlock()

	log.Printf("config manually reloaded")
	if w.onChange != nil {
		w.onChange(cfg)
	}
	return nil
}
