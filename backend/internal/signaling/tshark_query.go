package signaling

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"xcloud-cnms/internal/model"
)

// TsharkQuery 从环形缓冲区 pcap 文件中按条件查询信令消息。
// 使用 tshark 显示过滤器 (-Y) 高效筛选，避免全量解析。
//
// 注意：tshark / mergecap / editcap 需要 root 权限或 CAP_NET_RAW capability。
type TsharkQuery struct {
	RingDir   string        // pcap 环形缓冲区目录
	Timeout   time.Duration // tshark 超时，默认 30s
	MaxPackets int          // 最大返回包数，默认 10000
}

// NewTsharkQuery 创建查询实例
func NewTsharkQuery(ringDir string) *TsharkQuery {
	return &TsharkQuery{
		RingDir:    ringDir,
		Timeout:    30 * time.Second,
		MaxPackets: 10000,
	}
}

// Query 从环形缓冲区 pcap 文件中按查询条件提取信令消息
//
// 流程：
//  1. 列出 ring_dir 中所有 pcap 文件
//  2. 用 editcap 按时间范围裁剪（如指定 timeRange）
//  3. 用 mergecap 合并为临时文件（如多个文件）
//  4. 调用 tshark -r 读取 + -Y 显示过滤 + -T json 输出
//  5. 流式解析 JSON 输出为 []model.SignalingMessage
//
// 注意：IMSI/SUPI 显示过滤只对 GTPv2/Diameter/NAS 有效。
// S1AP/SIP/PFCP 消息不直接携带 IMSI，当显示过滤无结果时，
// 自动回退到获取全量信令消息（不限制过滤器）。
func (q *TsharkQuery) Query(queryType, queryValue string, timeRange model.TimeRange) ([]model.SignalingMessage, error) {
	// 1. 列出 pcap 文件
	files, err := q.listPcapFiles()
	if err != nil {
		return nil, fmt.Errorf("list pcap files: %w", err)
	}
	if len(files) == 0 {
		return nil, nil
	}

	// 2 & 3. 按时间裁剪 + 合并
	workFile, cleanup, err := q.preparePcap(files, timeRange)
	if err != nil {
		return nil, fmt.Errorf("prepare pcap: %w", err)
	}
	defer cleanup()

	// 4. 先用显示过滤器查询（对携带 IMSI 的协议有效：GTPv2/Diameter/NAS）
	displayFilter := buildDisplayFilter(queryType, queryValue)
	messages, err := q.runTshark(workFile, displayFilter)
	if err != nil {
		return nil, fmt.Errorf("tshark query: %w", err)
	}

	// 5. 如果显示过滤无结果，回退到全量信令消息（不限过滤器）
	// S1AP/SIP/PFCP 等协议不直接携带 IMSI，需要全量获取后由关联引擎匹配
	if len(messages) == 0 && displayFilter != "" {
		log.Printf("[TsharkQuery] display filter returned 0 results, falling back to all signaling")
		messages, err = q.runTshark(workFile, "")
		if err != nil {
			return nil, fmt.Errorf("tshark fallback query: %w", err)
		}
	}

	log.Printf("[TsharkQuery] query=%s:%s, files=%d, messages=%d",
		queryType, queryValue, len(files), len(messages))

	return messages, nil
}

// QueryRaw 执行 tshark 查询并返回原始 JSON（用于调试）
func (q *TsharkQuery) QueryRaw(pcapFile string, displayFilter string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), q.Timeout)
	defer cancel()

	args := []string{"-r", pcapFile}
	if displayFilter != "" {
		args = append(args, "-Y", displayFilter)
	}
	args = append(args,
		"-T", "json",
		"-j", "frame sip diameter gtpv2 gtp pfcp s1ap ngap nas-5gs nas-eps sgsap ip ipv6 sctp tcp udp",
		"-c", strconv.Itoa(q.MaxPackets),
	)

	cmd := exec.CommandContext(ctx, "tshark", args...)
	return cmd.Output()
}

// -----------------------------------------------------------
// 显示过滤器构建
// -----------------------------------------------------------

