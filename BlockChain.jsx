/**
 * Ledger — 3D blockchain chain view.
 * Each block is a 3D card; clicking opens a full detail modal.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { pb } from '../lib/pb.js';
import { shortHash, SOURCE_ICONS, SOURCE_LABELS, STATUS_COLORS, computeBlockHash } from '../lib/blockchain.js';
import { ACTIVITY_ICONS, ACTIVITY_LABELS } from '../lib/ledger.js';
import { useLedgerPageView } from '../lib/useLedgerPageView.js';
import EarthGlobe from '../components/EarthGlobe.jsx';

// ── Live Chain Pulse component ────────────────────────────────────────────────
function LiveChainPulse({ blocks, latestBlock }) {
  const canvasRef = useRef(null);
  const pulsesRef = useRef([]);
  const rafRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    if (historyRef.current.length === 0) {
      historyRef.current = Array.from({ length: Math.max(blocks.length, 2) }, (_, i) => ({
        val: 0.3 + Math.sin(i * 0.7) * 0.25 + Math.random() * 0.35,
      })).slice(-40);
    }
  }, []);

  useEffect(() => {
    if (latestBlock) {
      historyRef.current.push({ val: 0.4 + Math.random() * 0.5 });
      if (historyRef.current.length > 40) historyRef.current.shift();
    }
  }, [latestBlock?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let t = 0;
    let running = true;

    function draw() {
      if (!running) return;
      const w = canvas.offsetWidth || 300;
      const h = canvas.offsetHeight || 72;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      const history = historyRef.current;
      const pts = history.length;
      if (pts >= 2) {
        const grd = ctx.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'rgba(34,211,238,0)');
        grd.addColorStop(0.5, 'rgba(34,211,238,0.5)');
        grd.addColorStop(1, 'rgba(34,211,238,0.95)');
        ctx.beginPath();
        history.forEach((p, i) => {
          const x = (i / (pts - 1)) * w;
          const pulse = Math.sin(t * 0.06 + i * 0.4) * 0.05;
          const y = h - (p.val + pulse) * (h * 0.72) - h * 0.08;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = grd;
        ctx.lineWidth = 2;
        ctx.stroke();
        const last = history[pts - 1];
        const lx = w - 3;
        const pulse2 = Math.sin(t * 0.06 + (pts-1) * 0.4) * 0.05;
        const ly = h - (last.val + pulse2) * (h * 0.72) - h * 0.08;
        const alpha = 0.55 + Math.sin(t * 0.1) * 0.45;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,211,238,${alpha})`;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#22d3ee';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      pulsesRef.current = pulsesRef.current.filter(p => p.frac < 1);
      pulsesRef.current.forEach(p => {
        p.frac += 0.009;
        const px = p.frac * w;
        const history2 = historyRef.current;
        const pidx = Math.min(Math.round(p.frac * (history2.length - 1)), history2.length - 1);
        const pval = history2[pidx]?.val || 0.5;
        const py = h - pval * (h * 0.72) - h * 0.08;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,211,238,${1 - p.frac})`;
        ctx.fill();
      });
      if (Math.random() < 0.025) pulsesRef.current.push({ frac: 0 });
      t++;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div className="rounded-2xl border border-cyan-500/20 overflow-hidden" style={{ background:'rgba(8,12,20,0.9)' }}>
      <div className="px-4 py-3 border-b border-white/6 flex items-center gap-2 flex-wrap">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" style={{ boxShadow:'0 0 8px rgba(34,211,238,0.9)' }} aria-hidden="true" />
        <span className="text-[11px] font-black text-cyan-300 uppercase tracking-widest">Live Chain Pulse</span>
        <div className="flex gap-3 ml-auto flex-wrap text-[10px] text-gray-500 font-mono">
          <span>12 BPM</span>
          <span className="text-cyan-500/50">·</span>
          <span>{blocks.length} blocks</span>
          {latestBlock && <span className="text-cyan-400 animate-pulse">NEW BLOCK ▲</span>}
        </div>
      </div>
      <div className="px-4 pt-2 pb-4">
        <canvas ref={canvasRef} className="w-full" style={{ height:'72px' }} aria-label="Live chain pulse visualisation" />
        <div className="flex justify-between mt-1 text-[9px] font-mono text-gray-700">
          <span>genesis</span>
          <span>block #{blocks[0]?.block_number || 0}</span>
        </div>
      </div>
    </div>
  );
}

// ── Chain Health & Network Standing ───────────────────────────────────────────
function ChainHealth({ blocks, company }) {
  const confirmed = blocks.filter(b => b.status === 'confirmed').length;
  const total = blocks.length;
  const integrityPct = total > 0 ? Math.round((confirmed / total) * 100) : 100;
  const recent = blocks.slice(0, 10);
  let chainValid = true;
  for (let i = 0; i < recent.length - 1; i++) {
    if (recent[i].previous_hash !== recent[i+1].block_hash) { chainValid = false; break; }
  }
  const blockScore = Math.min(total * 0.5, 40);
  const integrityScore = integrityPct * 0.3;
  const chainScore = chainValid ? 20 : 5;
  const activityScore = Math.min(blocks.filter(b => {
    try { return Date.now() - new Date(b.created).getTime() < 86400000; } catch { return false; }
  }).length * 2, 10);
  const networkScore = Math.min(Math.round(blockScore + integrityScore + chainScore + activityScore), 100);
  const grade = networkScore >= 90 ? { label:'A+', color:'text-emerald-400' } :
                networkScore >= 75 ? { label:'A',  color:'text-emerald-300' } :
                networkScore >= 60 ? { label:'B',  color:'text-cyan-400'    } :
                networkScore >= 45 ? { label:'C',  color:'text-amber-400'   } :
                                     { label:'D',  color:'text-red-400'     };
  const standing = networkScore >= 80 ? 'Trusted Node' :
                   networkScore >= 60 ? 'Active Member' :
                   networkScore >= 40 ? 'Building Chain' : 'New Entrant';
  const metrics = [
    { label:'Chain Integrity',   val:integrityPct+'%',             pct:integrityPct,   color:'bg-cyan-400'  },
    { label:'Block Validity',    val:chainValid?'Valid':'Warning', pct:chainValid?100:30, color:chainValid?'bg-emerald-400':'bg-amber-400' },
    { label:'Network Score',     val:networkScore+'/100',          pct:networkScore,   color:'bg-violet-400' },
    { label:'24h Activity',      val:(activityScore*10)+'%',       pct:activityScore*10, color:'bg-amber-400' },
  ];
  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden" style={{ background:'rgba(8,12,20,0.8)' }}>
      <div className="px-4 py-3 border-b border-white/6 flex items-center gap-2">
        <span className="text-base" aria-hidden="true">🛡</span>
        <span className="text-[11px] font-black text-white uppercase tracking-widest">Chain Health & Network Standing</span>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 64 64" className="w-full h-full" style={{ transform:'rotate(-90deg)' }} aria-hidden="true">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle cx="32" cy="32" r="26" fill="none" strokeWidth="8"
                stroke="#22d3ee"
                strokeDasharray={`${(networkScore/100)*(2*Math.PI*26).toFixed(1)} 999`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xl font-black ${grade.color}`} style={{ fontFamily:"'Syne',sans-serif" }}>{grade.label}</span>
            </div>
          </div>
          <div>
            <p className="text-white font-black text-lg leading-tight" style={{ fontFamily:"'Syne',sans-serif" }}>{standing}</p>
            <p className="text-gray-500 text-xs">{company?.company_name || 'Your node'} · Privi Network</p>
            <p className="text-[10px] text-gray-700 mt-0.5 font-mono">{total} blocks sealed</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {metrics.map(m => (
            <div key={m.label}>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-gray-500">{m.label}</span>
                <span className="text-gray-300 font-mono">{m.val}</span>
              </div>
              <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                <div className={`h-full rounded-full ${m.color} transition-all`} style={{ width:`${m.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function activityIcon(block) {
  const actType = block.data_payload?.activity;
  if (actType && ACTIVITY_ICONS[actType]) return ACTIVITY_ICONS[actType];
  return SOURCE_ICONS[block.source_type] || '📦';
}

function activityLabel(block) {
  const actType = block.data_payload?.activity;
  if (actType && ACTIVITY_LABELS[actType]) return ACTIVITY_LABELS[actType];
  return SOURCE_LABELS[block.source_type] || 'Data';
}

function payloadSummary(payload) {
  if (!payload) return [];
  const { activity, ...rest } = payload;
  const lines = [];
  // PoP fields always shown first if present
  if (rest.pop_stamp)   lines.push(['📍 PoP Stamp',  rest.pop_stamp]);
  if (rest.pop_zone)    lines.push(['📍 PoP Zone',   rest.pop_zone]);
  if (rest.pop_verified) lines.push(['📍 PoP Verified', '✅ True']);
  // Asset value fields
  if (rest.asset_name)           lines.push(['Asset',     rest.asset_name]);
  if (rest.asset_type)           lines.push(['Asset Type', rest.asset_type]);
  if (rest.valuation_usd != null) lines.push(['Value',    `${rest.currency || 'USD'} ${Number(rest.valuation_usd).toLocaleString()}`]);
  if (rest.previous_valuation != null) lines.push(['Prev Value', `${rest.currency || 'USD'} ${Number(rest.previous_valuation).toLocaleString()}`]);
  // Standard fields
  if (rest.company_name)         lines.push(['Company',   rest.company_name]);
  if (rest.email)                lines.push(['Email',     rest.email]);
  if (rest.employee_name)        lines.push(['Employee',  rest.employee_name]);
  if (rest.role)                 lines.push(['Role',      rest.role]);
  if (rest.department)           lines.push(['Dept',      rest.department]);
  if (rest.contract_title)       lines.push(['Contract',  rest.contract_title]);
  if (rest.vendor_name)          lines.push(['Vendor',    rest.vendor_name]);
  if (rest.new_status)           lines.push(['Status →',  rest.new_status]);
  if (rest.eth_contract_address) lines.push(['Address',   rest.eth_contract_address.slice(0,18) + '…']);
  if (rest.blockchain_network)   lines.push(['Network',   rest.blockchain_network.replace(/_/g, ' ')]);
  if (rest.value_eth > 0)        lines.push(['Value',     rest.value_eth + ' ETH']);
  if (rest.source_type)          lines.push(['Source',    rest.source_type]);
  if (rest.source_id)            lines.push(['ID',        rest.source_id]);
  if (rest.rpm)                  lines.push(['RPM',       rest.rpm]);
  if (rest.temperature_c)        lines.push(['Temp °C',   rest.temperature_c]);
  if (rest.items_scanned)        lines.push(['Scanned',   rest.items_scanned]);
  if (rest.amount)               lines.push(['Amount',    '$' + rest.amount]);
  if (rest.industry)             lines.push(['Industry',  rest.industry]);
  if (lines.length === 0) {
    Object.entries(rest).slice(0, 8).forEach(([k, v]) => {
      if (typeof v !== 'object' && v !== '') lines.push([k, String(v)]);
    });
  }
  return lines;
}

// ── Block type classification ─────────────────────────────────────────────────

function blockMeta(block) {
  const actType = block.data_payload?.activity;
  const isLogin  = actType === 'company_login';
  const isLogout = actType === 'company_logout';
  const isLoginEvent = isLogin || isLogout;
  const isMachine  = block.source_type === 'machine';
  const isScanner  = block.source_type === 'scanner';
  const isSale     = block.source_type === 'sale';

  if (isLoginEvent) return {
    accent: 'amber',
    borderClass: 'border-amber-500/35',
    bgClass: 'bg-amber-500/5',
    hoverBorder: 'hover:border-amber-400/60',
    hashColor: 'text-amber-400',
    labelColor: 'text-amber-300/90',
    dotBg: 'bg-amber-400',
    dotRing: 'ring-amber-400/30',
    connColor: 'from-amber-400/50',
    glowColor: 'rgba(251,191,36,0.15)',
    gradFrom: '#f59e0b',
    gradTo: '#d97706',
    shadowColor: 'rgba(251,191,36,0.2)',
  };
  if (isMachine) return {
    accent: 'cyan',
    borderClass: 'border-cyan-500/25',
    bgClass: 'bg-cyan-500/4',
    hoverBorder: 'hover:border-cyan-400/55',
    hashColor: 'text-cyan-400',
    labelColor: 'text-cyan-300/90',
    dotBg: 'bg-cyan-400',
    dotRing: 'ring-cyan-400/30',
    connColor: 'from-cyan-400/50',
    glowColor: 'rgba(34,211,238,0.15)',
    gradFrom: '#22d3ee',
    gradTo: '#06b6d4',
    shadowColor: 'rgba(34,211,238,0.2)',
  };
  if (isScanner) return {
    accent: 'emerald',
    borderClass: 'border-emerald-500/25',
    bgClass: 'bg-emerald-500/4',
    hoverBorder: 'hover:border-emerald-400/55',
    hashColor: 'text-emerald-400',
    labelColor: 'text-emerald-300/90',
    dotBg: 'bg-emerald-400',
    dotRing: 'ring-emerald-400/30',
    connColor: 'from-emerald-400/50',
    glowColor: 'rgba(52,211,153,0.15)',
    gradFrom: '#34d399',
    gradTo: '#10b981',
    shadowColor: 'rgba(52,211,153,0.2)',
  };
  if (isSale) return {
    accent: 'yellow',
    borderClass: 'border-yellow-500/25',
    bgClass: 'bg-yellow-500/4',
    hoverBorder: 'hover:border-yellow-400/55',
    hashColor: 'text-yellow-400',
    labelColor: 'text-yellow-300/90',
    dotBg: 'bg-yellow-400',
    dotRing: 'ring-yellow-400/30',
    connColor: 'from-yellow-400/50',
    glowColor: 'rgba(234,179,8,0.15)',
    gradFrom: '#eab308',
    gradTo: '#ca8a04',
    shadowColor: 'rgba(234,179,8,0.2)',
  };
  return {
    accent: 'violet',
    borderClass: 'border-violet-500/20',
    bgClass: 'bg-violet-500/4',
    hoverBorder: 'hover:border-violet-400/50',
    hashColor: 'text-violet-400',
    labelColor: 'text-violet-300/90',
    dotBg: 'bg-violet-400',
    dotRing: 'ring-violet-400/30',
    connColor: 'from-violet-400/50',
    glowColor: 'rgba(167,139,250,0.15)',
    gradFrom: '#a78bfa',
    gradTo: '#7c3aed',
    shadowColor: 'rgba(167,139,250,0.2)',
  };
}

// ── Block Detail Modal ────────────────────────────────────────────────────────

function BlockModal({ block, onClose }) {
  const meta = blockMeta(block);
  const icon = activityIcon(block);
  const label = activityLabel(block);
  const summary = payloadSummary(block.data_payload);
  const statusClass = STATUS_COLORS[block.status] || STATUS_COLORS.pending;

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Block ${block.block_number || ''} details`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border"
        style={{
          background: 'linear-gradient(145deg, rgba(6,10,18,0.99) 0%, rgba(8,12,24,0.98) 100%)',
          borderColor: meta.glowColor.replace('0.15', '0.4'),
          boxShadow: `0 32px 80px rgba(0,0,0,0.8), 0 0 60px ${meta.glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          animation: 'blockEntrance 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        }}
      >
        {/* Top accent strip */}
        <div
          className="h-1 w-full rounded-t-3xl"
          style={{ background: `linear-gradient(90deg, ${meta.gradFrom}, ${meta.gradTo})` }}
          aria-hidden="true"
        />

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Icon badge */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${meta.gradFrom}22, ${meta.gradTo}11)`,
                  border: `1px solid ${meta.gradFrom}33`,
                }}
                aria-hidden="true"
              >
                {icon}
              </div>
              <div>
                <div className={`text-[10px] uppercase tracking-widest font-bold mb-0.5 ${meta.labelColor}`}>
                  {label}
                </div>
                <h2 className="text-white font-black text-lg leading-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
                  Block #{block.block_number ?? '—'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/8 -mt-1 -mr-1 flex-shrink-0"
              aria-label="Close block details"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Status badge */}
          <div className="mt-4">
            <span className={`text-[10px] font-bold px-3 py-1.5 rounded-full border uppercase tracking-widest ${statusClass}`}>
              {block.status || 'pending'}
            </span>
          </div>
        </div>

        {/* Point of Position stamp — shown if block has pop_stamp */}
        {block.data_payload?.pop_stamp && (
          <div className="px-6 pb-4">
            <div
              className="rounded-xl p-3 flex items-start gap-3"
              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.18)' }}
            >
              <span className="text-lg shrink-0" aria-hidden="true">📍</span>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-bold text-[#22d3ee] mb-1">Point of Position</div>
                <div className="font-mono text-[11px] text-[#22d3ee] break-all">{block.data_payload.pop_stamp}</div>
                {block.data_payload.pop_zone && (
                  <div className="text-[10px] text-[#8a9ab0] mt-1">Zone: {block.data_payload.pop_zone}</div>
                )}
                <div className="text-[10px] text-[#34d399] mt-1">✅ PoP verified — position anchored</div>
              </div>
            </div>
          </div>
        )}

        {/* Hash chain */}
        <div className="px-6 pb-4 space-y-2">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-2">Cryptographic chain</div>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 font-mono text-[11px]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-gray-600 w-10 flex-shrink-0 text-[10px]">HASH</span>
            <span className={`${meta.hashColor} break-all leading-relaxed`}>{block.block_hash || '—'}</span>
          </div>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 font-mono text-[11px]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-gray-600 w-10 flex-shrink-0 text-[10px]">PREV</span>
            <span className="text-gray-500 break-all leading-relaxed">{block.previous_hash || '—'}</span>
          </div>
        </div>

        {/* Payload */}
        {summary.length > 0 && (
          <div className="px-6 pb-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">Payload data</div>
            <div
              className="rounded-2xl overflow-hidden divide-y"
              style={{ border: '1px solid rgba(255,255,255,0.06)', '--tw-divide-opacity': 1, 'borderColor': 'rgba(255,255,255,0.05)' }}
            >
              {summary.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-gray-600 text-[11px] w-24 flex-shrink-0 capitalize">{k}</span>
                  <span className="text-gray-200 text-[11px] font-medium truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="px-6 pb-6">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">Metadata</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Block number', `#${block.block_number ?? '—'}`],
              ['Source type', block.source_type || 'activity'],
              ['Timestamp', block.created ? new Date(block.created).toLocaleString() : '—'],
              ['Record ID', block.id?.slice(0, 12) + '…'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-0.5">{k}</div>
                <div className="text-gray-200 text-[11px] font-mono font-medium truncate">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 3D Chain block node ───────────────────────────────────────────────────────

function ChainBlock({ block, idx, total, isLast, onSelect }) {
  const meta = blockMeta(block);
  const icon = activityIcon(block);
  const label = activityLabel(block);
  const summary = payloadSummary(block.data_payload);
  const blockNum = block.block_number ?? (total - 1 - idx);
  const statusClass = STATUS_COLORS[block.status] || STATUS_COLORS.pending;
  const cardRef = useRef(null);

  const title =
    block.data_payload?.contract_title ||
    block.data_payload?.employee_name  ||
    block.data_payload?.company_name   ||
    block.data_payload?.email          ||
    block.source_id                    ||
    '—';

  // 3D tilt on mouse move
  function handleMouseMove(e) {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    cardRef.current.style.transform = `perspective(800px) rotateX(${-y * 6}deg) rotateY(${x * 4}deg) translateY(-3px) scale(1.008)`;
  }

  function handleMouseLeave() {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(800px) rotateX(1deg) rotateY(0deg) translateY(0px) scale(1)';
  }

  return (
    <div className="flex gap-0 items-stretch">
      {/* Left column: dot + connector line */}
      <div className="flex flex-col items-center w-10 flex-shrink-0">
        <div
          className={`relative z-10 mt-5 w-4 h-4 rounded-full ${meta.dotBg} ring-4 ${meta.dotRing} flex-shrink-0 cursor-pointer`}
          style={{ boxShadow: `0 0 12px ${meta.glowColor}` }}
          aria-hidden="true"
        >
          <span className={`absolute inset-0 rounded-full ${meta.dotBg} animate-ping opacity-25`} />
        </div>
        {!isLast && (
          <div className="flex-1 w-px mt-1 bg-gradient-to-b from-white/12 to-white/3 relative overflow-hidden min-h-[16px]">
            <div
              className={`absolute top-0 left-0 w-full h-10 bg-gradient-to-b ${meta.connColor} to-transparent animate-[chainPulse_2.8s_ease-in-out_infinite]`}
              style={{ animationDelay: `${(idx % 5) * 0.56}s` }}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Right column: 3D block card */}
      <article
        ref={cardRef}
        className={`block-3d flex-1 mb-4 ml-3 border rounded-2xl cursor-pointer transition-all relative overflow-hidden ${meta.borderClass} ${meta.bgClass} ${meta.hoverBorder}`}
        style={{
          animationDelay: `${Math.min(idx * 0.05, 0.4)}s`,
          boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)`,
          transformStyle: 'preserve-3d',
          transform: 'perspective(800px) rotateX(1deg)',
          transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease',
        }}
        onClick={() => onSelect(block)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onKeyDown={e => e.key === 'Enter' && onSelect(block)}
        tabIndex={0}
        role="button"
        aria-label={`Block ${blockNum} — ${label} — click to view details`}
      >
        {/* Top accent gradient line */}
        <div
          className="absolute top-0 left-4 right-4 h-px rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.gradFrom}60, transparent)` }}
          aria-hidden="true"
        />

        {/* Block number badge — 3D face */}
        <div
          className="absolute top-3 right-3 font-mono text-[9px] font-black px-2 py-0.5 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${meta.gradFrom}18, ${meta.gradTo}10)`,
            border: `1px solid ${meta.gradFrom}30`,
            color: meta.gradFrom,
          }}
          aria-hidden="true"
        >
          #{blockNum}
        </div>

        {/* Card header */}
        <div className="flex items-start gap-3 p-4 pr-14 pb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
            style={{
              background: `linear-gradient(135deg, ${meta.gradFrom}18, ${meta.gradTo}10)`,
              border: `1px solid ${meta.gradFrom}28`,
            }}
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-[10px] uppercase tracking-widest font-bold mb-0.5 ${meta.labelColor}`}>
              {label}
            </div>
            <div className="text-white font-bold text-sm truncate leading-snug">{title}</div>
          </div>
        </div>

        {/* Hash chain row */}
        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <div
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 font-mono text-[10px] overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span className="text-gray-600 flex-shrink-0 text-[9px]">HASH</span>
            <span className={`${meta.hashColor} truncate`}>{shortHash(block.block_hash)}</span>
          </div>
          <div
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 font-mono text-[10px] overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span className="text-gray-600 flex-shrink-0 text-[9px]">PREV</span>
            <span className="text-gray-500 truncate">{shortHash(block.previous_hash)}</span>
          </div>
        </div>

        {/* Payload preview */}
        {summary.length > 0 && (
          <div className="px-4 pb-3 pt-2 border-t border-white/[0.04]">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              {summary.slice(0, 3).map(([k, v]) => (
                <div key={k} className="flex gap-1.5 text-[10px] min-w-0">
                  <span className="text-gray-600 flex-shrink-0">{k}</span>
                  <span className="text-gray-300 truncate font-medium">{v}</span>
                </div>
              ))}
              {summary.length > 3 && (
                <div className="text-[10px] text-gray-600">
                  +{summary.length - 3} more…
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer row */}
        <div className="px-4 pb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] text-gray-600">
            {block.created ? new Date(block.created).toLocaleString() : ''}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${statusClass}`}>
              {block.status || 'pending'}
            </span>
            <span className={`text-[10px] ${meta.hashColor} opacity-50 flex items-center gap-1`} aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Details
            </span>
          </div>
        </div>

        {/* Bottom 3D edge shadow */}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.gradFrom}20, transparent)` }}
          aria-hidden="true"
        />
      </article>
    </div>
  );
}

// ── Genesis block ─────────────────────────────────────────────────────────────

function GenesisBlock() {
  return (
    <div className="flex gap-0 items-stretch">
      <div className="flex flex-col items-center w-10 flex-shrink-0">
        <div className="relative z-10 mt-5 w-5 h-5 rounded-full bg-gray-800 ring-4 ring-gray-700/30 flex items-center justify-center flex-shrink-0 border border-gray-700/50">
          <span className="text-[8px] text-gray-500 font-mono font-black">0</span>
        </div>
        <div className="flex-1 w-px mt-1 bg-gradient-to-b from-white/8 to-transparent min-h-[20px]" />
      </div>
      <div
        className="flex-1 mb-3 ml-3 border border-white/5 rounded-2xl bg-white/[0.015] px-4 py-3"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
      >
        <div className="text-[9px] text-gray-700 uppercase tracking-widest mb-1.5 font-bold">Genesis Block</div>
        <div className="font-mono text-[9px] text-gray-800 break-all">{'0'.repeat(64)}</div>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'text-white', border = 'border-white/8', bg = 'bg-white/3', glow, onClick }) {
  return (
    <button
      className={`border rounded-2xl p-4 text-left transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer ${border} ${bg}`}
      style={{ boxShadow: glow ? `0 0 20px ${glow}` : undefined, transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease' }}
      onClick={onClick}
      type="button"
    >
      <div className="text-[9px] text-gray-500 uppercase tracking-widest mb-1.5 font-bold">{label}</div>
      <div className={`text-2xl font-black font-mono ${color}`}>{value}</div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BlockChain() {
  useLedgerPageView('Ledger');
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [deviceAlerts, setDeviceAlerts] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [resolvingAlert, setResolvingAlert] = useState(null);
  const [latestBlock, setLatestBlock] = useState(null);
  const company = pb.authStore.record;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!company?.id) { setLoading(false); return; }
      try {
        const res = await pb.collection('workflow_blocks').getList(1, 300, {
          filter: `company = "${company.id}"`,
          sort: '-block_number',
          signal: controller.signal,
        });
        setBlocks(res.items);
      } catch (err) {
        if (err?.isAbort) return;
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [company?.id]);

  // Load active device alerts
  useEffect(() => {
    if (!company?.id) return;
    const ctrl = new AbortController();
    function loadAlerts() {
      pb.collection('device_alerts').getList(1, 100, {
        filter: `company = "${company.id}" && alert_status = "active"`,
        sort: '-created',
        signal: ctrl.signal,
      }).then(r => setDeviceAlerts(r.items)).catch(e => { if (!e?.isAbort) {} });
    }
    loadAlerts();
    const iv = setInterval(loadAlerts, 60000);
    return () => { ctrl.abort(); clearInterval(iv); };
  }, [company?.id]);

  // ── Global 5-second chain heartbeat ──────────────────────────────────────
  const heartbeatRef = useRef(false);
  useEffect(() => {
    if (!company?.id) return;
    let running = true;
    heartbeatRef.current = true;

    async function sealHeartbeat() {
      if (!running) return;
      try {
        // Get latest block for this company to chain from
        const latest = await pb.collection('workflow_blocks').getList(1, 1, {
          filter: `company = "${company.id}"`,
          sort: '-block_number',
        });
        const prevBlock = latest.items[0];
        const blockNumber = (prevBlock?.block_number || 0) + 1;
        const previousHash = prevBlock?.block_hash || '0000000000000000';
        const timestamp = new Date().toISOString();
        const payload = {
          activity: 'chain_heartbeat',
          timestamp,
          block_number: blockNumber,
          network: company.blockchain_network || 'privi',
          company_name: company.company_name || '',
        };
        const hash = await computeBlockHash(blockNumber, previousHash, 'activity', company.id, payload, timestamp);
        const record = await pb.collection('workflow_blocks').create({
          company: company.id,
          source_type: 'activity',
          block_hash: hash,
          previous_hash: previousHash,
          block_number: blockNumber,
          data_payload: payload,
          status: 'confirmed',
        });
        if (running) {
          setBlocks(prev => [record, ...prev].slice(0, 300));
          setLatestBlock(record);
          setTimeout(() => { if (running) setLatestBlock(null); }, 2000);
        }
      } catch { /* silent — never interrupt the UI */ }
    }

    const iv = setInterval(sealHeartbeat, 5000);
    return () => { running = false; heartbeatRef.current = false; clearInterval(iv); };
  }, [company?.id]);

  async function resolveDeviceAlert(alertId, action) {
    setResolvingAlert(alertId);
    try {
      await pb.collection('device_alerts').update(alertId, {
        alert_status: action,
        resolved_at: new Date().toISOString(),
        resolved_by: company?.company_name || company?.email || 'user',
      });
      setDeviceAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch(e) { console.error(e); }
    setResolvingAlert(null);
  }

  const loginCount   = blocks.filter(b => ['company_login','company_logout'].includes(b.data_payload?.activity)).length;
  const machineCount = blocks.filter(b => b.source_type === 'machine').length;
  const scannerCount = blocks.filter(b => b.source_type === 'scanner').length;
  const saleCount    = blocks.filter(b => b.source_type === 'sale').length;
  const actCount     = blocks.filter(b => b.source_type === 'activity').length;
  const confirmed    = blocks.filter(b => b.status === 'confirmed').length;

  const filtered = (() => {
    if (filter === 'all')      return blocks;
    if (filter === 'login')    return blocks.filter(b => ['company_login','company_logout'].includes(b.data_payload?.activity));
    if (filter === 'activity') return blocks.filter(b => b.source_type === 'activity');
    if (['machine','scanner','sale'].includes(filter)) return blocks.filter(b => b.source_type === filter);
    if (['confirmed','pending'].includes(filter)) return blocks.filter(b => b.status === filter);
    return blocks;
  })();

  const FILTERS = [
    { val: 'all',       label: 'All',       count: blocks.length,  color: 'cyan' },
    { val: 'login',     label: 'Logins',    count: loginCount,     color: 'amber' },
    { val: 'machine',   label: 'Machines',  count: machineCount,   color: 'cyan' },
    { val: 'scanner',   label: 'Scanners',  count: scannerCount,   color: 'emerald' },
    { val: 'sale',      label: 'Sales',     count: saleCount,      color: 'yellow' },
    { val: 'activity',  label: 'Activity',  count: actCount,       color: 'violet' },
    { val: 'confirmed', label: 'Confirmed', count: confirmed,      color: 'green' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">

      {/* BNB Chain / Privi contract banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5 flex-wrap"
        style={{ background: 'linear-gradient(90deg,rgba(243,186,47,0.07) 0%,rgba(8,12,20,0) 100%)', border: '1px solid rgba(243,186,47,0.2)' }}>
        <span className="text-lg" aria-hidden="true">◆</span>
        <div className="flex-1 min-w-0">
          <div className="text-amber-400 text-xs font-bold uppercase tracking-widest">Privi Network · BNB Chain</div>
          <div className="text-gray-400 text-[11px] font-mono truncate">Contract: 0x901d2460c916e6dD8d3eb21007722731A172fA57</div>
        </div>
        <a href="https://bscscan.com/address/0x901d2460c916e6dD8d3eb21007722731A172fA57" target="_blank" rel="noopener noreferrer"
          className="text-amber-400 text-[11px] font-bold hover:text-amber-300 transition-colors flex-shrink-0">
          View on BscScan ↗
        </a>
      </div>

      {/* Globe + header hero */}
      <div className="mb-8 flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="6" height="10" rx="1.5"/><rect x="9" y="4" width="6" height="10" rx="1.5"/><rect x="16" y="9" width="6" height="7" rx="1.5"/>
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-white leading-none" style={{ fontFamily: "'Syne', sans-serif" }}>Ledger</h1>
              <p className="text-gray-500 text-xs mt-0.5">{company?.company_name || 'Your company'} · Every action sealed and chained</p>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-5">
            <StatCard label="Total"     value={blocks.length}   color="text-cyan-400"    border="border-cyan-500/25"    bg="bg-cyan-500/5"    glow="rgba(34,211,238,0.06)"   onClick={() => setFilter('all')} />
            <StatCard label="Logins"    value={loginCount}      color="text-amber-400"   border="border-amber-500/25"   bg="bg-amber-500/5"   glow="rgba(251,191,36,0.06)"   onClick={() => setFilter('login')} />
            <StatCard label="Machines"  value={machineCount}    color="text-cyan-300"    border="border-white/8"        bg="bg-white/2"                                       onClick={() => setFilter('machine')} />
            <StatCard label="Scanners"  value={scannerCount}    color="text-emerald-400" border="border-white/8"        bg="bg-white/2"                                       onClick={() => setFilter('scanner')} />
            <StatCard label="Sales"     value={saleCount}       color="text-yellow-400"  border="border-white/8"        bg="bg-white/2"                                       onClick={() => setFilter('sale')} />
            <StatCard label="Activity"  value={actCount}        color="text-violet-400"  border="border-violet-500/20" bg="bg-violet-500/4"                                   onClick={() => setFilter('activity')} />
          </div>
        </div>

        {/* Globe */}
        <div
          className="flex-shrink-0 rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(6,10,18,0.8)',
            border: '1px solid rgba(34,211,238,0.12)',
            boxShadow: '0 0 60px rgba(34,211,238,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 border-b border-white/[0.05]">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true" style={{ boxShadow: '0 0 8px rgba(34,211,238,0.8)' }} />
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Live Global Network
            </span>
            <span className="ml-auto text-[9px] text-gray-700 font-mono">PRIVI·NET</span>
          </div>
          <EarthGlobe width={340} height={300} />
        </div>
      </div>

      {/* Device Alerts Banner */}
      {deviceAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl overflow-hidden" style={{ border:'1px solid rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.04)' }}>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/5 transition-colors text-left"
            onClick={() => setAlertsOpen(v => !v)}
            aria-expanded={alertsOpen}
            aria-controls="device-alerts-panel"
          >
            <span className="text-base" aria-hidden="true">🚨</span>
            <span className="text-sm font-bold text-red-400" style={{ fontFamily:"'Syne',sans-serif" }}>
              {deviceAlerts.length} Active Device Alert{deviceAlerts.length !== 1 ? 's' : ''}
            </span>
            <span className="ml-2 text-[10px] text-red-400/60 bg-red-500/10 px-2 py-0.5 rounded-full font-mono">
              {deviceAlerts.filter(a => a.issue_severity === 'critical').length} critical ·{' '}
              {deviceAlerts.filter(a => a.issue_severity === 'high').length} high
            </span>
            <div className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" aria-hidden="true" style={{ boxShadow:'0 0 6px rgba(239,68,68,0.8)' }} />
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"
              className={`shrink-0 transition-transform ${alertsOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {alertsOpen && (
            <div id="device-alerts-panel" className="px-4 pb-4 space-y-2">
              {deviceAlerts.map(alert => (
                <div key={alert.id} className="rounded-xl px-4 py-3 flex items-start gap-3"
                  style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.18)' }}>
                  <span className="text-base shrink-0 mt-0.5" aria-hidden="true">
                    {alert.issue_severity === 'critical' ? '🔴' : '🟡'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[11px] font-black text-red-300 uppercase tracking-wider">{alert.issue_severity}</span>
                      <span className="text-[10px] font-mono text-gray-600">{alert.issue_code}</span>
                      <span className="text-[10px] text-cyan-500/60">·</span>
                      <span className="text-[10px] text-cyan-400/70">{alert.device_name || 'Device'}</span>
                      {alert.device_type && (
                        <span className="text-[9px] text-gray-700 bg-white/4 border border-white/8 px-1.5 py-0.5 rounded-md capitalize">{alert.device_type}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-snug">{alert.issue_message}</p>
                    <p className="text-[10px] text-gray-700 mt-1">
                      Flagged {alert.created ? new Date(alert.created).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                    <button
                      onClick={() => resolveDeviceAlert(alert.id, 'resolved')}
                      disabled={resolvingAlert === alert.id}
                      className="text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40"
                      style={{ background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)', color:'#34d399' }}
                      aria-label={`Resolve alert for ${alert.device_name}`}
                    >
                      {resolvingAlert === alert.id ? '…' : '✓ Resolve'}
                    </button>
                    <button
                      onClick={() => resolveDeviceAlert(alert.id, 'dismissed')}
                      disabled={resolvingAlert === alert.id}
                      className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40"
                      style={{ background:'rgba(107,114,128,0.08)', border:'1px solid rgba(107,114,128,0.18)', color:'#6b7280' }}
                      aria-label={`Dismiss alert for ${alert.device_name}`}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live Chain Pulse + Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <LiveChainPulse blocks={blocks} latestBlock={latestBlock} />
        <ChainHealth blocks={blocks} company={company} />
      </div>

      {/* Filter tab strip */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-2xl overflow-x-auto scrollbar-hide"
        role="group"
        aria-label="Filter blocks"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {FILTERS.map(({ val, label, count }) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            aria-pressed={filter === val}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
              filter === val
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/5 border border-transparent'
            }`}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {label}
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${filter === val ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-gray-600'}`}
            >
              {count}
            </span>
          </button>
        ))}
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className="ml-auto flex-shrink-0 text-xs px-2 py-1.5 text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap gap-4 mb-5 text-[10px] text-gray-600">
        {[
          { dot: 'bg-amber-400',   label: 'Login / Logout',    glow: 'rgba(251,191,36,0.5)' },
          { dot: 'bg-cyan-400',    label: 'Machine data',      glow: 'rgba(34,211,238,0.5)' },
          { dot: 'bg-emerald-400', label: 'Scanner data',      glow: 'rgba(52,211,153,0.5)' },
          { dot: 'bg-yellow-400',  label: 'Sale / POS',        glow: 'rgba(234,179,8,0.5)' },
          { dot: 'bg-violet-400',  label: 'Platform activity', glow: 'rgba(167,139,250,0.5)' },
        ].map(({ dot, label, glow }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${dot}`} style={{ boxShadow: `0 0 6px ${glow}` }} aria-hidden="true" />
            {label}
          </div>
        ))}
        <div className="ml-auto text-gray-700 flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M15 3h6v6M10 14L21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>
          </svg>
          Click any block to inspect
        </div>
      </div>

      {/* Chain */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="flex gap-0 items-stretch">
              <div className="flex flex-col items-center w-10 flex-shrink-0">
                <div className="mt-5 w-4 h-4 rounded-full bg-white/10 flex-shrink-0" />
                <div className="flex-1 w-px mt-1 bg-white/5 min-h-[80px]" />
              </div>
              <div className="flex-1 mb-4 ml-3 border border-white/5 rounded-2xl shimmer h-24" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border border-white/5 rounded-3xl" style={{ background: 'rgba(255,255,255,0.01)' }}>
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)' }}
            aria-hidden="true"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="6" height="10" rx="1.5"/><rect x="9" y="4" width="6" height="10" rx="1.5"/><rect x="16" y="9" width="6" height="7" rx="1.5"/>
            </svg>
          </div>
          <div className="text-gray-400 font-bold mb-1">No blocks match this filter</div>
          <div className="text-gray-600 text-sm mb-4">Try a different filter or submit your first block</div>
          <button
            onClick={() => setFilter('all')}
            className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/60 px-4 py-2 rounded-xl transition-all"
          >
            Show all blocks
          </button>
        </div>
      ) : (
        <div className="relative" role="list" aria-label="Blockchain ledger">
          <GenesisBlock />
          {filtered.map((b, i) => (
            <div key={b.id} role="listitem">
              <ChainBlock
                block={b}
                idx={i}
                total={filtered.length}
                isLast={i === filtered.length - 1}
                onSelect={setSelectedBlock}
              />
            </div>
          ))}
          <div className="flex gap-0 items-center mt-1 ml-10 pl-3">
            <div className="h-px flex-1 bg-gradient-to-r from-white/8 to-transparent" aria-hidden="true" />
            <span className="text-[9px] text-gray-800 uppercase tracking-widest ml-2 font-mono">chain tip</span>
          </div>
        </div>
      )}

      {/* Block detail modal */}
      {selectedBlock && (
        <BlockModal block={selectedBlock} onClose={() => setSelectedBlock(null)} />
      )}
    </div>
  );
}
