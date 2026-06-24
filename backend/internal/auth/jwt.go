package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

var secretKey []byte

func SetSecret(key string) {
	secretKey = []byte(key)
}

type Claims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	Exp      int64  `json:"exp"`
}

type contextKey string

const claimsKey contextKey = "claims"

// GenerateToken 生成 JWT Token
func GenerateToken(username, role string, duration time.Duration) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))

	claims := Claims{
		Username: username,
		Role:     role,
		Exp:      time.Now().Add(duration).Unix(),
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(claimsJSON)

	unsigned := header + "." + payload
	sig := sign(unsigned)
	return unsigned + "." + sig, nil
}

// ValidateToken 验证 JWT Token 并返回 Claims
func ValidateToken(tokenStr string) (*Claims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	unsigned := parts[0] + "." + parts[1]
	expectedSig := sign(unsigned)
	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return nil, fmt.Errorf("invalid signature")
	}

	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("invalid payload: %w", err)
	}

	var claims Claims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, fmt.Errorf("invalid claims: %w", err)
	}

	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}

func sign(data string) string {
	mac := hmac.New(sha256.New, secretKey)
	mac.Write([]byte(data))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// AuthMiddleware JWT 认证中间件，将 claims 注入 context
func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/auth/login" {
			next(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "missing authorization header"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "invalid authorization format"})
			return
		}

		claims, err := ValidateToken(tokenStr)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "invalid token: " + err.Error()})
			return
		}

		// 将 claims 注入 context，供下游 handler 使用
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

// RequireRole 角色鉴权中间件
func RequireRole(roles ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(claimsKey).(*Claims)
			if !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "no claims in context"})
				return
			}

			allowed := false
			for _, role := range roles {
				if claims.Role == role {
					allowed = true
					break
				}
			}

			if !allowed {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"status": "error", "message": "insufficient permissions"})
				return
			}

			next(w, r)
		}
	}
}

// GetClaimsFromContext 从 context 中提取 claims
func GetClaimsFromContext(ctx context.Context) *Claims {
	if claims, ok := ctx.Value(claimsKey).(*Claims); ok {
		return claims
	}
	return nil
}