// buildDisplayFilter 根据查询类型和值构建 tshark 显示过滤器
func buildDisplayFilter(queryType, queryValue string) string {
	switch strings.ToLower(queryType) {
	case "imsi":
		// e212.imsi 匹配 GTPv2-C/Diameter 中的 IMSI
		// nas_5gs.mm.supi 匹配 5G NAS 中的 SUPI
		return fmt.Sprintf(`e212.imsi == "%s" || nas_5gs.mm.supi contains "%s"`, queryValue, queryValue)

	case "supi":
		return fmt.Sprintf(`nas_5gs.mm.supi contains "%s" || e212.imsi == "%s"`, queryValue, queryValue)

	case "msisdn":
		// gsm_a.msisdn 匹配 GSM MAP/Diameter 中的 MSISDN
		// sip contains 匹配 SIP 消息中的 MSISDN
		return fmt.Sprintf(`gsm_a.msisdn == "%s" || sip contains "%s"`, queryValue, queryValue)

	case "sip_uri":
		// SIP From/To 包含目标 URI
		return fmt.Sprintf(`sip.From contains "%s" || sip.To contains "%s"`, queryValue, queryValue)

	case "call_id":
		return fmt.Sprintf(`sip.Call-ID == "%s"`, queryValue)

	case "teid":
		// GTPv2-C 和 GTP-U 的 TEID
		return fmt.Sprintf(`gtpv2.teid == %s || gtp.teid == %s`, queryValue, queryValue)

	case "ip":
		return fmt.Sprintf(`ip.addr == %s`, queryValue)

	case "guti":
		// GUTI 包含在 NAS EPS 消息中，用 contains 匹配
		return fmt.Sprintf(`nas_eps.emm.guti contains "%s"`, queryValue)

	case "fiveg_guti":
		return fmt.Sprintf(`nas_5gs.mm.5g_guti contains "%s"`, queryValue)

	case "impu", "impi":
		// IMPU/IMPI 可能出现在 SIP 消息或 Diameter 消息中
		return fmt.Sprintf(`sip contains "%s" || diameter contains "%s"`, queryValue, queryValue)

	default:
		// 未知类型：全文搜索
		return fmt.Sprintf(`frame contains "%s"`, queryValue)
	}
}

// -----------------------------------------------------------
// pcap 文件准备（裁剪 + 合并）
// -----------------------------------------------------------

// listPcapFiles 列出环形缓冲区中所有 pcap 文件，按修改时间升序
func (q *TsharkQuery) listPcapFiles() ([]string, error) {
	entries, err := os.ReadDir(q.RingDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".pcap") {
			files = append(files, filepath.Join(q.RingDir, e.Name()))
		}
	}

	// 按修改时间升序（最旧的在前）
	sort.Slice(files, func(i, j int) bool {
		si, _ := os.Stat(files[i])
		sj, _ := os.Stat(files[j])
		if si == nil || sj == nil {
			return false
		}
		return si.ModTime().Before(sj.ModTime())
	})

	return files, nil
}

// preparePcap 准备查询用的 pcap 文件：
//   - 如果指定了时间范围，用 editcap 裁剪
//   - 如果多个文件，用 mergecap 合并
//   - 返回临时文件路径和清理函数
func (q *TsharkQuery) preparePcap(files []string, timeRange model.TimeRange) (string, func(), error) {
	cleanup := func() {}

	// 如果只有一个文件且无时间过滤，直接使用
	if len(files) == 1 && timeRange.Start.IsZero() {
		return files[0], cleanup, nil
	}

	tmpDir := os.TempDir()

	// 步骤 1：按时间裁剪（如果指定了时间范围）
	var trimmedFiles []string
	if !timeRange.Start.IsZero() {
		log.Printf("[TsharkQuery] trimming %d files, timeRange=%s to %s",
			len(files), timeRange.Start.Format(time.RFC3339), timeRange.End.Format(time.RFC3339))
		for _, f := range files {
			out := filepath.Join(tmpDir, fmt.Sprintf("xcloud_trim_%d.pcap", time.Now().UnixNano()))
			if err := q.editcapTimeFilter(f, out, timeRange); err != nil {
				log.Printf("[TsharkQuery] editcap failed for %s: %v", f, err)
				continue
			}
			info, err := os.Stat(out)
			if err == nil && info.Size() > 0 {
				trimmedFiles = append(trimmedFiles, out)
				log.Printf("[TsharkQuery] trimmed %s → %s (%d bytes)", filepath.Base(f), filepath.Base(out), info.Size())
			} else {
				os.Remove(out)
				log.Printf("[TsharkQuery] trimmed %s → empty, skipped", filepath.Base(f))
			}
		}

		if len(trimmedFiles) == 0 {
			log.Printf("[TsharkQuery] all files empty after time filter")
			return "", cleanup, nil
		}

		// 清理裁剪临时文件
		oldCleanup := cleanup
		cleanup = func() {
			for _, f := range trimmedFiles {
				os.Remove(f)
			}
			oldCleanup()
		}
	} else {
		trimmedFiles = files
	}

	// 步骤 2：如果多个文件，用 mergecap 合并
	if len(trimmedFiles) == 1 {
		return trimmedFiles[0], cleanup, nil
	}

	merged := filepath.Join(tmpDir, fmt.Sprintf("xcloud_merged_%d.pcap", time.Now().UnixNano()))
	if err := q.mergecap(trimmedFiles, merged); err != nil {
		return "", cleanup, fmt.Errorf("mergecap: %w", err)
	}

	oldCleanup := cleanup
	cleanup = func() {
		os.Remove(merged)
		oldCleanup()
	}

	return merged, cleanup, nil
}

