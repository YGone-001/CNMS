package auth

import (
	"testing"
	"time"
)

func TestGenerateAndValidateToken(t *testing.T) {
	SetSecret("test-secret-key")

	token, err := GenerateToken("admin", "admin", 1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken error: %v", err)
	}

	if token == "" {
		t.Fatal("token is empty")
	}

	// Token should have 3 parts
	parts := splitToken(token)
	if len(parts) != 3 {
		t.Fatalf("token has %d parts, want 3", len(parts))
	}

	claims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken error: %v", err)
	}

	if claims.Username != "admin" {
		t.Errorf("username = %q, want %q", claims.Username, "admin")
	}
	if claims.Role != "admin" {
		t.Errorf("role = %q, want %q", claims.Role, "admin")
	}

	if claims.Exp <= time.Now().Unix() {
		t.Error("token should not be expired")
	}
}

func TestValidateTokenExpired(t *testing.T) {
	SetSecret("test-secret-key")

	token, err := GenerateToken("admin", "admin", -1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken error: %v", err)
	}

	_, err = ValidateToken(token)
	if err == nil {
		t.Error("expected error for expired token")
	}
}

func TestValidateTokenInvalidSignature(t *testing.T) {
	SetSecret("secret-1")
	token, err := GenerateToken("admin", "admin", 1*time.Hour)
	if err != nil {
		t.Fatalf("GenerateToken error: %v", err)
	}

	SetSecret("secret-2")
	_, err = ValidateToken(token)
	if err == nil {
		t.Error("expected error for invalid signature")
	}
}

func TestValidateTokenMalformed(t *testing.T) {
	SetSecret("test-secret")

	tests := []struct {
		name  string
		token string
	}{
		{"empty", ""},
		{"one part", "abc"},
		{"two parts", "abc.def"},
		{"invalid base64", "!!!.!!!.!!!"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ValidateToken(tt.token)
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func splitToken(s string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}
