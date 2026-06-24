package mml

import (
	"testing"
)

func TestParse(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantCmd string
		wantErr bool
	}{
		{"valid ADD-SUB", "ADD-SUB: IMSI=460110000000001, APN=internet;", "ADD-SUB", false},
		{"valid LST-SUB empty", "LST-SUB:;", "LST-SUB", false},
		{"valid LST-SUB with params", "LST-SUB: IMSI=460110000000001;", "LST-SUB", false},
		{"valid DEL-SUB", "DEL-SUB: IMSI=460110000000001;", "DEL-SUB", false},
		{"valid MOD-SUB", "MOD-SUB: IMSI=460110000000001, APN=5gnet;", "MOD-SUB", false},
		{"valid CTRL-NF", "CTRL-NF: NAME=amfd, ACTION=restart;", "CTRL-NF", false},
		{"valid ACK-ALARM", "ACK-ALARM: ID=abc123;", "ACK-ALARM", false},
		{"valid CLR-ALARM", "CLR-ALARM: ID=abc123;", "CLR-ALARM", false},
		{"whitespace tolerant", "  ADD-SUB : IMSI=460110000000001 ;  ", "ADD-SUB", false},
		{"invalid format", "ADD-SUB IMSI=460110000000001;", "", true},
		{"invalid param", "ADD-SUB: IMSI;", "", true},
		{"empty string", "", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd, err := Parse(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("Parse(%q) expected error, got nil", tt.input)
				}
				return
			}
			if err != nil {
				t.Errorf("Parse(%q) unexpected error: %v", tt.input, err)
				return
			}
			if cmd.Name != tt.wantCmd {
				t.Errorf("Parse(%q) name = %q, want %q", tt.input, cmd.Name, tt.wantCmd)
			}
		})
	}
}

func TestParseParams(t *testing.T) {
	cmd, err := Parse("ADD-SUB: IMSI=460110000000001, APN=5gnet, QOS=5;")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd.Params["IMSI"] != "460110000000001" {
		t.Errorf("IMSI = %q, want %q", cmd.Params["IMSI"], "460110000000001")
	}
	if cmd.Params["APN"] != "5gnet" {
		t.Errorf("APN = %q, want %q", cmd.Params["APN"], "5gnet")
	}
	if cmd.Params["QOS"] != "5" {
		t.Errorf("QOS = %q, want %q", cmd.Params["QOS"], "5")
	}
}

func TestValidateDELSub(t *testing.T) {
	tests := []struct {
		name    string
		params  map[string]string
		want    string
		wantErr bool
	}{
		{"valid", map[string]string{"IMSI": "460110000000001"}, "460110000000001", false},
		{"missing IMSI", map[string]string{}, "", true},
		{"empty IMSI", map[string]string{"IMSI": ""}, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ValidateDELSub(&Command{Params: tt.params})
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateLSTSub(t *testing.T) {
	tests := []struct {
		name     string
		params   map[string]string
		wantImsi string
		wantPage int
		wantSize int
		wantErr  bool
	}{
		{"empty (list all)", map[string]string{}, "", 1, 20, false},
		{"with IMSI", map[string]string{"IMSI": "460110000000001"}, "460110000000001", 1, 20, false},
		{"with pagination", map[string]string{"PAGE": "2", "PAGE_SIZE": "10"}, "", 2, 10, false},
		{"invalid page", map[string]string{"PAGE": "abc"}, "", 0, 0, true},
		{"invalid page size", map[string]string{"PAGE_SIZE": "200"}, "", 0, 0, true},
		{"page size zero", map[string]string{"PAGE_SIZE": "0"}, "", 0, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			imsi, page, size, err := ValidateLSTSub(&Command{Params: tt.params})
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if imsi != tt.wantImsi {
				t.Errorf("imsi = %q, want %q", imsi, tt.wantImsi)
			}
			if page != tt.wantPage {
				t.Errorf("page = %d, want %d", page, tt.wantPage)
			}
			if size != tt.wantSize {
				t.Errorf("size = %d, want %d", size, tt.wantSize)
			}
		})
	}
}

func TestValidateMODSub(t *testing.T) {
	tests := []struct {
		name    string
		params  map[string]string
		wantErr bool
	}{
		{"valid APN", map[string]string{"IMSI": "460110000000001", "APN": "5gnet"}, false},
		{"valid QOS", map[string]string{"IMSI": "460110000000001", "QOS": "5"}, false},
		{"valid multiple", map[string]string{"IMSI": "460110000000001", "APN": "5gnet", "QOS": "5"}, false},
		{"missing IMSI", map[string]string{"APN": "5gnet"}, true},
		{"no fields", map[string]string{"IMSI": "460110000000001"}, true},
		{"unknown field", map[string]string{"IMSI": "460110000000001", "UNKNOWN": "val"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := ValidateMODSub(&Command{Params: tt.params})
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
			} else if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestValidateCtrlNF(t *testing.T) {
	tests := []struct {
		name    string
		params  map[string]string
		wantErr bool
	}{
		{"valid restart", map[string]string{"NAME": "amfd", "ACTION": "restart"}, false},
		{"valid stop", map[string]string{"NAME": "amfd", "ACTION": "stop"}, false},
		{"valid start", map[string]string{"NAME": "amfd", "ACTION": "start"}, false},
		{"missing NAME", map[string]string{"ACTION": "restart"}, true},
		{"missing ACTION", map[string]string{"NAME": "amfd"}, true},
		{"invalid action", map[string]string{"NAME": "amfd", "ACTION": "kill"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ValidateCtrlNF(&Command{Params: tt.params})
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
			} else if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestValidateACKAlarm(t *testing.T) {
	id, err := ValidateACKAlarm(&Command{Params: map[string]string{"ID": "abc123"}})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if id != "abc123" {
		t.Errorf("got %q, want %q", id, "abc123")
	}

	_, err = ValidateACKAlarm(&Command{Params: map[string]string{}})
	if err == nil {
		t.Error("expected error for missing ID")
	}
}

func TestValidateBatchSub(t *testing.T) {
	file, err := ValidateBatchSub(&Command{Params: map[string]string{"FILE": "test.csv"}})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if file != "test.csv" {
		t.Errorf("got %q, want %q", file, "test.csv")
	}

	_, err = ValidateBatchSub(&Command{Params: map[string]string{}})
	if err == nil {
		t.Error("expected error for missing FILE")
	}
}