// editcapTimeFilter 使用 editcap 按时间范围裁剪 pcap 文件
// editcap -A "YYYY-MM-DD HH:MM:SS" -B "YYYY-MM-DD HH:MM:SS" input output
// 注意：editcap 使用本地时间解析 -A/-B 参数，不能用 UTC
func (q *TsharkQuery) editcapTimeFilter(input, output string, timeRange model.TimeRange) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	args := []string{}
	if !timeRange.Start.IsZero() {
		args = append(args, "-A", timeRange.Start.Format("2006-01-02 15:04:05"))
	}
	if !timeRange.End.IsZero() {
		args = append(args, "-B", timeRange.End.Format("2006-01-02 15:04:05"))
	}
	args = append(args, input, output)

	cmd := exec.CommandContext(ctx, "editcap", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("editcap failed: %s: %w", string(output), err)
	}
	return nil
}

// mergecap 合并多个 pcap 文件为一个
func (q *TsharkQuery) mergecap(files []string, output string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	args := []string{"-w", output}
	args = append(args, files...)

	cmd := exec.CommandContext(ctx, "mergecap", args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("mergecap failed: %s: %w", string(output), err)
	}
	return nil
}

// -----------------------------------------------------------
// tshark 执行与 JSON 解析
// -----------------------------------------------------------

// tsharkJSONEntry tshark -T json 输出的单条记录结构
type tsharkJSONEntry struct {
	Source tsharkJSONSource `json:"_source"`
}

type tsharkJSONSource struct {
	Layers map[string]any `json:"layers"`
}

// runTshark 执行 tshark 并流式解析 JSON 输出
func (q *TsharkQuery) runTshark(pcapFile, displayFilter string) ([]model.SignalingMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), q.Timeout)
	defer cancel()

	args := []string{
		"-r", pcapFile,
		"-T", "json",
		"-j", "frame sip diameter gtpv2 gtp pfcp s1ap ngap nas-5gs nas-eps sgsap ip ipv6 sctp tcp udp",
		"-c", strconv.Itoa(q.MaxPackets),
	}
	if displayFilter != "" {
		args = append(args, "-Y", displayFilter)
	}

	log.Printf("[TsharkQuery] tshark %s", strings.Join(args, " "))

	cmd := exec.CommandContext(ctx, "tshark", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start tshark: %w", err)
	}

	// 流式解析 JSON 数组
	var messages []model.SignalingMessage
	decoder := json.NewDecoder(bufio.NewReaderSize(stdout, 256*1024))

	// 读取数组开始 [
	// tshark 无匹配时输出空（EOF），此时返回空结果而非错误
	t, err := decoder.Token()
	if err != nil {
		_ = cmd.Wait()
		log.Printf("[TsharkQuery] no output (no matching packets)")
		return nil, nil
	}
	if delim, ok := t.(json.Delim); !ok || delim != '[' {
		_ = cmd.Wait()
		return nil, fmt.Errorf("expected JSON array, got %v", t)
	}

	idx := 0
	for decoder.More() {
		var entry map[string]any
		if err := decoder.Decode(&entry); err != nil {
			log.Printf("[TsharkQuery] decode entry %d: %v", idx, err)
			idx++
			continue
		}

		msg := parseTsharkLayers(idx, entry)
		if msg != nil {
			messages = append(messages, *msg)
		}
		idx++
	}

	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			// tshark 返回 1 可能只是警告，不一定是错误
			if exitErr.ExitCode() != 1 {
				return messages, fmt.Errorf("tshark exit %d: %s", exitErr.ExitCode(), string(exitErr.Stderr))
			}
		}
	}

	return messages, nil
}

