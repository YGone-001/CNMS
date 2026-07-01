import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Paperclip, X, Tag, Layers, File, Eye, Edit2, Image as ImageIcon } from 'lucide-react';
import { authFetch } from '@/App';
import MarkdownViewer from '@/components/MarkdownViewer';
import type { KbAttachment } from '@/types/monitor';

const CATEGORIES = [
  { id: 'SIP', name: 'SIP' },
  { id: 'Diameter', name: 'Diameter' },
  { id: 'GTP', name: 'GTP' },
  { id: 'HTTP/2', name: 'HTTP/2' },
  { id: 'VoLTE', name: 'VoLTE' },
  { id: '5G SA', name: '5G SA' },
  { id: 'NAS', name: 'NAS' },
  { id: 'PFCP', name: 'PFCP' },
  { id: 'General', name: 'General' },
];

interface FormData {
  title: string;
  protocol: string;
  phenomenon: string;
  root_cause: string;
  solution: string;
  tags: string;
  attachments: KbAttachment[];
}

const EMPTY_FORM: FormData = {
  title: '',
  protocol: 'Signaling',
  phenomenon: '',
  root_cause: '',
  solution: '',
  tags: '',
  attachments: [],
};

export default function KnowledgeBaseEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const loadEntry = useCallback(async () => {
    if (!id) return;
    try {
      const res = await authFetch(`/api/v1/solutions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          title: data.title || '',
          protocol: data.protocol || 'Signaling',
          phenomenon: data.phenomenon || '',
          root_cause: data.root_cause || '',
          solution: data.solution || '',
          tags: (data.tags || []).join(', '),
          attachments: data.attachments || [],
        });
      }
    } catch {
      navigate('/kb');
    }
  }, [id, navigate]);

  useEffect(() => {
    if (isEdit) {
      loadEntry();
    }
  }, [isEdit, loadEntry]);

  const uploadFile = async (file: File, isImage: boolean = false) => {
    const formDataObj = new FormData();
    formDataObj.append('file', file);

    try {
      const res = await authFetch('/api/v1/solutions/upload', {
        method: 'POST',
        body: formDataObj,
      });
      const data = await res.json();
      if (data.status === 'ok') {
        if (isImage) {
          setFormData((prev) => ({
            ...prev,
            solution: prev.solution + `\n![img](${data.url})\n`,
          }));
        } else {
          const newAtt: KbAttachment = {
            original_name: data.original_name,
            url: data.url,
            size: data.size,
            type: data.type,
          };
          setFormData((prev) => ({
            ...prev,
            attachments: [...prev.attachments, newAtt],
          }));
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) return;

    setLoading(true);
    const payload = {
      title: formData.title,
      protocol: formData.protocol,
      phenomenon: formData.phenomenon,
      root_cause: formData.root_cause,
      solution: formData.solution,
      tags: formData.tags
        ? formData.tags.split(',').map((t) => t.trim()).filter((t) => t)
        : [],
      attachments: formData.attachments,
    };

    try {
      const url = isEdit ? `/api/v1/solutions?id=${id}` : '/api/v1/solutions';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        navigate('/kb');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const removeAttachment = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="max-w-7xl mx-auto pb-16">
      {/* Sticky Header */}
      <div className="mb-5 flex justify-between items-center bg-noc-surface/90 backdrop-blur-md p-4 rounded-xl border border-noc-border shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-noc-bg rounded-lg text-noc-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="h-5 w-px bg-noc-border mx-1"></div>
          <h1 className="text-lg font-bold text-noc-text">
            {isEdit ? 'Edit Entry' : 'New Entry'}
          </h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !formData.title.trim()}
          className="flex items-center gap-1.5 px-5 py-2 bg-noc-accent text-white font-medium rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          <Save size={16} /> {loading ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-8 space-y-5">
          {/* Title */}
          <div className="bg-noc-surface p-5 rounded-xl border border-noc-border shadow-sm">
            <label className="block text-xs font-bold text-noc-muted mb-2 uppercase tracking-wide">Title</label>
            <input
              required
              className="w-full text-lg font-bold p-2 border-b-2 border-noc-border bg-transparent outline-none focus:border-noc-accent transition-colors placeholder:font-normal text-noc-text placeholder:text-noc-muted"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter solution title..."
            />
          </div>

          {/* Phenomenon */}
          <div className="bg-noc-surface p-5 rounded-xl border border-noc-border shadow-sm focus-within:ring-2 focus-within:ring-noc-error/20 transition-all">
            <div className="flex items-center gap-1.5 mb-2 text-noc-error font-bold border-b border-noc-border pb-2 uppercase text-xs tracking-wide">
              <div className="w-1.5 h-3.5 bg-noc-error rounded-full"></div> Phenomenon
            </div>
            <textarea
              required
              rows={4}
              className="w-full outline-none text-noc-text bg-transparent resize-y placeholder:text-noc-muted text-sm"
              value={formData.phenomenon}
              onChange={(e) => setFormData({ ...formData, phenomenon: e.target.value })}
              placeholder="Describe the fault phenomenon..."
            />
          </div>

          {/* Root Cause */}
          <div className="bg-noc-surface p-5 rounded-xl border border-noc-border shadow-sm focus-within:ring-2 focus-within:ring-noc-warning/20 transition-all">
            <div className="flex items-center gap-1.5 mb-2 text-noc-warning font-bold border-b border-noc-border pb-2 uppercase text-xs tracking-wide">
              <div className="w-1.5 h-3.5 bg-noc-warning rounded-full"></div> Root Cause
            </div>
            <textarea
              rows={4}
              className="w-full outline-none text-noc-text bg-transparent resize-y placeholder:text-noc-muted text-sm"
              value={formData.root_cause}
              onChange={(e) => setFormData({ ...formData, root_cause: e.target.value })}
              placeholder="Analyze the root cause..."
            />
          </div>

          {/* Solution */}
          <div className="bg-noc-surface rounded-xl border border-noc-border shadow-sm overflow-hidden min-h-[300px]">
            <div className="bg-noc-bg px-5 py-2.5 border-b border-noc-border flex justify-between items-center">
              <div className="flex items-center gap-1.5 font-bold text-noc-success uppercase text-xs tracking-wide">
                <div className="w-1.5 h-3.5 bg-noc-success rounded-full"></div> Solution
              </div>
              <div className="flex gap-1.5">
                <label className="cursor-pointer p-1.5 hover:bg-noc-surface rounded text-noc-muted transition-colors" title="Insert Image">
                  <ImageIcon size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files && uploadFile(e.target.files[0], true)}
                  />
                </label>
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-noc-surface border border-noc-border rounded hover:bg-noc-bg text-noc-text transition-colors"
                >
                  {previewMode ? <><Edit2 size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
                </button>
              </div>
            </div>
            {previewMode ? (
              <div className="p-5 prose dark:prose-invert max-w-none">
                <MarkdownViewer content={formData.solution} />
              </div>
            ) : (
              <>
                {/* Markdown Toolbar */}
                <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-noc-border bg-noc-bg/50">
                  {[
                    { label: 'B', title: '粗体', wrap: '**' },
                    { label: 'I', title: '斜体', wrap: '*' },
                    { label: '~', title: '删除线', wrap: '~~' },
                    { label: 'H1', title: '一级标题', prefix: '# ' },
                    { label: 'H2', title: '二级标题', prefix: '## ' },
                    { label: 'H3', title: '三级标题', prefix: '### ' },
                    { label: '</>', title: '行内代码', wrap: '`' },
                    { label: '::', title: '代码块', wrap: '```\n', wrapEnd: '\n```' },
                    { label: '•', title: '无序列表', prefix: '- ' },
                    { label: '1.', title: '有序列表', prefix: '1. ' },
                    { label: '>', title: '引用', prefix: '> ' },
                    { label: '—', title: '分隔线', prefix: '---\n' },
                    { label: '🔗', title: '链接', wrap: '[', wrapEnd: '](url)' },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      title={btn.title}
                      onClick={() => {
                        const ta = document.querySelector('textarea[data-md-editor]') as HTMLTextAreaElement;
                        if (!ta) return;
                        const start = ta.selectionStart;
                        const end = ta.selectionEnd;
                        const selected = formData.solution.substring(start, end);
                        let newText: string;
                        let newCursor: number;
                        if (btn.wrap) {
                          const we = btn.wrapEnd || btn.wrap;
                          newText = formData.solution.substring(0, start) + btn.wrap + selected + we + formData.solution.substring(end);
                          newCursor = start + btn.wrap.length + selected.length + we.length;
                        } else if (btn.prefix) {
                          const lineStart = formData.solution.lastIndexOf('\n', start - 1) + 1;
                          newText = formData.solution.substring(0, lineStart) + btn.prefix + formData.solution.substring(lineStart);
                          newCursor = start + btn.prefix.length;
                        } else {
                          return;
                        }
                        setFormData({ ...formData, solution: newText });
                        setTimeout(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); }, 0);
                      }}
                      className="px-2 py-1 text-xs font-mono font-bold text-noc-muted hover:text-noc-text hover:bg-noc-surface rounded transition-colors"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <textarea
                  required
                  rows={15}
                  data-md-editor
                  className="w-full p-5 outline-none font-mono text-sm leading-relaxed bg-transparent text-noc-text placeholder:text-noc-muted"
                  value={formData.solution}
                  onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                  placeholder="使用 Markdown 编写排障文档...&#10;&#10;## 现象&#10;描述故障现象...&#10;&#10;## 根因&#10;分析根本原因...&#10;&#10;## 解决方案&#10;1. 步骤一&#10;2. 步骤二"
                />
              </>
            )}
          </div>
        </div>

        {/* Right Column - Properties */}
        <div className="lg:col-span-4 space-y-5">
          {/* Properties */}
          <div className="bg-noc-surface p-4 rounded-xl border border-noc-border shadow-sm">
            <h3 className="text-xs font-bold text-noc-muted uppercase tracking-wider mb-3">Properties</h3>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-noc-text mb-1.5 flex items-center gap-1.5">
                <Layers size={12} /> Protocol
              </label>
              <select
                className="w-full p-2 bg-noc-bg border border-noc-border rounded-lg outline-none focus:border-noc-accent transition-colors text-noc-text text-sm"
                value={formData.protocol}
                onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-noc-text mb-1.5 flex items-center gap-1.5">
                <Tag size={12} /> Tags
              </label>
              <input
                className="w-full p-2 bg-noc-bg border border-noc-border rounded-lg outline-none focus:border-noc-accent transition-colors text-sm text-noc-text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="SIP, VoLTE, 5G SA, 注册失败, 无声音..."
              />
            </div>
          </div>

          {/* Attachments */}
          <div className="bg-noc-surface p-4 rounded-xl border border-noc-border shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold text-noc-muted uppercase tracking-wider">Attachments</h3>
              <label className="cursor-pointer text-noc-accent hover:text-noc-accent text-xs font-medium flex items-center gap-1">
                <Paperclip size={10} /> Add
                <input type="file" className="hidden" onChange={(e) => e.target.files && uploadFile(e.target.files[0], false)} />
              </label>
            </div>

            {formData.attachments.length > 0 ? (
              <div className="space-y-1.5">
                {formData.attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-noc-bg border border-noc-border rounded-lg text-xs group"
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <File size={12} className="text-noc-muted shrink-0" />
                      <span className="truncate text-noc-text">{file.original_name}</span>
                    </div>
                    <button
                      onClick={() => removeAttachment(idx)}
                      className="text-noc-border hover:text-noc-error opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5 border-2 border-dashed border-noc-border rounded-lg text-noc-muted text-xs">
                No attachments
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
