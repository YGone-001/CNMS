package signaling

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
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
// IMSI 过滤策略：
//   - 复合显示过滤器: e212.imsi + diameter.User-Name + nas_5gs.mm.suci.msin + frame contains
//   - e212.imsi 覆盖 4G 全协议 (GTPv2/GTP/Diameter/NAS-EPS/S1AP)
//   - frame contains 兜底 SIP URI 中嵌入的 IMSI
//   - 多级回退: 精确过滤 → frame contains → per-protocol 全量查询
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

	// 4. 先用精确显示过滤器查询（对携带 IMSI 的协议有效：GTPv2/Diameter/NAS）
	displayFilter := buildDisplayFilter(queryType, queryValue)
	messages, err := q.runTshark(workFile, displayFilter)
	if err != nil {
		return nil, fmt.Errorf("tshark query: %w", err)
	}

	// 5. 精确过滤无结果时，使用帧全文搜索（frame contains "IMSI值"）
	//    这比无过滤全量查询更精准，只返回包含该 IMSI 字符串的帧
	if len(messages) == 0 && displayFilter != "" {
		log.Printf("[TsharkQuery] display filter returned 0, trying frame contains fallback")
		fallbackFilter := fmt.Sprintf(`frame contains "%s"`, queryValue)
		displayFilter = fallbackFilter // 更新 filter 供后续 fields 补充使用
		messages, err = q.runTshark(workFile, fallbackFilter)
		if err != nil {
			return nil, fmt.Errorf("tshark fallback query: %w", err)
		}

		// 6. 如果 frame contains 仍无结果，回退到按协议逐个查询
		if len(messages) == 0 {
			log.Printf("[TsharkQuery] frame contains returned 0, trying per-protocol queries")
			protocolFilters := buildProtocolFilter()
			var allMessages []model.SignalingMessage
			seen := make(map[string]bool)
			for _, pf := range protocolFilters {
				msgs, err := q.runTshark(workFile, pf)
				if err != nil {
					continue
				}
				for _, m := range msgs {
					key := m.Timestamp.Format(time.RFC3339Nano) + "|" + m.Protocol + "|" + m.Method
					if !seen[key] {
						seen[key] = true
						allMessages = append(allMessages, m)
					}
				}
			}
			messages = allMessages
		}
	}

	// 7. 用 -T fields 补充 JSON 无法提取的字段（Diameter AVP: Origin-Host/User-Name/Session-Id 等）
	//    对 fallback 结果同样有效（使用无过滤查询，按时间戳匹配）
	if len(messages) > 0 {
		fieldFilter := displayFilter
		if fieldFilter == "" && queryValue != "" {
			fieldFilter = fmt.Sprintf(`frame contains "%s"`, queryValue)
		}
		// fieldFilter 可能为空（queryType=all 场景），此时用协议过滤
		if fieldFilter == "" {
			fieldFilter = "sip || diameter || gtpv2 || pfcp || s1ap || ngap"
		}
		if fieldRecords, ferr := q.runTsharkFields(workFile, fieldFilter); ferr == nil {
			supplementMessages(messages, fieldRecords)
			log.Printf("[TsharkQuery] fields supplement: %d records merged into %d messages", len(fieldRecords), len(messages))
		} else {
			log.Printf("[TsharkQuery] fields supplement failed (non-fatal): %v", ferr)
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

// BuildTsharkFilter 根据查询类型和值构建 tshark 显示过滤器。
//
// 对于 IMSI/SUPI 查询，构建复合过滤器覆盖 4G/5G 混合组网下所有携带 IMSI 的协议：
//   - e212.imsi: 跨协议统一 IMSI 字段 (GTPv2-C/GTP-C/Diameter/NAS-EPS/S1AP)
//   - diameter.User-Name: Diameter Cx/Dx/S6a 接口的 IMSI 用户名
//   - nas_5gs.mm.suci.msin: 5G NAS SUCI 中的 MSIN 部分
//   - frame contains: SIP URI 中内嵌 IMSI 的兜底匹配
//
// 对于其他查询类型（MSISDN/SIP URI/Call-ID/TEID/IP/GUTI/IMPU/IMPI），
// 使用各协议原生字段精确匹配。
func BuildTsharkFilter(queryType, queryValue string) string {
	// 委托给内部实现，保持可测试性
	return buildDisplayFilter(queryType, queryValue)
}

// buildDisplayFilter 根据查询类型和值构建 tshark 显示过滤器
func buildDisplayFilter(queryType, queryValue string) string {
	switch strings.ToLower(queryType) {
	case "imsi":
		return buildIMSIFilter(queryValue)

	case "supi":
		// SUPI 格式: imsi-460001234567890 或 460001234567890
		trimmed := strings.TrimPrefix(queryValue, "imsi-")
		return buildIMSIFilter(trimmed)

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

// buildIMSIFilter 构建覆盖 4G/5G 全协议的 IMSI 复合显示过滤器。
//
// tshark 字段覆盖矩阵:
//   Protocol  | tshark field        | 类型     | 网络制式 | 场景
//   ----------|---------------------|----------|---------|---------------------------
//   GTPv2-C   | e212.imsi           | FT_STRING| 4G      | Create Session/Modify Bearer
//   GTP-C v1  | e212.imsi           | FT_STRING| 2G/3G   | Create PDP Context
//   Diameter  | e212.imsi           | FT_STRING| 4G/5G   | Cx/Dx/S6a (IMSI in AVP)
//   Diameter  | diameter.User-Name  | FT_STRING| 4G/5G   | MAR/SAR/AIR (IMSI as username)
//   NAS-EPS   | e212.imsi           | FT_STRING| 4G      | Identity Response
//   S1AP      | e212.imsi           | FT_STRING| 4G      | UE Identity (IMSI)
//   NAS-5GS   | nas_5gs.mm.suci.msin| FT_STRING| 5G      | SUCI 中的 MSIN 部分
//   SIP       | frame contains      | raw text | IMS     | REGISTER/INVITE URI 嵌入 IMSI
//
// e212.imsi 是 tshark 的 E.212 协议解码器统一字段，覆盖 4G 核心网所有协议。
// nas_5gs.mm.suci.msin 匹配 5G NAS SUCI 中的 MSIN（不含 MCC/MNC）。
// frame contains 作为 SIP URI 兜底（SIP 消息体中可能嵌入完整 IMSI）。
//
// 使用 || 连接，任一协议匹配即命中。
func buildIMSIFilter(imsi string) string {
	// 提取 MSIN: 去掉前 3 位 MCC + 2/3 位 MNC
	// 例: 460001234567890 -> MCC=460, MNC=00 -> MSIN=1234567890
	// 例: 417010000000002 -> MCC=417, MNC=01 -> MSIN=000000002
	msin := extractMSIN(imsi)

	// 构造 SUPI 格式用于 frame contains 兜底匹配
	supi := "imsi-" + imsi

	if msin != "" && msin != imsi {
		return fmt.Sprintf(
			`e212.imsi == "%[1]s" || diameter.User-Name == "%[1]s" || nas_5gs.mm.suci.msin == "%[3]s" || frame contains "%[1]s" || frame contains "%[2]s"`,
			imsi, supi, msin,
		)
	}
	return fmt.Sprintf(
		`e212.imsi == "%[1]s" || diameter.User-Name == "%[1]s" || frame contains "%[1]s" || frame contains "%[2]s"`,
		imsi, supi,
	)
}

// extractMSIN 从 IMSI 中提取 MSIN 部分（去掉 MCC + MNC）。
//
// IMSI 结构: MCC(3) + MNC(2 or 3) + MSIN(remaining)
// MCC: 3 位，国家代码（如 460=中国, 417=叙利亚, 310=美国）
// MNC: 2 或 3 位，由 MCC 决定（MCC 460/417 等用 2 位 MNC）
//
// 返回 MSIN 字符串；若 IMSI 格式不合法返回空串。
func extractMSIN(imsi string) string {
	if len(imsi) < 8 || len(imsi) > 15 {
		return ""
	}
	// 纯数字校验
	for _, c := range imsi {
		if c < '0' || c > '9' {
			return ""
		}
	}
	mcc := imsi[:3]
	// 根据 MCC 判断 MNC 长度（2 位或 3 位）
	// 已知 3 位 MNC 的 MCC 前缀:
	//   302 (Canada), 310-316 (USA), 330 (Puerto Rico),
	//   334 (Mexico), 338 (Jamaica), 342 (Barbados), 344 (Antigua),
	//   346 (Cayman), 348 (BVI), 350 (Bermuda), 352 (Grenada),
	//   354 (Montserrat), 356 (Saint Kitts), 358 (Saint Lucia),
	//   360 (Saint Vincent), 362 (Netherlands Antilles), 363 (Aruba),
	//   364 (Bahamas), 365 (Anguilla), 366 (Dominica), 368 (Cuba),
	//   370 (Dominican Republic), 372 (Haiti), 374 (Trinidad),
	//   376 (Turks and Caicos)
	// 简化: 302/31x/33x 用 3 位 MNC，其余用 2 位
	mncLen := 2
	if strings.HasPrefix(mcc, "3") {
		mncLen = 3
	}
	if len(imsi) < 3+mncLen {
		return ""
	}
	return imsi[3+mncLen:]
}

// buildProtocolFilter 为 per-protocol 回退查询构建协议组过滤器。
// 当复合 IMSI 过滤无结果时，按协议族逐组查询。
func buildProtocolFilter() []string {
	return []string{
		`s1ap || nas-eps || nas-5gs`, // 无线接入网 (RAN/NAS)
		`gtpv2 || gtp`,               // 核心网隧道 (GTP)
		`diameter`,                    // 认证/鉴权 (Cx/Dx/S6a)
		`pfcp`,                        // 用户面控制 (N4)
		`sip`,                         // IMS 信令 (SIP)
		`sgsap`,                       // SGs 接口 (CSFB)
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

// runTshark 执行 tshark 并流式解析 JSON 输出
func (q *TsharkQuery) runTshark(pcapFile, displayFilter string) ([]model.SignalingMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), q.Timeout)
	defer cancel()

	args := []string{
		"-r", pcapFile,
		"-2", // 两遍模式：第一遍收集 TCP 流上下文，第二遍重组后解析
		"-o", "tcp.desegment_tcp_streams:TRUE",
		"-o", "tcp.check_checksum:FALSE", // 忽略校验和（Linux offload 常导致校验和错误）
		"-T", "json",
		// 注意：不使用 -j 参数 — -j 会导致 tshark 输出过滤后的子树（如 {"filtered": "sip.Request-Line"}），
		// 丢失 sip.Method、sip.Status-Code 等关键字段。
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

// fieldsRecord 用于 -T fields 补充查询的结果记录
type fieldsRecord struct {
	Timestamp     string
	SrcIP         string
	DstIP         string
	SrcPort       string
	DstPort       string
	SIPMethod     string
	SIPStatusCode string
	SIPCallID     string
	SIPCSeq       string
	SIPFromUser   string
	SIPToUser     string
	SIPFromURI    string // sip.from.uri (完整 URI，用于正则提取 IMSI)
	SIPToURI      string // sip.to.uri
	DiamCmdCode   string
	DiamAppID     string
	DiamRequest   string
	DiamResult    string
	DiamOriginH   string
	DiamUser      string
	DiamSession   string
	GTPv2Type     string
	GTPv2TEID     string
	GTPv2Cause    string
	GTPv2PAA      string // UE IPv4 from PDN Address Allocation
	PFCPType      string
	PFCPSEID      string
	S1APProc      string
	S1APIMSI      string // S1AP UE Identity Response 中的 IMSI (s1ap.iMSI, FT_BYTES)
	NGAPProc      string
	E212IMSI      string // E.212 统一 IMSI (跨协议: GTPv2/GTP/Diameter/NAS-EPS)
	NAS5GSMSIN    string // NAS-5GS SUCI MSIN 部分
}

// runTsharkFields 使用 -T fields 提取特定字段。
// 用于补充 -T json 无法提取的 Diameter AVP（Origin-Host, User-Name, Session-Id）
// 和 SIP 头部字段。返回按时间戳索引的记录。
func (q *TsharkQuery) runTsharkFields(pcapFile, displayFilter string) ([]fieldsRecord, error) {
	ctx, cancel := context.WithTimeout(context.Background(), q.Timeout)
	defer cancel()

	args := []string{
		"-r", pcapFile,
		"-2",
		"-o", "tcp.desegment_tcp_streams:TRUE",
		"-o", "tcp.check_checksum:FALSE",
		"-T", "fields",
		"-e", "frame.time_epoch",
		"-e", "ip.src", "-e", "ip.dst",
		"-e", "tcp.srcport", "-e", "tcp.dstport",
		"-e", "udp.srcport", "-e", "udp.dstport",
		// SIP 字段
		"-e", "sip.Method", "-e", "sip.Status-Code", "-e", "sip.Call-ID",
		"-e", "sip.CSeq.method",
		"-e", "sip.from.user", "-e", "sip.to.user",
		"-e", "sip.from.uri", "-e", "sip.to.uri", // URI 中可能嵌入 IMSI
		// Diameter AVP 字段（-T json 无法提取这些）
		"-e", "diameter.cmd.code", "-e", "diameter.applicationId",
		"-e", "diameter.flags.request",
		"-e", "diameter.Result-Code", "-e", "diameter.Origin-Host",
		"-e", "diameter.User-Name", "-e", "diameter.Session-Id",
		// GTPv2
		"-e", "gtpv2.message_type", "-e", "gtpv2.teid", "-e", "gtpv2.cause",
		"-e", "gtpv2.pdn_addr_and_prefix.ipv4", // UE IPv4 (PAA)
		// PFCP
		"-e", "pfcp.msg_type", "-e", "pfcp.seid",
		// S1AP/NGAP
		"-e", "s1ap.procedureCode", "-e", "ngap.procedureCode",
		// S1AP IMSI (FT_BYTES, 用于 Identity Response)
		"-e", "s1ap.iMSI",
		// E.212 IMSI (跨协议统一字段: GTPv2/GTP/Diameter/NAS-EPS)
		"-e", "e212.imsi",
		// NAS-5GS SUCI MSIN
		"-e", "nas_5gs.mm.suci.msin",
		"-c", strconv.Itoa(q.MaxPackets),
	}
	if displayFilter != "" {
		args = append(args, "-Y", displayFilter)
	}

	log.Printf("[TsharkQuery] fields supplement: tshark %s", strings.Join(args, " "))

	// 验证文件存在
	if _, statErr := os.Stat(pcapFile); statErr != nil {
		return nil, fmt.Errorf("pcap file not found: %w", statErr)
	}

	cmd := exec.CommandContext(ctx, "tshark", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start tshark fields: %w", err)
	}

	var records []fieldsRecord
	scanner := bufio.NewScanner(bufio.NewReaderSize(stdout, 256*1024))
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024) // 1MB buffer for long lines
	lineCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		lineCount++
		if line == "" {
			continue
		}
		cols := strings.Split(line, "\t")
		// 填充不足的列
		for len(cols) < 20 {
			cols = append(cols, "")
		}
		rec := fieldsRecord{
			Timestamp:     cols[0],
			SrcIP:         cols[1],
			DstIP:         cols[2],
			SrcPort:       cols[3],
			DstPort:       cols[4],
			SIPMethod:     cols[7],
			SIPStatusCode: cols[8],
			SIPCallID:     cols[9],
			SIPCSeq:       cols[10],
			SIPFromUser:   cols[11],
			SIPToUser:     cols[12],
			SIPFromURI:    cols[13],
			SIPToURI:      cols[14],
			DiamCmdCode:   cols[15],
			DiamAppID:     cols[16],
			DiamRequest:   cols[17],
			DiamResult:    cols[18],
			DiamOriginH:   cols[19],
			DiamUser:      cols[20],
			DiamSession:   cols[21],
		}
		if len(cols) > 22 {
			rec.GTPv2Type = cols[22]
		}
		if len(cols) > 23 {
			rec.GTPv2TEID = cols[23]
		}
		if len(cols) > 24 {
			rec.GTPv2Cause = cols[24]
		}
		if len(cols) > 25 {
			rec.GTPv2PAA = cols[25]
		}
		if len(cols) > 26 {
			rec.PFCPType = cols[26]
		}
		if len(cols) > 27 {
			rec.PFCPSEID = cols[27]
		}
		if len(cols) > 28 {
			rec.S1APProc = cols[28]
		}
		if len(cols) > 29 {
			rec.NGAPProc = cols[29]
		}
		if len(cols) > 30 {
			rec.S1APIMSI = cols[30]
		}
		if len(cols) > 31 {
			rec.E212IMSI = cols[31]
		}
		if len(cols) > 32 {
			rec.NAS5GSMSIN = cols[32]
		}
		records = append(records, rec)
	}
	if scanErr := scanner.Err(); scanErr != nil {
		log.Printf("[TsharkQuery] fields scanner error after %d lines: %v", lineCount, scanErr)
	}

	// 读取 stderr
	stderrBytes, _ := io.ReadAll(stderr)
	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if exitErr.ExitCode() != 1 {
				return records, fmt.Errorf("tshark fields exit %d: %s", exitErr.ExitCode(), string(stderrBytes))
			}
		}
	}
	if len(stderrBytes) > 0 {
		log.Printf("[TsharkQuery] fields stderr: %s", string(stderrBytes)[:min(len(stderrBytes), 500)])
	}

	log.Printf("[TsharkQuery] fields: %d lines scanned, %d records parsed", lineCount, len(records))
	return records, nil
}

// supplementMessages 用 -T fields 补充数据填充 JSON 解析中缺失的字段。
// 匹配策略：按时间戳近似匹配（±0.001s）+ 协议 + 方法
func supplementMessages(messages []model.SignalingMessage, fields []fieldsRecord) {
	if len(fields) == 0 {
		return
	}

	// 构建 fields 记录索引：按协议分组
	type fi struct {
		rec   fieldsRecord
		tsSec float64
	}
	var sipFields, diamFields []fi
	for _, f := range fields {
		ts, _ := strconv.ParseFloat(f.Timestamp, 64)
		entry := fi{rec: f, tsSec: ts}
		if f.SIPMethod != "" || f.SIPStatusCode != "" {
			sipFields = append(sipFields, entry)
		}
		if f.DiamCmdCode != "" {
			diamFields = append(diamFields, entry)
		}
	}

	for i := range messages {
		msg := &messages[i]
		ts := float64(msg.Timestamp.UnixMicro()) / 1e6

		if msg.Protocol == "SIP" {
			// 尝试从 SIP fields 补充
			for _, sf := range sipFields {
				if abs64(sf.tsSec-ts) > 0.01 {
					continue
				}
				// 补充缺失字段
				if msg.Method == "" && sf.rec.SIPMethod != "" {
					msg.Method = sf.rec.SIPMethod
					msg.Direction = "request"
				}
				if msg.StatusCode == 0 && sf.rec.SIPStatusCode != "" {
					c, _ := strconv.Atoi(sf.rec.SIPStatusCode)
					msg.StatusCode = c
					msg.Direction = "response"
				}
				if msg.CallID == "" && sf.rec.SIPCallID != "" {
					msg.CallID = sf.rec.SIPCallID
					msg.Identifiers.CallID = sf.rec.SIPCallID
				}
				if msg.Identifiers.SIPURI == "" && sf.rec.SIPFromUser != "" {
					msg.Identifiers.SIPURI = sf.rec.SIPFromUser
					msg.Identifiers.MSISDN = extractMSISDN(sf.rec.SIPFromUser)
					if imsi := extractIMSI(sf.rec.SIPFromUser); imsi != "" {
						msg.Identifiers.IMSI = imsi
					}
				}
				// 从 SIP URI 正则提取明文 IMSI (sip:15位数字@)
				if msg.Identifiers.IMSI == "" {
					for _, uri := range []string{sf.rec.SIPFromURI, sf.rec.SIPToURI} {
						if imsi := extractIMSIFromSIPURI(uri); imsi != "" {
							msg.Identifiers.IMSI = imsi
							break
						}
					}
				}
				if _, ok := msg.Details["cseq_method"]; !ok && sf.rec.SIPCSeq != "" {
					msg.Details["cseq_method"] = sf.rec.SIPCSeq
				}
				break
			}
		}

		if msg.Protocol == "Diameter" {
			// 尝试从 Diameter fields 补充
			for _, df := range diamFields {
				if abs64(df.tsSec-ts) > 0.01 {
					continue
				}
				// 补充 Origin-Host
				if _, ok := msg.Details["origin_host"]; !ok && df.rec.DiamOriginH != "" {
					msg.Details["origin_host"] = df.rec.DiamOriginH
				}
				// 补充 User-Name (IMSI)
				if msg.Identifiers.IMSI == "" && df.rec.DiamUser != "" {
					// User-Name 可能是 IMSI 或 SIP URI
					if imsi := extractIMSI(df.rec.DiamUser); imsi != "" {
						msg.Identifiers.IMSI = imsi
					}
					// 也存入 SIPURI（可能是 IMPU 格式如 417010000000003@ims...）
					if strings.Contains(df.rec.DiamUser, "@") {
						msg.Identifiers.SIPURI = df.rec.DiamUser
						msg.Identifiers.IMPU = df.rec.DiamUser
					}
				}
				// 补充 Session-Id → CallID（Diameter Session-Id 用于关联同一会话）
				if msg.Identifiers.CallID == "" && df.rec.DiamSession != "" {
					msg.Identifiers.CallID = df.rec.DiamSession
				}
				// 补充 Result-Code
				if msg.StatusCode == 0 && df.rec.DiamResult != "" {
					c, _ := strconv.Atoi(df.rec.DiamResult)
					msg.StatusCode = c
				}
				break
			}
		}

		// GTPv2 补充 cause + UE IPv4 + IMSI
		if msg.Protocol == "GTPv2C" {
			for _, f := range fields {
				fTs, _ := strconv.ParseFloat(f.Timestamp, 64)
				if abs64(fTs-ts) > 0.01 {
					continue
				}
				// 补充 cause
				if msg.StatusCode == 0 && f.GTPv2Cause != "" {
					c, _ := strconv.Atoi(f.GTPv2Cause)
					if c > 0 {
						msg.StatusCode = c
						msg.Details["cause"] = c
					}
				}
				// 补充 UE IPv4 (PAA - PDN Address Allocation)
				if msg.Identifiers.UEIPv4 == "" && f.GTPv2PAA != "" {
					msg.Identifiers.UEIPv4 = f.GTPv2PAA
				}
				// 补充 E.212 IMSI (GTPv2/GTP/Diameter/NAS-EPS 统一字段)
				if msg.Identifiers.IMSI == "" && f.E212IMSI != "" {
					msg.Identifiers.IMSI = f.E212IMSI
				}
				break
			}
		}

		// S1AP 补充 IMSI (s1ap.iMSI 是 FT_BYTES，e212.imsi 也可能匹配)
		if msg.Protocol == "S1AP" {
			for _, f := range fields {
				fTs, _ := strconv.ParseFloat(f.Timestamp, 64)
				if abs64(fTs-ts) > 0.01 {
					continue
				}
				if msg.Identifiers.IMSI == "" {
					if f.S1APIMSI != "" {
						msg.Identifiers.IMSI = f.S1APIMSI
					} else if f.E212IMSI != "" {
						msg.Identifiers.IMSI = f.E212IMSI
					}
				}
				break
			}
		}

		// NAS-EPS 补充 IMSI (e212.imsi 覆盖 NAS-EPS Identity Response)
		if msg.Protocol == "NAS-EPS" {
			for _, f := range fields {
				fTs, _ := strconv.ParseFloat(f.Timestamp, 64)
				if abs64(fTs-ts) > 0.01 {
					continue
				}
				if msg.Identifiers.IMSI == "" && f.E212IMSI != "" {
					msg.Identifiers.IMSI = f.E212IMSI
				}
				break
			}
		}

		// NAS-5GS 补充 MSIN (SUCI 中的 MSIN 部分，需要组合 MCC+MNC+MSIN 还原 IMSI)
		if msg.Protocol == "NAS-5GS" {
			for _, f := range fields {
				fTs, _ := strconv.ParseFloat(f.Timestamp, 64)
				if abs64(fTs-ts) > 0.01 {
					continue
				}
				if f.NAS5GSMSIN != "" && msg.Identifiers.IMSI == "" {
					// MSIN 仅是 IMSI 的一部分，无法独立还原完整 IMSI
					// 存入 details 供后续关联使用
					msg.Details["suci_msin"] = f.NAS5GSMSIN
				}
				// E.212 IMSI 在 5G NAS 中通常不可用（SUPI 被加密为 SUCI）
				if msg.Identifiers.IMSI == "" && f.E212IMSI != "" {
					msg.Identifiers.IMSI = f.E212IMSI
				}
				break
			}
		}
	}
}

func abs64(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
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

// findInMap 在嵌套 map 中递归查找指定 key，返回第一个匹配的值。
// tshark -T json 的 SIP 输出层级很深，例如：
//
//	sip.Method 在 sip.Request-Line_tree.sip.Method
//	sip.Status-Code 在 sip.Status-Line_tree.sip.Status-Code
//	sip.from.user 在 sip.msg_hdr_tree.sip.From_tree.sip.from.addr_tree.sip.from.user
//	sip.Call-ID 在 sip.msg_hdr_tree.sip.Call-ID
func findInMap(m map[string]any, key string) (string, bool) {
	// 直接查找
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok && s != "" {
			return s, true
		}
	}
	// 递归查找子 map
	for _, v := range m {
		if sub, ok := v.(map[string]any); ok {
			if s, found := findInMap(sub, key); found {
				return s, true
			}
		}
	}
	return "", false
}

// parseSIPFromLayers 解析 SIP 协议
// tshark -T json 的 SIP 层结构：
//
//	sip.Request-Line_tree.sip.Method          (请求方法)
//	sip.Status-Line_tree.sip.Status-Code      (响应码)
//	sip.Status-Line_tree.sip.Status-Phrase    (响应短语)
//	sip.msg_hdr_tree.sip.From_tree.sip.from.addr_tree.sip.from.user  (From URI user)
//	sip.msg_hdr_tree.sip.To_tree.sip.to.addr_tree.sip.to.user       (To URI user)
//	sip.msg_hdr_tree.sip.Call-ID              (Call-ID)
//	sip.msg_hdr_tree.sip.CSeq_tree.sip.CSeq.method  (CSeq 方法)
func parseSIPFromLayers(msg *model.SignalingMessage, raw any) {
	sip, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "SIP"

	// 根据端口判断接口
	msg.Interface = guessSIPInterface(msg.SourcePort, msg.DestPort)

	// Method — 从 Request-Line_tree 或 Status-Line_tree 提取
	if m, ok := findInMap(sip, "sip.Method"); ok {
		msg.Method = m
		msg.Direction = "request"
	}
	if code, ok := findInMap(sip, "sip.Status-Code"); ok {
		c, _ := strconv.Atoi(code)
		msg.StatusCode = c
		msg.Direction = "response"
		if phrase, ok := findInMap(sip, "sip.Status-Phrase"); ok {
			msg.StatusText = phrase
		}
	}

	// From/To URI — 递归查找
	if from, ok := findInMap(sip, "sip.from.user"); ok {
		msg.Identifiers.MSISDN = extractMSISDN(from)
		msg.Identifiers.SIPURI = from
		// 尝试从 SIP user 部分提取 IMSI
		if imsi := extractIMSI(from); imsi != "" {
			msg.Identifiers.IMSI = imsi
		}
	}
	// 正则提取 sip.from.uri 中明文 IMSI (sip:15位数字@)
	if fromURI, ok := findInMap(sip, "sip.from.uri"); ok {
		if msg.Identifiers.IMSI == "" {
			if imsi := extractIMSIFromSIPURI(fromURI); imsi != "" {
				msg.Identifiers.IMSI = imsi
			}
		}
		if msg.Identifiers.SIPURI == "" {
			msg.Identifiers.SIPURI = fromURI
		}
	}
	if to, ok := findInMap(sip, "sip.to.user"); ok {
		if msg.Identifiers.MSISDN == "" {
			msg.Identifiers.MSISDN = extractMSISDN(to)
		}
		if msg.Identifiers.IMSI == "" {
			if imsi := extractIMSI(to); imsi != "" {
				msg.Identifiers.IMSI = imsi
			}
		}
	}
	// 正则提取 sip.to.uri 中明文 IMSI
	if toURI, ok := findInMap(sip, "sip.to.uri"); ok {
		if msg.Identifiers.IMSI == "" {
			if imsi := extractIMSIFromSIPURI(toURI); imsi != "" {
				msg.Identifiers.IMSI = imsi
			}
		}
	}
	if callID, ok := findInMap(sip, "sip.Call-ID"); ok {
		msg.CallID = callID
		msg.Identifiers.CallID = callID
	}

	// CSeq 方法 — 用于 correlator 的 IMS 注册检查
	if cseqMethod, ok := findInMap(sip, "sip.CSeq.method"); ok {
		msg.Details["cseq_method"] = cseqMethod
	}

	// Contact URI
	if contact, ok := findInMap(sip, "sip.contact.user"); ok {
		msg.Details["sip.contact.user"] = contact
	}

	// 网元推断 — 根据接口类型和方向
	msg.SourceEntity, msg.DestEntity = guessSIPEntities(msg.Interface, msg.Direction)

	// 存储 SIP 特定字段到 details（递归提取）
	for _, key := range []string{"sip.Method", "sip.Status-Code", "sip.Status-Phrase",
		"sip.from.user", "sip.to.user", "sip.Call-ID", "sip.Request-URI"} {
		if v, ok := findInMap(sip, key); ok {
			msg.Details[key] = v
		}
	}
}

// extractIMSI 从字符串中提取 15 位 IMSI（以 460/417/310 等 MCC 开头）
func extractIMSI(s string) string {
	// 清理非数字字符
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
	// 查找 15 位 IMSI 模式
	for i := 0; i <= len(digits)-15; i++ {
		candidate := digits[i : i+15]
		// 检查是否以已知 MCC 开头
		mcc := candidate[:3]
		switch mcc {
		case "460", "417", "310", "311", "312", "262", "208", "234", "235", "440", "441", "450", "452", "520", "525":
			return candidate
		}
	}
	// 如果没有匹配已知 MCC，但有 15 位纯数字，也返回（可能是测试 IMSI）
	if len(digits) >= 15 {
		return digits[:15]
	}
	return ""
}

// reSIPURIImsi 匹配 SIP URI 中明文嵌入的 IMSI。
//
// 匹配模式: sip:<15位数字>@... 或 sips:<15位数字>@...
// 示例: sip:417010000000003@ims.mnc001.mcc417.3gppnetwork.org
//
// 这是 IMS 注册场景中 P-CSCF/S-CSCF 在 SIP URI 中携带 IMSI 的标准格式。
// 与 extractIMSI 的区别: 本函数严格匹配 URI 结构 (sip:...@)，
// 避免从 SIP 消息体中误提取不相关的数字序列。
var reSIPURIImsi = regexp.MustCompile(`sips?:(\d{15})@`)

// extractIMSIFromSIPURI 从 SIP URI 中正则提取明文 IMSI。
//
// 返回第一个匹配的 15 位 IMSI；无匹配返回空串。
func extractIMSIFromSIPURI(s string) string {
	m := reSIPURIImsi.FindStringSubmatch(s)
	if len(m) > 1 {
		return m[1]
	}
	return ""
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
	}

	// 判断请求/响应：从 flags_tree 中提取 request 位
	if flagsTree, ok := dia["diameter.flags_tree"].(map[string]any); ok {
		if req, ok := flagsTree["diameter.flags.request"].(string); ok && req == "1" {
			msg.Direction = "request"
		} else {
			msg.Direction = "response"
		}
	} else {
		msg.Direction = "response"
	}

	// Application ID — tshark 字段名: diameter.applicationId
	if appIDStr, ok := dia["diameter.applicationId"].(string); ok {
		id, _ := strconv.Atoi(appIDStr)
		msg.Details["app_id"] = id
		msg.Interface = diameterInterface(id)
	}

	// Result Code
	if result, ok := dia["diameter.result_code"].(string); ok {
		c, _ := strconv.Atoi(result)
		msg.StatusCode = c
	}

	// 从 AVP tree 中提取 Origin-Host 用于网元推断
	originHost := extractDiameterOriginHost(dia)
	if originHost != "" {
		msg.Details["origin_host"] = originHost
	}

	// 获取命令码用于实体推断
	cmdCode := 0
	if c, ok := msg.Details["cmd_code"].(int); ok {
		cmdCode = c
	}

	// 根据 Origin-Host + 接口 + 命令码推断源网元
	srcEntity, dstEntity := guessDiameterEntities(dia, msg.Interface, originHost, cmdCode)

	// 响应消息交换源/目标
	if msg.Direction == "response" {
		msg.SourceEntity = dstEntity
		msg.DestEntity = srcEntity
	} else {
		msg.SourceEntity = srcEntity
		msg.DestEntity = dstEntity
	}
}

// parseGTPv2FromLayers 解析 GTPv2-C 协议
func parseGTPv2FromLayers(msg *model.SignalingMessage, raw any) {
	gtp, ok := raw.(map[string]any)
	if !ok {
		return
	}

	msg.Protocol = "GTPv2C"

	if mt, ok := gtp["gtpv2.message_type"].(string); ok {
		t, _ := strconv.Atoi(mt)
		msg.Method = gtpv2MethodName(t)
		msg.Details["message_type"] = t

		// GTPv2C 方向检测：tshark 提供 gtpv2.teid presence 判断
		// 请求消息 TEID=0 (或无 TEID), 响应消息 TEID≠0
		// 简化：根据消息类型判断 (偶数=请求, 奇数=响应, 3GPP TS 29.274)
		msg.Direction = gtpv2Direction(t)
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
	// GTPv2 Cause (3GPP TS 29.274: 16=Request Accepted)
	if cause, ok := findInMap(gtp, "gtpv2.cause"); ok {
		c, _ := strconv.Atoi(cause)
		msg.StatusCode = c
		msg.Details["cause"] = c
	}
	// UE IPv4 (PDN Address Allocation)
	if paa, ok := findInMap(gtp, "gtpv2.pdn_addr_and_prefix.ipv4"); ok {
		msg.Identifiers.UEIPv4 = paa
	}

	// 接口和实体推断
	msg.Interface, msg.SourceEntity, msg.DestEntity = guessGTPv2Entities(msg.SourcePort, msg.DestPort, msg.Method)

	// 响应消息交换源/目标
	if msg.Direction == "response" {
		msg.SourceEntity, msg.DestEntity = msg.DestEntity, msg.SourceEntity
	}
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
		// PFCP 方向: 1-50=请求, 51-100=响应 (3GPP TS 29.244)
		msg.Direction = pfcpDirection(t)
	}
	if seid, ok := pfcp["pfcp.seid"].(string); ok {
		msg.Details["seid"] = seid
	}

	// N4 接口: SMF → UPF (请求), UPF → SMF (响应)
	msg.SourceEntity = "SMF"
	msg.DestEntity = "UPF"
	if msg.Direction == "response" {
		msg.SourceEntity, msg.DestEntity = "UPF", "SMF"
	}
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

	// S1AP 方向: 由 tshark 的 procedureCode 决定
	// InitiatingMessage=请求, SuccessfulOutcome/UnsuccessfulOutcome=响应
	msg.Direction = "request"
	if _, ok := s1ap["s1ap.successfulOutcome"]; ok {
		msg.Direction = "response"
	} else if _, ok := s1ap["s1ap.unsuccessfulOutcome"]; ok {
		msg.Direction = "response"
	}

	// S1-MME: eNB → MME (请求), MME → eNB (响应)
	msg.SourceEntity = "eNB"
	msg.DestEntity = "MME"
	if msg.Direction == "response" {
		msg.SourceEntity, msg.DestEntity = "MME", "eNB"
	}
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

	// NGAP 方向: 同 S1AP
	msg.Direction = "request"
	if _, ok := ngap["ngap.successfulOutcome"]; ok {
		msg.Direction = "response"
	} else if _, ok := ngap["ngap.unsuccessfulOutcome"]; ok {
		msg.Direction = "response"
	}

	// N2: gNB → AMF (请求), AMF → gNB (响应)
	msg.SourceEntity = "gNB"
	msg.DestEntity = "AMF"
	if msg.Direction == "response" {
		msg.SourceEntity, msg.DestEntity = "AMF", "gNB"
	}
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

	// N1: UE → AMF (上行), AMF → UE (下行)
	// 方向由 SCTP 层或 IP 层决定，此处使用默认上行
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

	// S1-MME (承载层): UE → MME (上行), MME → UE (下行)
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

	// SGs: MME → MSC (请求), MSC → MME (响应/通知)
	msg.SourceEntity = "MME"
	msg.DestEntity = "MSC"
	msg.Direction = "request"
}

// -----------------------------------------------------------
// 辅助函数
// -----------------------------------------------------------

// guessSIPInterface 根据端口猜测 SIP 接口
// 任一端口命中即可判断接口类型
func guessSIPInterface(srcPort, dstPort int) string {
	for _, p := range []int{dstPort, srcPort} {
		switch p {
		case 5060, 5061:
			return "Gm" // UE ↔ P-CSCF
		case 6060:
			return "Mw" // P-CSCF ↔ I-CSCF ↔ S-CSCF
		case 7060:
			return "ISC" // S-CSCF ↔ AS
		}
	}
	return "Gm"
}

// guessSIPEntities 根据 SIP 接口和方向推断源/目标网元
// 3GPP 接口定义：
//   Gm:  UE ↔ P-CSCF (端口 5060/5061)
//   Mw:  P-CSCF ↔ I-CSCF ↔ S-CSCF (端口 6060)
//   ISC: S-CSCF ↔ AS (端口 7060)
func guessSIPEntities(iface string, direction string) (src, dst string) {
	switch iface {
	case "Gm":
		// UE ↔ P-CSCF
		if direction == "request" {
			return "UE", "P-CSCF"
		}
		return "P-CSCF", "UE"

	case "Mw":
		// P-CSCF ↔ I-CSCF ↔ S-CSCF
		// 注册流程: P-CSCF → I-CSCF → S-CSCF
		// 响应流程: S-CSCF → I-CSCF → P-CSCF
		if direction == "request" {
			return "P-CSCF", "I-CSCF"
		}
		return "I-CSCF", "P-CSCF"

	case "ISC":
		// S-CSCF ↔ AS (iFC 触发)
		if direction == "request" {
			return "S-CSCF", "AS"
		}
		return "AS", "S-CSCF"

	default:
		// 未知接口，回退到 UE ↔ P-CSCF
		if direction == "request" {
			return "UE", "P-CSCF"
		}
		return "P-CSCF", "UE"
	}
}

// extractDiameterOriginHost 从 tshark JSON 的 AVP tree 中提取 Origin-Host
// tshark 输出格式: diameter.avp_tree 中可能包含 diameter.Origin-Host
func extractDiameterOriginHost(dia map[string]any) string {
	// 直接在顶层查找（部分 tshark 版本）
	if host, ok := dia["diameter.Origin-Host"].(string); ok && host != "" {
		return host
	}
	// 在 avp_tree 中查找
	if avpTree, ok := dia["diameter.avp_tree"].(map[string]any); ok {
		if host, ok := avpTree["diameter.Origin-Host"].(string); ok && host != "" {
			return host
		}
	}
	return ""
}

// guessDiameterEntities 根据 Diameter 消息内容推断源/目标网元
// 优先使用 Origin-Host AVP，回退到接口类型 + 命令码推断
func guessDiameterEntities(dia map[string]any, iface string, originHost string, cmdCode int) (src, dst string) {
	// 尝试从 Origin-Host 推断
	if originHost != "" {
		host := strings.ToLower(originHost)
		switch {
		case strings.Contains(host, "mme"):
			return "MME", "HSS"
		case strings.Contains(host, "hss"):
			return "HSS", "MME"
		case strings.Contains(host, "smf"):
			return "SMF", "PCF"
		case strings.Contains(host, "pcf"), strings.Contains(host, "pcrf"):
			return "PCF", "SMF"
		case strings.Contains(host, "sgsn"):
			return "SGSN", "HSS"
		case strings.Contains(host, "scscf"):
			return "S-CSCF", "HSS"
		case strings.Contains(host, "icscf"):
			return "I-CSCF", "HSS"
		case strings.Contains(host, "pcscf"):
			return "P-CSCF", "HSS"
		}
	}

	// 根据接口类型 + 命令码推断
	// 参考: 3GPP TS 29.272 (S6a/S6d), TS 29.228/29.229 (Cx), TS 29.328/29.329 (Sh)
	switch iface {
	case "Base":
		// Diameter Common Messages (App-ID=0): DWR/DWA, CER/CEA 等
		// 双向对等，无法确定发起方
		return "Diameter Peer", "Diameter Peer"

	case "S6a":
		// S6a: MME ↔ HSS (PS 移动性管理, 4G)
		return "MME", "HSS"

	case "Cx":
		// Cx: S-CSCF/I-CSCF ↔ HSS (3GPP TS 29.228/29.229)
		switch cmdCode {
		case 300:
			return "I-CSCF", "HSS" // UAR
		case 301:
			return "S-CSCF", "HSS" // SAR
		case 302:
			return "I-CSCF", "HSS" // LIR
		case 303:
			return "S-CSCF", "HSS" // MAR
		case 304:
			return "HSS", "S-CSCF" // RTR (HSS 主动)
		case 305:
			return "HSS", "S-CSCF" // PPR (HSS 主动)
		case 280:
			return "Cx Peer", "Cx Peer" // DWR/DWA 双向对等
		default:
			return "S-CSCF", "HSS"
		}

	case "Sh":
		// Sh: S-CSCF/AS ↔ HSS (透明数据存储, 如 MMTel)
		return "S-CSCF", "HSS"

	case "Rx":
		// Rx: P-CSCF → PCRF (IMS 业务策略请求)
		return "P-CSCF", "PCRF"

	case "Gx":
		// Gx: PGW ↔ PCRF (承载策略控制, 4G)
		return "PGW", "PCRF"

	case "Gxx":
		// Gxx: SGW(BBERF) ↔ PCRF (接入网策略)
		return "SGW", "PCRF"

	case "SWx":
		// SWx: 3GPP AAA ↔ HSS (WLAN 认证)
		return "3GPP AAA", "HSS"

	case "S6b":
		// S6b: ePDG ↔ 3GPP AAA (非 3GPP 接入认证)
		return "ePDG", "3GPP AAA"

	case "N7":
		// N7: SMF ↔ PCF (5G 会话策略)
		return "SMF", "PCF"

	case "S13":
		// S13: MME ↔ EIR (设备标识检查)
		return "MME", "EIR"

	case "Gy":
		// Gy: PGW ↔ OCS (在线计费)
		return "PGW", "OCS"

	case "S9":
		// S9: PCRF ↔ PCRF (跨域策略)
		return "PCRF", "PCRF"

	case "SLh", "SLg":
		// SLh/SLg: MME ↔ GMLC (定位服务)
		return "MME", "GMLC"

	default:
		// 未知接口，使用通用标签
		return "Diameter Peer", "Diameter Peer"
	}
}

// guessGTPv2Entities 根据 GTPv2 消息推断接口和源/目标网元
// GTPv2-C 标准端口 2123, 接口由消息类型和上下文决定
func guessGTPv2Entities(srcPort, dstPort int, method string) (iface, src, dst string) {
	// 默认 S11: MME ↔ SGW
	// S5/S8: SGW ↔ PGW (Create/Delete/Modify Session 等)
	// S10: MME ↔ MME (Context Transfer 等)
	// S3: MME ↔ SGSN
	// S4: SGSN ↔ SGW
	switch method {
	case "Create Session Request", "Create Session Response",
		"Delete Session Request", "Delete Session Response",
		"Modify Bearer Request", "Modify Bearer Response",
		"Create Bearer Request", "Create Bearer Response",
		"Delete Bearer Request", "Delete Bearer Response":
		// 这些消息在 S11 和 S5/S8 都可能出现
		// 默认 S11 (MME→SGW), 如需 S5/S8 需要 IP 匹配
		return "S11", "MME", "SGW"

	case "Context Request", "Context Response", "Context Acknowledge":
		// S10: 跨 MME 切换
		return "S10", "MME", "MME"

	case "Forward Relocation Request", "Forward Relocation Response",
		"Forward Relocation Complete Notification":
		// S10: 跨 MME 切换
		return "S10", "MME", "MME"

	default:
		return "S11", "MME", "SGW"
	}
}

// gtpv2Direction 根据 GTPv2C 消息类型判断方向
// 3GPP TS 29.274: 消息类型值中, 请求和响应通过消息名称区分
func gtpv2Direction(msgType int) string {
	// GTPv2C 消息类型分类 (简化版)
	// 请求类型 (偶数序号区域)
	switch msgType {
	case 1, 2: // Echo
		if msgType == 1 {
			return "request"
		}
		return "response"
	case 32: // Create Session
		return "request"
	case 33: // Create Session Response
		return "response"
	case 34: // Modify Bearer
		return "request"
	case 35: // Modify Bearer Response
		return "response"
	case 36: // Delete Session
		return "request"
	case 37: // Delete Session Response
		return "response"
	case 64: // Create Bearer
		return "request"
	case 65: // Create Bearer Response
		return "response"
	case 66: // Update Bearer
		return "request"
	case 67: // Update Bearer Response
		return "response"
	case 68: // Delete Bearer
		return "request"
	case 69: // Delete Bearer Response
		return "response"
	case 95: // Delete PDN Connection Set
		return "request"
	case 96: // Delete PDN Connection Set Response
		return "response"
	case 128: // Identification
		return "request"
	case 129: // Identification Response
		return "response"
	case 130: // Context
		return "request"
	case 131: // Context Response
		return "response"
	case 132: // Context Acknowledge
		return "response"
	case 133: // Forward Relocation
		return "request"
	case 134: // Forward Relocation Response
		return "response"
	case 135: // Forward Relocation Complete
		return "request"
	case 136: // Forward Relocation Complete Acknowledge
		return "response"
	case 152: // Change Notification
		return "request"
	case 153: // Change Notification Response
		return "response"
	default:
		// 通用规则: 奇数=响应, 偶数=请求
		if msgType%2 == 0 {
			return "request"
		}
		return "response"
	}
}

// pfcpDirection 根据 PFCP 消息类型判断方向
// 3GPP TS 29.244: 消息类型 1-50=请求, 51-100=响应
func pfcpDirection(msgType int) string {
	if msgType >= 1 && msgType <= 50 {
		return "request"
	}
	return "response"
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
	case 300:
		return "User-Authorization"
	case 301:
		return "Server-Assignment"
	case 302:
		return "Location-Info"
	case 303:
		return "Multimedia-Auth"
	case 304:
		return "Registration-Termination"
	case 305:
		return "Push-Profile"
	case 321:
		return "Profile-Update"
	default:
		return fmt.Sprintf("Command-%d", code)
	}
}