// -----------------------------------------------------------
// tshark JSON → SignalingMessage 解析
// -----------------------------------------------------------

// parseTsharkLayers 从 tshark JSON layers 中解析出 SignalingMessage
func parseTsharkLayers(idx int, entry map[string]any) *model.SignalingMessage {
	srcRaw, ok := entry["_source"]
	if !ok {
		return nil
	}
	src, ok := srcRaw.(map[string]any)
	if !ok {
		return nil
	}

	layersRaw, ok := src["layers"]
	if !ok {
		return nil
	}
	layers, ok := layersRaw.(map[string]any)
	if !ok {
		return nil
	}

	msg := &model.SignalingMessage{
		Details: map[string]any{"packet_index": idx},
	}

	// 解析 frame 时间
	if frameRaw, ok := layers["frame"]; ok {
		if frame, ok := frameRaw.(map[string]any); ok {
			if epoch, ok := frame["frame.time_epoch"].(string); ok {
				if sec, err := strconv.ParseFloat(epoch, 64); err == nil {
					msg.Timestamp = time.Unix(int64(sec), int64((sec-float64(int64(sec)))*1e9))
				}
			}
			if proto, ok := frame["frame.protocols"].(string); ok {
				msg.Details["protocols"] = proto
			}
		}
	}

	// 解析 IP 层
	if ipRaw, ok := layers["ip"]; ok {
		if ip, ok := ipRaw.(map[string]any); ok {
			if s, ok := ip["ip.src"].(string); ok {
				msg.SourceIP = s
			}
			if d, ok := ip["ip.dst"].(string); ok {
				msg.DestIP = d
			}
		}
	}
	if ipv6Raw, ok := layers["ipv6"]; ok {
		if ipv6, ok := ipv6Raw.(map[string]any); ok {
			if s, ok := ipv6["ipv6.src"].(string); ok && msg.SourceIP == "" {
				msg.SourceIP = s
			}
			if d, ok := ipv6["ipv6.dst"].(string); ok && msg.DestIP == "" {
				msg.DestIP = d
			}
		}
	}

	// 解析传输层端口
	parseTransportPorts(layers, msg)

	// 根据最高层协议解析
	switch {
	case layers["sip"] != nil:
		parseSIPFromLayers(msg, layers["sip"])
	case layers["diameter"] != nil:
		parseDiameterFromLayers(msg, layers["diameter"])
	case layers["gtpv2"] != nil:
		parseGTPv2FromLayers(msg, layers["gtpv2"])
	case layers["pfcp"] != nil:
		parsePFCPFromLayers(msg, layers["pfcp"])
	case layers["s1ap"] != nil:
		parseS1APFromLayers(msg, layers["s1ap"])
	case layers["ngap"] != nil:
		parseNGAPFromLayers(msg, layers["ngap"])
	case layers["nas-5gs"] != nil:
		parseNAS5GFromLayers(msg, layers["nas-5gs"])
	case layers["nas-eps"] != nil:
		parseNASEPSFromLayers(msg, layers["nas-eps"])
	case layers["sgsap"] != nil:
		parseSGsAPFromLayers(msg, layers["sgsap"])
	default:
		return nil // 非信令包
	}

	return msg
}

// parseTransportPorts 从 SCTP/TCP/UDP 层提取端口号
func parseTransportPorts(layers map[string]any, msg *model.SignalingMessage) {
	for _, proto := range []string{"sctp", "tcp", "udp"} {
		if raw, ok := layers[proto]; ok {
			if p, ok := raw.(map[string]any); ok {
				if s, ok := p[proto+".srcport"].(string); ok {
					if port, err := strconv.Atoi(s); err == nil {
						msg.SourcePort = port
					}
				}
				if d, ok := p[proto+".dstport"].(string); ok {
					if port, err := strconv.Atoi(d); err == nil {
						msg.DestPort = port
					}
				}
			}
			break // 只取第一个传输层
		}
	}
}

