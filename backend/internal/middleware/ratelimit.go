package middleware

import (
	"net/http"
	"sync"
	"time"
)

// tokenBucket 简易令牌桶限流器
type tokenBucket struct {
	mu       sync.Mutex
	tokens   float64
	capacity float64
	rate     float64 // tokens per second
	last     time.Time
}

func newTokenBucket(rate float64, capacity float64) *tokenBucket {
	return &tokenBucket{
		tokens:   capacity,
		capacity: capacity,
		rate:     rate,
		last:     time.Now(),
	}
}

func (tb *tokenBucket) allow() bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(tb.last).Seconds()
	tb.last = now

	tb.tokens += elapsed * tb.rate
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}

	if tb.tokens >= 1 {
		tb.tokens--
		return true
	}
	return false
}

// RateLimiter 基于 IP 的速率限制中间件
// rate: 每秒允许的请求数, capacity: 令牌桶容量
func RateLimiter(rate float64, capacity float64, next http.HandlerFunc) http.HandlerFunc {
	buckets := &sync.Map{}

	// 定期清理过期桶
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			buckets.Range(func(key, value interface{}) bool {
				buckets.Delete(key)
				return true
			})
		}
	}()

	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		// 尝试从 X-Forwarded-For 获取真实 IP
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			ip = xff
		}

		val, _ := buckets.LoadOrStore(ip, newTokenBucket(rate, capacity))
		bucket := val.(*tokenBucket)

		if !bucket.allow() {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"status":"error","message":"rate limit exceeded"}`))
			return
		}

		next(w, r)
	}
}