// diameterInterface 根据 IANA Application ID 返回接口名称
// 参考: https://www.iana.org/assignments/auth-namespace-ids/auth-namespace-ids.xml
func diameterInterface(appID int) string {
	switch appID {
	case 0:
		return "Base" // Diameter Common Messages (Device-Watchdog, Capabilities-Exchange 等)
	case 16777216:
		return "Cx" // Cx: I/S-CSCF ↔ HSS
	case 16777217:
		return "Sh" // Sh: S-CSCF/AS ↔ HSS
	case 16777236:
		return "Rx" // Rx: P-CSCF → PCRF (IMS 业务策略)
	case 16777238:
		return "Gx" // Gx: PGW ↔ PCRF (承载策略控制)
	case 16777239:
		return "Gxx" // Gxx: SGW(BBERF) ↔ PCRF (接入网策略)
	case 16777250:
		return "SWx" // SWx: 3GPP AAA ↔ HSS (WLAN 认证)
	case 16777251:
		return "S6a" // S6a: MME ↔ HSS (PS 移动性管理)
	case 16777252:
		return "S6b" // S6b: ePDG ↔ 3GPP AAA (非 3GPP 接入认证)
	case 16777267:
		return "N7" // N7: SMF ↔ PCF (5G 会话策略)
	case 16777272:
		return "S13" // S13: MME ↔ EIR (设备标识检查)
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