// parseSIPFromLayers 解析 SIP 协议
func parseSIPFromLayers(msg *model.SignalingMessage, raw any) {
	sip, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "SIP"

	// 根据端口判断接口
	msg.Interface = guessSIPInterface(msg.SourcePort, msg.DestPort)

	if m, ok := sip["sip.Method"].(string); ok && m != "" {
		msg.Method = m
		msg.Direction = "request"
	}
	if code, ok := sip["sip.Status-Code"].(string); ok && code != "" {
		c, _ := strconv.Atoi(code)
		msg.StatusCode = c
		msg.Direction = "response"
		if phrase, ok := sip["sip.Status-Phrase"].(string); ok {
			msg.StatusText = phrase
		}
	}
	if from, ok := sip["sip.from.user"].(string); ok {
		msg.Identifiers.MSISDN = extractMSISDN(from)
		msg.Identifiers.SIPURI = from
	}
	if to, ok := sip["sip.to.user"].(string); ok {
		if msg.Identifiers.MSISDN == "" {
			msg.Identifiers.MSISDN = extractMSISDN(to)
		}
	}
	if callID, ok := sip["sip.Call-ID"].(string); ok {
		msg.CallID = callID
		msg.Identifiers.CallID = callID
	}

	// 网元推断
	if msg.Direction == "request" {
		msg.SourceEntity = "UE"
		msg.DestEntity = guessSIPDestEntity(msg.DestPort)
	} else {
		msg.SourceEntity = guessSIPDestEntity(msg.SourcePort)
		msg.DestEntity = "UE"
	}

	// 存储 SIP 特定字段到 details
	for _, key := range []string{"sip.Method", "sip.Status-Code", "sip.Status-Phrase",
		"sip.from.user", "sip.to.user", "sip.Call-ID", "sip.contact.addr", "sip.Request-URI"} {
		if v, ok := sip[key]; ok {
			msg.Details[key] = v
		}
	}
}

// parseDiameterFromLayers 解析 Diameter 协议
func parseDiameterFromLayers(msg *model.SignalingMessage, raw any) {
	dia, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "Diameter"

	if cmd, ok := dia["diameter.cmd.code"].(string); ok {
		c, _ := strconv.Atoi(cmd)
		msg.Details["cmd_code"] = c
		msg.Method = diameterMethodName(c)

		// 判断请求/响应：flags.proxiable 位
		if flags, ok := dia["diameter.flags.proxiable"].(string); ok && flags == "1" {
			msg.Direction = "request"
		} else {
			msg.Direction = "response"
		}
	}

	if appID, ok := dia["diameter.app.id"].(string); ok {
		id, _ := strconv.Atoi(appID)
		msg.Details["app_id"] = id
		msg.Interface = diameterInterface(id)
	}

	if result, ok := dia["diameter.result_code"].(string); ok {
		c, _ := strconv.Atoi(result)
		msg.StatusCode = c
	}

	msg.SourceEntity = "MME"
	msg.DestEntity = "HSS"
}

// parseGTPv2FromLayers 解析 GTPv2-C 协议
func parseGTPv2FromLayers(msg *model.SignalingMessage, raw any) {
	gtp, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "GTPv2C"
	msg.Interface = guessGTPv2Interface(msg.SourcePort, msg.DestPort)

	if mt, ok := gtp["gtpv2.message_type"].(string); ok {
		t, _ := strconv.Atoi(mt)
		msg.Method = gtpv2MethodName(t)
		msg.Details["message_type"] = t
	}
	if teid, ok := gtp["gtpv2.teid"].(string); ok {
		msg.Identifiers.TEID = teid
	}
	if imsi, ok := gtp["gtpv2.imsi"].(string); ok {
		msg.Identifiers.IMSI = imsi
	}
	if apn, ok := gtp["gtpv2.apn"].(string); ok {
		msg.Details["apn"] = apn
	}

	msg.SourceEntity = "MME"
	msg.DestEntity = "SGW"
	msg.Direction = "request"
}

// parsePFCPFromLayers 解析 PFCP 协议
func parsePFCPFromLayers(msg *model.SignalingMessage, raw any) {
	pfcp, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "PFCP"
	msg.Interface = "N4"

	if mt, ok := pfcp["pfcp.message_type"].(string); ok {
		t, _ := strconv.Atoi(mt)
		msg.Method = pfcpMethodName(t)
		msg.Details["message_type"] = t
	}
	if seid, ok := pfcp["pfcp.seid"].(string); ok {
		msg.Details["seid"] = seid
	}

	msg.SourceEntity = "SMF"
	msg.DestEntity = "UPF"
	msg.Direction = "request"
}

// parseS1APFromLayers 解析 S1AP 协议
func parseS1APFromLayers(msg *model.SignalingMessage, raw any) {
	s1ap, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "S1AP"
	msg.Interface = "S1-MME"

	if proc, ok := s1ap["s1ap.procedureCode"].(string); ok {
		code, _ := strconv.Atoi(proc)
		msg.Details["procedure_code"] = code
		msg.Method = s1apProcedureName(code)
	}

	msg.SourceEntity = "eNB"
	msg.DestEntity = "MME"
	msg.Direction = "request"
}

// parseNGAPFromLayers 解析 NGAP 协议
func parseNGAPFromLayers(msg *model.SignalingMessage, raw any) {
	ngap, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "NGAP"
	msg.Interface = "N2"

	if proc, ok := ngap["ngap.procedureCode"].(string); ok {
		code, _ := strconv.Atoi(proc)
		msg.Details["procedure_code"] = code
		msg.Method = ngapProcedureName(code)
	}

	msg.SourceEntity = "gNB"
	msg.DestEntity = "AMF"
	msg.Direction = "request"
}

// parseNAS5GFromLayers 解析 5G NAS 协议
func parseNAS5GFromLayers(msg *model.SignalingMessage, raw any) {
	nas, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "NAS"
	msg.Interface = "N1"

	if mt, ok := nas["nas_5gs.message_type"].(string); ok {
		code, _ := strconv.ParseInt(mt, 0, 64)
		msg.Method = nas5gMessageType(uint8(code))
		msg.Details["message_type"] = mt
	}

	// 提取 SUPI
	if supi, ok := nas["nas_5gs.mm.supi"].(string); ok {
		msg.Identifiers.SUPI = supi
		msg.Identifiers.IMSI = strings.TrimPrefix(supi, "imsi-")
	}

	msg.SourceEntity = "UE"
	msg.DestEntity = "AMF"
	msg.Direction = "request"
}

// parseNASEPSFromLayers 解析 4G NAS (EPS) 协议
func parseNASEPSFromLayers(msg *model.SignalingMessage, raw any) {
	nas, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "NAS"
	msg.Interface = "S1-MME"

	if mt, ok := nas["nas_eps.message_type"].(string); ok {
		code, _ := strconv.ParseInt(mt, 0, 64)
		msg.Method = nasEPSMessageType(uint8(code))
		msg.Details["message_type"] = mt
	}

	// 提取 IMSI
	if imsi, ok := nas["nas_eps.emm.imsi"].(string); ok {
		msg.Identifiers.IMSI = imsi
	}

	msg.SourceEntity = "UE"
	msg.DestEntity = "MME"
	msg.Direction = "request"
}

// parseSGsAPFromLayers 解析 SGsAP 协议
func parseSGsAPFromLayers(msg *model.SignalingMessage, raw any) {
	sgs, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "SGsAP"
	msg.Interface = "SGs"

	if mt, ok := sgs["sgsap.message_type"].(string); ok {
		code, _ := strconv.Atoi(mt)
		msg.Method = sgsapMessageType(code)
		msg.Details["message_type"] = code
	}

	// 提取 IMSI
	if imsi, ok := sgs["sgsap.imsi"].(string); ok {
		msg.Identifiers.IMSI = imsi
	}

	msg.SourceEntity = "MME"
	msg.DestEntity = "MSC"
	msg.Direction = "request"
}

// -----------------------------------------------------------
// 辅助函数
// -----------------------------------------------------------

// guessSIPInterface 根据端口猜测 SIP 接口
func guessSIPInterface(srcPort, dstPort int) string {
	port := dstPort
	if port == 0 {
		port = srcPort
	}
	switch port {
	case 5060, 5061:
		return "Gm" // UE ↔ P-CSCF
	case 6060:
		return "Mw" // P-CSCF ↔ S-CSCF
	case 7060:
		return "ISC" // S-CSCF ↔ AS
	default:
		return "Gm"
	}
}

// guessSIPDestEntity 根据端口猜测 SIP 目标网元
func guessSIPDestEntity(port int) string {
	switch port {
	case 5060, 5061:
		return "P-CSCF"
	case 6060:
		return "S-CSCF"
	case 7060:
		return "AS"
	default:
		return "P-CSCF"
	}
}

// guessGTPv2Interface 根据端口猜测 GTPv2-C 接口
func guessGTPv2Interface(srcPort, dstPort int) string {
	// GTPv2-C 使用端口 2123，接口取决于网元对
	return "S11"
}

// extractMSISDN 从字符串中提取 MSISDN（数字 10-15 位）
func extractMSISDN(s string) string {
	var digits strings.Builder
	for _, c := range s {
		if c >= '0' && c <= '9' {
			digits.WriteRune(c)
		}
	}
	msisdn := digits.String()
	if len(msisdn) >= 10 && len(msisdn) <= 15 {
		return msisdn
	}
	return ""
}

// -----------------------------------------------------------
// 协议方法名映射
// -----------------------------------------------------------

func diameterMethodName(code int) string {
	switch code {
	case 257:
		return "Capabilities-Exchange"
	case 272:
		return "Credit-Control"
	case 274:
		return "Abort-Session"
	case 275:
		return "Session-Termination"
	case 280:
		return "Device-Watchdog"
	case 301:
		return "User-Authorization"
	case 303:
		return "Server-Assignment"
	case 304:
		return "Location-Info"
	case 305:
		return "Multimedia-Auth"
	case 306:
		return "Registration-Termination"
	case 321:
		return "Profile-Update"
	default:
		return fmt.Sprintf("Command-%d", code)
	}
}

func diameterInterface(appID int) string {
	switch appID {
	case 16777216:
		return "Cx"
	case 16777217:
		return "Sh"
	case 16777236:
		return "Rx"
	case 16777238:
		return "Gx"
	case 16777251:
		return "S6a"
	case 16777272:
		return "S13"
	case 0:
		return "S6a" // 默认
	default:
		return fmt.Sprintf("App-%d", appID)
	}
}

func gtpv2MethodName(msgType int) string {
	switch msgType {
	case 1:
		return "Echo Request"
	case 2:
		return "Echo Response"
	case 32:
		return "Create Session Request"
	case 33:
		return "Create Session Response"
	case 34:
		return "Modify Bearer Request"
	case 35:
		return "Modify Bearer Response"
	case 36:
		return "Delete Session Request"
	case 37:
		return "Delete Session Response"
	case 170:
		return "Create Bearer Request"
	case 171:
		return "Create Bearer Response"
	default:
		return fmt.Sprintf("Type-%d", msgType)
	}
}

func pfcpMethodName(msgType int) string {
	switch msgType {
	case 1:
		return "Heartbeat Request"
	case 2:
		return "Heartbeat Response"
	case 50:
		return "PFD Management Request"
	case 51:
		return "PFD Management Response"
	case 56:
		return "Association Setup Request"
	case 57:
		return "Association Setup Response"
	case 58:
		return "Association Update Request"
	case 59:
		return "Association Update Response"
	case 60:
		return "Association Release Request"
	case 61:
		return "Association Release Response"
	case 100:
		return "Session Establishment Request"
	case 101:
		return "Session Establishment Response"
	case 102:
		return "Session Modification Request"
	case 103:
		return "Session Modification Response"
	case 104:
		return "Session Deletion Request"
	case 105:
		return "Session Deletion Response"
	default:
		return fmt.Sprintf("Type-%d", msgType)
	}
}

func s1apProcedureName(code int) string {
	switch code {
	case 9:
		return "Initial UE Message"
	case 11:
		return "Downlink NAS Transport"
	case 12:
		return "Uplink NAS Transport"
	case 14:
		return "UE Context Release Request"
	case 15:
		return "UE Context Release Command"
	case 16:
		return "UE Context Release Complete"
	case 23:
		return "Handover Required"
	case 24:
		return "Handover Command"
	case 25:
		return "Handover Notify"
	case 47:
		return "Initial Context Setup Request"
	case 48:
		return "Initial Context Setup Response"
	default:
		return fmt.Sprintf("Procedure-%d", code)
	}
}

func ngapProcedureName(code int) string {
	switch code {
	case 15:
		return "Initial UE Message"
	case 18:
		return "Downlink NAS Transport"
	case 19:
		return "Uplink NAS Transport"
	case 22:
		return "UE Context Release Request"
	case 23:
		return "UE Context Release Command"
	case 24:
		return "UE Context Release Complete"
	case 25:
		return "UE Context Modification Request"
	case 26:
		return "UE Context Modification Response"
	case 40:
		return "PDU Session Resource Setup Request"
	case 41:
		return "PDU Session Resource Setup Response"
	case 46:
		return "Initial Context Setup Request"
	case 47:
		return "Initial Context Setup Response"
	default:
		return fmt.Sprintf("Procedure-%d", code)
	}
}

func nas5gMessageType(code uint8) string {
	switch code {
	case 0x41:
		return "Registration Request"
	case 0x42:
		return "Registration Accept"
	case 0x43:
		return "Registration Complete"
	case 0x44:
		return "Registration Reject"
	case 0x45:
		return "Deregistration Request (UE)"
	case 0x46:
		return "Deregistration Accept (UE)"
	case 0x4c:
		return "Deregistration Request (Network)"
	case 0x4d:
		return "Deregistration Accept (Network)"
	case 0x55:
		return "Authentication Request"
	case 0x56:
		return "Authentication Response"
	case 0x57:
		return "Authentication Reject"
	case 0x58:
		return "Authentication Failure"
	case 0x5d:
		return "Security Mode Command"
	case 0x5e:
		return "Security Mode Complete"
	case 0x5f:
		return "Security Mode Reject"
	case 0x67:
		return "Identity Request"
	case 0x68:
		return "Identity Response"
	case 0x6b:
		return "5GMM Status"
	case 0xc1:
		return "PDU Session Establishment Request"
	case 0xc2:
		return "PDU Session Establishment Accept"
	case 0xc3:
		return "PDU Session Establishment Reject"
	case 0xc4:
		return "PDU Session Release Request"
	case 0xc5:
		return "PDU Session Release Command"
	case 0xc6:
		return "PDU Session Release Complete"
	default:
		return fmt.Sprintf("NAS-5G-0x%02X", code)
	}
}

func nasEPSMessageType(code uint8) string {
	switch code {
	case 0x41:
		return "Attach Request"
	case 0x42:
		return "Attach Accept"
	case 0x43:
		return "Attach Complete"
	case 0x44:
		return "Attach Reject"
	case 0x45:
		return "Detach Request"
	case 0x46:
		return "Detach Accept"
	case 0x48:
		return "TAU Request"
	case 0x49:
		return "TAU Accept"
	case 0x4a:
		return "TAU Complete"
	case 0x4b:
		return "TAU Reject"
	case 0x52:
		return "Authentication Request"
	case 0x53:
		return "Authentication Response"
	case 0x54:
		return "Authentication Reject"
	case 0x55:
		return "Identity Request"
	case 0x56:
		return "Identity Response"
	case 0x5d:
		return "Security Mode Command"
	case 0x5e:
		return "Security Mode Complete"
	case 0x82:
		return "Service Request"
	case 0x83:
		return "Service Reject"
	default:
		return fmt.Sprintf("NAS-EPS-0x%02X", code)
	}
}

func sgsapMessageType(code int) string {
	switch code {
	case 1:
		return "Location Update Request"
	case 2:
		return "Location Update Accept"
	case 3:
		return "Location Update Reject"
	case 4:
		return "Detach Request (SGs)"
	case 5:
		return "Detach Accept (SGs)"
	case 6:
		return "Paging Request"
	case 7:
		return "Paging Reject"
	case 10:
		return "UE Activity Indication"
	case 11:
		return "EPS Detach Ack"
	case 12:
		return "IMSI Detach Ack"
	case 16:
		return "Service Request"
	case 17:
		return "Service Accept"
	case 24:
		return "UE Unreachable"
	case 25:
		return "MM Information Request"
	default:
		return fmt.Sprintf("SGsAP-%d", code)
	}
}
