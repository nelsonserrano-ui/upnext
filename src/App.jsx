import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0]

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

function timeToMinutes(t) {
  if (!t) return 9999
  const m = t.match(/(\d+)(?::(\d+))?\s*(am|pm)/i)
  if (!m) return 9999
  let h = parseInt(m[1]), min = parseInt(m[2] || 0)
  if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12
  if (m[3].toLowerCase() === 'am' && h === 12) h = 0
  return h * 60 + min
}

function parseInput(raw) {
  let title = raw
  let scheduled_time = null
  let priority = 'normal'
  let bucket = 'today'
  let scheduled_date = todayStr()

  const timeMatch = raw.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)
  if (timeMatch) { scheduled_time = timeMatch[1].toUpperCase(); title = title.replace(timeMatch[0], '') }

  if (/\btomorrow\b/i.test(raw)) {
    const d = new Date(); d.setDate(d.getDate() + 1)
    scheduled_date = d.toISOString().split('T')[0]
    title = title.replace(/\btomorrow\b/gi, '')
  } else if (/\btoday\b/i.test(raw)) {
    title = title.replace(/\btoday\b/gi, '')
  }

  if (/\bASAP\b/i.test(raw) || /!!/.test(raw)) {
    priority = 'now'; title = title.replace(/\bASAP\b/gi, '').replace(/!!/g, '')
  } else if (/~/.test(raw)) {
    priority = 'later'; bucket = 'backlog'; title = title.replace(/~/g, '')
  }

  title = title.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
  return { title, scheduled_time, scheduled_date, priority, bucket, status: 'open' }
}

function getNextAction(tasks) {
  const open = tasks.filter(t => t.status === 'open')
  const byPriority = (arr) => arr.sort((a, b) => timeToMinutes(a.scheduled_time) - timeToMinutes(b.scheduled_time))
  return (
    byPriority(open.filter(t => t.priority === 'now'))[0] ||
    byPriority(open.filter(t => t.bucket === 'carryover'))[0] ||
    byPriority(open.filter(t => t.bucket === 'today'))[0] ||
    open.filter(t => t.bucket === 'backlog')[0] ||
    null
  )
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + .08)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + .35)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(.12, ctx.currentTime + .04)
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .55)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + .6)
  } catch(e) {}
}

function playReminder() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, .15, .3].forEach(delay => {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 523
      gain.gain.setValueAtTime(0, ctx.currentTime + delay)
      gain.gain.linearRampToValueAtTime(.08, ctx.currentTime + delay + .03)
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + delay + .25)
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + .3)
    })
  } catch(e) {}
}

const DOPAMINE = [
  'Nice. 🎯', "Let's go. ⚡", 'Boom. 💥', 'Thank God 😮‍💨',
  'Finally. 🙌', 'One down. 💪', 'Crushed it. 🔥', 'Clean. ✨',
  'Next! 🚀', 'Done done. ✅', 'Smooth. 😎', 'Yes. 👊',
  'Gone. 💨', 'Like butter. 🧈', 'Momentum. 🌊', 'Easy. 😤',
]

const GRADIENTS = [
  'linear-gradient(135deg,rgba(255,150,0,.9),rgba(255,80,0,.75))',
  'linear-gradient(135deg,rgba(0,200,255,.9),rgba(110,80,255,.85))',
  'linear-gradient(135deg,rgba(180,0,255,.9),rgba(255,0,140,.75))',
  'linear-gradient(135deg,rgba(0,255,120,.85),rgba(0,180,255,.8))',
  'linear-gradient(135deg,rgba(255,60,120,.9),rgba(255,160,0,.8))',
]

/* ══════════════════════════════════════════
   STYLES
══════════════════════════════════════════ */
const s = {
  panel: {
    background: 'var(--panel)', border: '1px solid rgba(255,255,255,.09)',
    borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(10px)',
  },
  chip: (v) => ({
    borderRadius: 999, padding: '7px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    background: v === 'primary' ? 'rgba(0,200,255,.15)' : v === 'danger' ? 'rgba(255,80,80,.12)' : v === 'success' ? 'rgba(0,220,100,.15)' : 'rgba(255,255,255,.06)',
    border: `1px solid ${v === 'primary' ? 'rgba(0,200,255,.3)' : v === 'danger' ? 'rgba(255,80,80,.28)' : v === 'success' ? 'rgba(0,220,100,.3)' : 'rgba(255,255,255,.10)'}`,
    color: v === 'primary' ? 'rgba(0,220,255,.9)' : v === 'danger' ? 'rgba(255,120,100,.9)' : v === 'success' ? 'rgba(80,255,140,.9)' : 'var(--muted)',
    transition: 'all .12s',
  }),
  mini: {
    width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.09)', color: 'var(--muted)', fontSize: 15,
    display: 'grid', placeItems: 'center', cursor: 'pointer',
  },
  tag: {
    fontSize: 11, padding: '2px 8px', borderRadius: 999,
    border: '1px solid rgba(255,255,255,.10)', background: 'rgba(255,255,255,.05)', color: 'var(--muted2)',
  },
  input: {
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)',
    borderRadius: 11, padding: '10px 14px', color: 'var(--text)',
    fontSize: 14, outline: 'none', width: '100%',
  },
  col: {
    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 16, padding: 16, minHeight: 200,
  },
}

/* ══════════════════════════════════════════
   MODAL SHELL
══════════════════════════════════════════ */
function Modal({ onClose, children, width = 500 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.72)',backdropFilter:'blur(10px)',zIndex:400,display:'grid',placeItems:'center',padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.panel, width:`min(${width}px,100%)`, padding:28, animation:'slideDown .2s ease', maxHeight:'92vh', overflowY:'auto' }}>
        {children}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   DOPAMINE OVERLAY
══════════════════════════════════════════ */
function DopamineOverlay({ phrase }) {
  if (!phrase) return null
  return (
    <div className="dopamine-overlay">
      <div className="dopamine-phrase">{phrase}</div>
    </div>
  )
}

/* ══════════════════════════════════════════
   REMINDER TOAST
══════════════════════════════════════════ */
function ReminderToast({ reminder, onDone, onSnooze, onDismiss }) {
  return (
    <div style={{ position:'fixed',bottom:24,right:24,zIndex:500,width:320,...s.panel,padding:18,animation:'toastIn .25s ease',borderColor:'rgba(255,180,0,.3)' }}>
      <div style={{ fontSize:11,color:'rgba(255,200,80,.8)',fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:.8 }}>⏰ Reminder</div>
      <div style={{ fontSize:14,fontWeight:600,marginBottom:12 }}>{reminder.title}</div>
      <div style={{ display:'flex',gap:8 }}>
        <button style={s.chip('success')} onClick={onDone}>✓ Done</button>
        <button style={s.chip()} onClick={() => onSnooze(5)}>Snooze 5m</button>
        <button style={s.chip()} onClick={() => onSnooze(15)}>15m</button>
        <button style={s.chip('danger')} onClick={onDismiss}>✕</button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   EMPTY STATE
══════════════════════════════════════════ */
function EmptyState({ icon, title, sub, actions }) {
  return (
    <div style={{ textAlign:'center', padding:'36px 20px', color:'var(--muted2)' }}>
      <div style={{ fontSize:38,marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:16,fontWeight:700,color:'var(--text)',marginBottom:6 }}>{title}</div>
      {sub && <p style={{ fontSize:13,marginBottom:18,maxWidth:300,margin:'0 auto 18px' }}>{sub}</p>}
      {actions && <div style={{ display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap' }}>{actions}</div>}
    </div>
  )
}

/* ══════════════════════════════════════════
   WELCOME BACK MODAL
══════════════════════════════════════════ */
function WelcomeBackModal({ tasks, clients, onClose, onFocus, onMarkDone }) {
  const [expanded, setExpanded] = useState(false)

  const carryover = tasks.filter(t => t.bucket === 'carryover' && t.status === 'open')
  const allOpen = tasks.filter(t => t.status === 'open')
  const urgent = allOpen.filter(t => t.priority === 'now')

  // global next action
  const nextAction = getNextAction(allOpen)
  const nextClient = clients.find(c => c.id === nextAction?.client_id)

  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:20,fontWeight:800,marginBottom:4 }}>Welcome back 👋</div>
        <div style={{ fontSize:13,color:'var(--muted2)' }}>While you were away, here's what changed:</div>
      </div>

      {/* Next Action */}
      {nextAction && (
        <div style={{ background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.12)',borderRadius:14,padding:16,marginBottom:12 }}>
          <div style={{ fontSize:11,color:'rgba(255,200,80,.8)',fontWeight:700,textTransform:'uppercase',letterSpacing:.8,marginBottom:10 }}>
            ⭐ Next Action
          </div>
          <div style={{ fontSize:16,fontWeight:700,marginBottom:6 }}>{nextAction.title}</div>
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14 }}>
            {nextClient && <span style={s.tag}>{nextClient.emoji} {nextClient.name}</span>}
            {nextAction.bucket === 'carryover' && <span style={{ ...s.tag, borderColor:'rgba(255,150,0,.3)', color:'rgba(255,180,80,.9)' }}>carryover</span>}
            {nextAction.priority === 'now' && <span style={{ ...s.tag, borderColor:'rgba(255,60,60,.3)', color:'rgba(255,120,100,.9)' }}>urgent</span>}
          </div>
          <div style={{ display:'flex',gap:8 }}>
            <button style={s.chip('success')} onClick={() => { onMarkDone(nextAction.id); onClose() }}>✓ Mark done</button>
            <button style={s.chip('primary')} onClick={() => { onFocus(nextAction); onClose() }}>▶ Focus</button>
          </div>
        </div>
      )}

      {/* Summary rows */}
      <div style={{ display:'flex',flexDirection:'column',gap:1,marginBottom:16 }}>
        {carryover.length > 0 && (
          <div onClick={() => setExpanded(e => e === 'carry' ? null : 'carry')}
            style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'rgba(255,255,255,.03)',borderRadius:10,cursor:'pointer' }}>
            <span style={{ fontSize:13 }}>⏰ {carryover.length} task{carryover.length!==1?'s':''} carried over</span>
            <span style={{ color:'var(--muted2)',fontSize:12 }}>{expanded==='carry'?'▲':'▶'}</span>
          </div>
        )}
        {expanded === 'carry' && carryover.slice(0,3).map(t => (
          <div key={t.id} style={{ padding:'9px 14px',background:'rgba(255,255,255,.02)',borderRadius:8,fontSize:13,color:'var(--muted)' }}>
            — {t.title}
          </div>
        ))}
        {urgent.length > 0 && (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'rgba(255,255,255,.03)',borderRadius:10 }}>
            <span style={{ fontSize:13 }}>⚡ {urgent.length} urgent task{urgent.length!==1?'s':''}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display:'flex',gap:10,justifyContent:'space-between' }}>
        <button style={s.chip()} onClick={onClose}>Dismiss</button>
        <button onClick={() => { onFocus(nextAction); onClose() }}
          style={{ flex:1,padding:'11px',borderRadius:12,background:'linear-gradient(90deg,rgba(0,200,255,.25),rgba(140,80,255,.25))',border:'1px solid rgba(140,80,255,.3)',color:'var(--text)',fontWeight:700,fontSize:13,cursor:'pointer' }}>
          Start with Next Action →
        </button>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════
   FOCUS MODE
══════════════════════════════════════════ */
function FocusMode({ task, client, onDone, onQuit }) {
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [paused, setPaused] = useState(false)
  const pct = (timeLeft / (25 * 60)) * 100
  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  useEffect(() => {
    if (paused) return
    const iv = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(iv)
  }, [paused])

  return (
    <div style={{ position:'fixed',inset:0,background:'#04060C',zIndex:600,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:32,animation:'focusFade .3s ease' }}>
      <div style={{ fontSize:12,color:'var(--muted2)',textTransform:'uppercase',letterSpacing:1.5,fontWeight:600 }}>Focus Mode</div>

      {client && (
        <div style={{ display:'flex',alignItems:'center',gap:8,color:'var(--muted)' }}>
          <span>{client.emoji}</span>
          <span style={{ fontSize:14 }}>{client.name}</span>
        </div>
      )}

      <div style={{ fontSize:26,fontWeight:800,textAlign:'center',maxWidth:400,lineHeight:1.3 }}>{task.title}</div>

      {/* Timer ring */}
      <div style={{ position:'relative',width:160,height:160 }}>
        <svg width="160" height="160" style={{ transform:'rotate(-90deg)' }}>
          <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="8" />
          <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(0,200,255,.7)" strokeWidth="8"
            strokeDasharray={`${2*Math.PI*70}`}
            strokeDashoffset={`${2*Math.PI*70*(1-pct/100)}`}
            strokeLinecap="round" style={{ transition:'stroke-dashoffset 1s linear' }} />
        </svg>
        <div style={{ position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:36,fontWeight:800,letterSpacing:-1 }}>
          {fmt(timeLeft)}
        </div>
      </div>

      <div style={{ display:'flex',gap:12 }}>
        <button onClick={onDone} style={{ padding:'12px 28px',borderRadius:12,background:'rgba(0,220,100,.18)',border:'1px solid rgba(0,220,100,.3)',color:'rgba(100,255,160,.9)',fontWeight:700,fontSize:14,cursor:'pointer' }}>
          ✓ Done
        </button>
        <button onClick={() => setPaused(p => !p)} style={{ padding:'12px 20px',borderRadius:12,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.10)',color:'var(--muted)',fontWeight:600,fontSize:14,cursor:'pointer' }}>
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button onClick={onQuit} style={{ padding:'12px 20px',borderRadius:12,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',color:'var(--muted2)',fontWeight:600,fontSize:14,cursor:'pointer' }}>
          Quit
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   ADD CLIENT MODAL
══════════════════════════════════════════ */
function AddClientModal({ onClose, onAdd, initialName = '' }) {
  const [name, setName] = useState(initialName)
  const [emoji, setEmoji] = useState('👤')
  const [gradIdx, setGradIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const emojis = ['👤','🍊','🌊','⭐','🚀','💼','🎯','🏆','💡','🔥','🦁','🌿','🎨','💎','🎵']

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    const { data, error } = await supabase.from('clients').insert({
      name: name.trim(), emoji, color_gradient: GRADIENTS[gradIdx],
      slug: slugify(name.trim()), last_touched_at: new Date().toISOString()
    }).select().single()
    setLoading(false)
    if (!error) { onAdd(data); onClose() }
    else alert('Error: ' + error.message)
  }

  return (
    <Modal onClose={onClose} width={440}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22 }}>
        <div style={{ fontSize:18,fontWeight:800 }}>New Client</div>
        <button onClick={onClose} style={s.mini}>×</button>
      </div>
      <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:6,display:'block' }}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key==='Enter'&&submit()}
            placeholder="e.g. Acme Corp" autoFocus style={s.input} />
        </div>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:8,display:'block' }}>Icon</label>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
            {emojis.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ ...s.mini, fontSize:18, background: emoji===e?'rgba(255,255,255,.14)':'rgba(255,255,255,.04)', border:`1px solid ${emoji===e?'rgba(255,255,255,.28)':'rgba(255,255,255,.08)'}` }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:8,display:'block' }}>Color</label>
          <div style={{ display:'flex',gap:8 }}>
            {GRADIENTS.map((g, i) => (
              <button key={i} onClick={() => setGradIdx(i)}
                style={{ width:28,height:28,borderRadius:99,background:g,border:gradIdx===i?'3px solid rgba(255,255,255,.8)':'3px solid transparent',cursor:'pointer' }} />
            ))}
          </div>
        </div>
        <button onClick={submit} disabled={loading}
          style={{ padding:'12px',borderRadius:12,background:'rgba(0,200,255,.16)',border:'1px solid rgba(0,200,255,.3)',color:'var(--text)',fontWeight:700,fontSize:14,cursor:'pointer' }}>
          {loading ? 'Adding…' : '+ Add Client'}
        </button>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════
   TASK ROW
══════════════════════════════════════════ */
function TaskRow({ task, isNext, onToggle, onDelete, onClick, celebrating }) {
  const [hover, setHover] = useState(false)
  const done = task.status === 'done'

  const priorityColor = task.priority === 'now' ? 'rgba(255,100,80,.85)' : task.priority === 'later' ? 'rgba(180,180,255,.7)' : null

  return (
    <div
      className={celebrating ? 'celebrating' : ''}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => !done && onClick && onClick(task)}
      style={{
        display:'flex', alignItems:'center', gap:9, cursor: done?'default':'pointer',
        padding: isNext ? '10px 12px' : '8px 6px',
        marginBottom: isNext ? 8 : 0,
        borderRadius: isNext ? 11 : 0,
        background: isNext ? 'rgba(0,200,255,.06)' : hover&&!done ? 'rgba(255,255,255,.02)' : 'transparent',
        border: isNext ? '1px solid rgba(0,200,255,.18)' : '1px solid transparent',
        borderBottom: !isNext ? '1px solid rgba(255,255,255,.05)' : undefined,
        transition:'all .1s', userSelect:'none',
      }}>
      <button onClick={e => { e.stopPropagation(); onToggle(task) }}
        style={{ width:17,height:17,borderRadius:5,border:'1px solid rgba(255,255,255,.22)',background: done?'rgba(0,220,100,.65)':'transparent',flexShrink:0,cursor:'pointer',display:'grid',placeItems:'center',fontSize:10,color:'white' }}>
        {done ? '✓' : ''}
      </button>
      <span style={{ flex:1,fontSize:13,fontWeight:600,color: done?'var(--muted2)':'rgba(234,240,255,.9)',textDecoration: done?'line-through':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
        {task.title}
        {isNext && <span style={{ fontSize:9,marginLeft:7,color:'rgba(0,200,255,.7)',fontWeight:800,letterSpacing:.6 }}>NEXT</span>}
      </span>
      {priorityColor && !done && (
        <span style={{ width:6,height:6,borderRadius:99,background:priorityColor,flexShrink:0,boxShadow:`0 0 6px ${priorityColor}` }} />
      )}
      {task.scheduled_time && !done && (
        <span style={{ fontSize:10,padding:'2px 7px',borderRadius:999,background: isNext?'rgba(0,200,255,.10)':'rgba(255,80,0,.12)',border:`1px solid ${isNext?'rgba(0,200,255,.22)':'rgba(255,80,0,.22)'}`,color: isNext?'rgba(0,210,255,.85)':'rgba(255,160,80,.85)',flexShrink:0 }}>
          {task.scheduled_time}
        </span>
      )}
      {hover && !done && (
        <button onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          style={{ background:'rgba(255,60,60,.10)',border:'1px solid rgba(255,60,60,.2)',borderRadius:7,color:'rgba(255,110,100,.85)',fontSize:11,padding:'2px 7px',cursor:'pointer',flexShrink:0 }}>
          ✕
        </button>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   CLIENT CARD (home)
══════════════════════════════════════════ */
function ClientCard({ client, tasks, celebrating, onToggleTask, onDeleteTask, onAddTask, onDeleteClient, onTaskClick, onClick }) {
  const [adding, setAdding] = useState(false)
  const [quick, setQuick] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef()

  const clientTasks = tasks.filter(t => t.client_id === client.id && t.status === 'open')
    .sort((a, b) => {
      const pm = { now:0, normal:1, later:2 }
      if (pm[a.priority] !== pm[b.priority]) return pm[a.priority] - pm[b.priority]
      if (a.bucket !== b.bucket) {
        const bm = { carryover:0, today:1, backlog:2 }
        return bm[a.bucket] - bm[b.bucket]
      }
      return timeToMinutes(a.scheduled_time) - timeToMinutes(b.scheduled_time)
    })

  const nextAction = getNextAction(clientTasks)
  const topTasks = clientTasks.slice(0, 3)

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addQuick = async () => {
    if (!quick.trim()) return
    const parsed = parseInput(quick)
    await onAddTask({ ...parsed, client_id: client.id })
    setQuick(''); setAdding(false)
  }

  return (
    <article style={{ position:'relative',borderRadius:20,padding:2,background:client.color_gradient,boxShadow:'0 12px 40px rgba(0,0,0,.5)',cursor:'pointer' }}
      onClick={onClick}>
      <div style={{ borderRadius:18,background:'rgba(7,8,14,.94)',padding:20,height:'100%',display:'flex',flexDirection:'column',gap:12 }}>
        {/* header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ fontWeight:800,fontSize:15,display:'flex',alignItems:'center',gap:8 }}>
            <span style={{ fontSize:22 }}>{client.emoji}</span>
            <div>
              <div>{client.name}</div>
              <div style={{ fontSize:11,color:'var(--muted2)',fontWeight:400 }}>@{client.slug}</div>
            </div>
          </div>
          <div ref={menuRef} style={{ display:'flex',gap:5 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setAdding(a => !a)} style={s.mini} title="Add task">＋</button>
            <button onClick={() => setMenuOpen(m => !m)} style={s.mini} title="More">⋯</button>
            {menuOpen && (
              <div style={{ position:'absolute',top:52,right:16,background:'#0c0f1e',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:6,zIndex:200,minWidth:160,boxShadow:'0 20px 50px rgba(0,0,0,.8)' }}>
                <button onClick={() => { onDeleteClient(client.id); setMenuOpen(false) }}
                  style={{ display:'block',width:'100%',textAlign:'left',padding:'9px 12px',borderRadius:8,color:'rgba(255,100,100,.9)',fontSize:13,cursor:'pointer' }}>
                  🗑 Delete Client
                </button>
              </div>
            )}
          </div>
        </div>

        {/* quick add */}
        {adding && (
          <div style={{ display:'flex',gap:8 }} onClick={e => e.stopPropagation()}>
            <input value={quick} onChange={e => setQuick(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter') addQuick(); if(e.key==='Escape') setAdding(false) }}
              placeholder="Add task…" autoFocus style={{ flex:1,...s.input,padding:'8px 12px',fontSize:13 }} />
            <button onClick={addQuick} style={{ ...s.mini,background:'rgba(0,200,255,.12)',border:'1px solid rgba(0,200,255,.25)' }}>✓</button>
          </div>
        )}

        {/* top tasks */}
        <div style={{ flex:1 }} onClick={e => e.stopPropagation()}>
          {topTasks.length === 0
            ? <p style={{ color:'var(--muted2)',fontSize:12,padding:'4px 2px' }}>No tasks — hit + to add</p>
            : topTasks.map(t => (
                <TaskRow key={t.id} task={t} isNext={t.id === nextAction?.id}
                  celebrating={celebrating === t.id}
                  onToggle={onToggleTask} onDelete={onDeleteTask} onClick={onTaskClick} />
              ))
          }
          {clientTasks.length > 3 && (
            <div style={{ fontSize:12,color:'var(--muted2)',padding:'6px 4px' }}>+{clientTasks.length-3} more</div>
          )}
        </div>

        {/* next action footer */}
        {nextAction && (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',borderRadius:11,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',alignItems:'center',gap:8,minWidth:0 }}>
              <span style={{ fontSize:14 }}>⭐</span>
              <span style={{ fontSize:12,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                <strong style={{ color:'var(--text)' }}>{nextAction.title}</strong>
              </span>
            </div>
            <span style={{ fontSize:11,padding:'2px 8px',borderRadius:99,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.09)',color:'var(--muted2)',flexShrink:0 }}>Auto</span>
          </div>
        )}

        {!nextAction && clientTasks.length === 0 && (
          <div style={{ textAlign:'center',padding:'4px 0' }}>
            <span style={{ fontSize:12,color:'rgba(0,220,100,.6)' }}>✓ All clear</span>
          </div>
        )}
      </div>
    </article>
  )
}

/* ══════════════════════════════════════════
   BRAIN DUMP INPUT
══════════════════════════════════════════ */
function BrainDumpInput({ clients, onAddTask, onCreateClient, defaultClientId }) {
  const [input, setInput] = useState('')
  const [clientId, setClientId] = useState(defaultClientId || '')
  const [mention, setMention] = useState(null)
  const [results, setResults] = useState([])
  const [highlight, setHighlight] = useState(0)
  const [newName, setNewName] = useState(null)
  const inputRef = useRef()

  useEffect(() => { setClientId(defaultClientId || '') }, [defaultClientId])

  const handleChange = (e) => {
    const val = e.target.value
    setInput(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx !== -1 && (atIdx === 0 || val[atIdx-1] === ' ')) {
      const query = val.slice(atIdx + 1).split(' ')[0]
      const matches = clients.filter(c => (c.slug||'').startsWith(query.toLowerCase()) || c.name.toLowerCase().startsWith(query.toLowerCase()))
      setMention({ query, startPos: atIdx }); setResults(matches); setHighlight(0)
      setNewName(query.length > 1 ? query : null)
    } else { setMention(null); setResults([]); setNewName(null) }
  }

  const selectClient = (c) => {
    const before = input.slice(0, mention.startPos)
    const after = input.slice(mention.startPos + 1).replace(/^\S*\s?/, '')
    setInput(before + after); setClientId(c.id)
    setMention(null); setResults([]); setNewName(null); inputRef.current?.focus()
  }

  const createAndSelect = async () => {
    if (!newName?.trim()) return
    const nc = await onCreateClient(newName.trim())
    if (nc) selectClient(nc)
  }

  const handleKeyDown = (e) => {
    if (mention && (results.length > 0 || newName)) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h+1, results.length)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h-1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (highlight < results.length) selectClient(results[highlight])
        else if (newName) createAndSelect()
        return
      }
      if (e.key === 'Escape') { setMention(null); setResults([]) }
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
  }

  const handleAdd = async () => {
    const parsed = parseInput(input)
    if (!parsed.title) return
    await onAddTask({ ...parsed, client_id: clientId || null })
    setInput(''); setMention(null); setResults([])
  }

  const exactMatch = results.find(c => c.name.toLowerCase() === newName?.toLowerCase())

  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.09)',borderRadius:10,padding:'9px 12px' }}>
          <span style={{ opacity:.6,fontSize:14 }}>👤</span>
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            style={{ background:'transparent',border:'none',outline:'none',color:'var(--muted)',fontSize:13,cursor:'pointer',maxWidth:130 }}>
            <option value="">No client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div style={{ flex:1,display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',borderRadius:10,padding:'10px 14px',minWidth:180 }}>
          <span style={{ opacity:.5 }}>✦</span>
          <input ref={inputRef} value={input} onChange={handleChange} onKeyDown={handleKeyDown}
            placeholder="'Call Tom at 4pm' · '@client task' · 'Send invoice ASAP'"
            style={{ flex:1,border:'none',outline:'none',background:'transparent',color:'var(--text)',fontSize:13 }} />
        </div>
        <button onClick={handleAdd}
          style={{ padding:'10px 22px',borderRadius:10,background:'linear-gradient(90deg,rgba(0,200,255,.2),rgba(130,80,255,.2))',border:'1px solid rgba(130,80,255,.3)',color:'var(--text)',fontWeight:700,fontSize:13,cursor:'pointer',whiteSpace:'nowrap' }}>
          Add Task
        </button>
      </div>

      {/* @mention dropdown */}
      {mention && (results.length > 0 || (newName && !exactMatch)) && (
        <div style={{ position:'absolute',top:'calc(100% + 6px)',left:0,background:'#0c0f1e',border:'1px solid rgba(255,255,255,.14)',borderRadius:12,padding:6,zIndex:300,minWidth:220,boxShadow:'0 20px 50px rgba(0,0,0,.8)',animation:'slideDown .15s ease' }}>
          {results.map((c, i) => (
            <div key={c.id} onClick={() => selectClient(c)}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,background: highlight===i?'rgba(255,255,255,.08)':'transparent',cursor:'pointer' }}>
              <span style={{ fontSize:16 }}>{c.emoji}</span>
              <div>
                <div style={{ fontSize:13 }}>{c.name}</div>
                <div style={{ fontSize:11,color:'var(--muted2)' }}>@{c.slug}</div>
              </div>
            </div>
          ))}
          {newName && !exactMatch && (
            <div onClick={createAndSelect}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,background: highlight===results.length?'rgba(0,200,255,.08)':'transparent',cursor:'pointer',borderTop: results.length?'1px solid rgba(255,255,255,.07)':'none',marginTop: results.length?4:0 }}>
              <span style={{ fontSize:16 }}>＋</span>
              <span style={{ fontSize:13,color:'rgba(0,210,255,.9)' }}>Create "{newName}"</span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop:10,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
        <span style={{ fontSize:11,color:'var(--muted2)' }}>Quick:</span>
        {['today','tomorrow','ASAP','!!','~','3pm'].map(k => (
          <span key={k} onClick={() => { setInput(p => p+(p&&!p.endsWith(' ')?' ':'')+k); inputRef.current?.focus() }}
            style={{ fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',color:'var(--muted2)',cursor:'pointer' }}>
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   CLIENT DETAIL PAGE
══════════════════════════════════════════ */
function ClientDetailPage({ client, tasks, celebrating, onBack, onToggleTask, onDeleteTask, onAddTask }) {
  const [doneOpen, setDoneOpen] = useState(false)
  const [addingBucket, setAddingBucket] = useState(null)
  const [quick, setQuick] = useState('')

  const clientTasks = tasks.filter(t => t.client_id === client.id)
  const byBucket = (b) => clientTasks.filter(t => t.bucket === b && t.status === 'open')
    .sort((a,b) => timeToMinutes(a.scheduled_time) - timeToMinutes(b.scheduled_time))
  const done = clientTasks.filter(t => t.status === 'done')
  const nextAction = getNextAction(clientTasks.filter(t => t.status === 'open'))

  const addQuick = async (bucket) => {
    if (!quick.trim()) return
    const parsed = parseInput(quick)
    await onAddTask({ ...parsed, client_id: client.id, bucket })
    setQuick(''); setAddingBucket(null)
  }

  const BucketCol = ({ label, bucket, color, tasks: colTasks }) => (
    <div style={s.col}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <div style={{ width:8,height:8,borderRadius:99,background:color }} />
          <span style={{ fontSize:13,fontWeight:700 }}>{label}</span>
          <span style={{ fontSize:11,color:'var(--muted2)',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.09)',borderRadius:99,padding:'1px 7px' }}>{colTasks.length}</span>
        </div>
        <button onClick={() => { setAddingBucket(bucket); setQuick('') }} style={s.mini} title="Add task">＋</button>
      </div>

      {addingBucket === bucket && (
        <div style={{ display:'flex',gap:6,marginBottom:10,animation:'slideDown .15s ease' }}>
          <input value={quick} onChange={e => setQuick(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter') addQuick(bucket); if(e.key==='Escape') setAddingBucket(null) }}
            placeholder="Task…" autoFocus style={{ flex:1,...s.input,padding:'7px 10px',fontSize:12 }} />
          <button onClick={() => addQuick(bucket)} style={{ ...s.mini,background:'rgba(0,200,255,.12)',border:'1px solid rgba(0,200,255,.25)',fontSize:13 }}>✓</button>
        </div>
      )}

      {colTasks.length === 0
        ? <p style={{ fontSize:12,color:'var(--muted2)',textAlign:'center',padding:'20px 0' }}>
            {bucket === 'carryover' ? 'No carryover. Nice work.' : bucket === 'today' ? 'Nothing here yet.' : 'Backlog is empty.'}
          </p>
        : colTasks.map(t => (
            <TaskRow key={t.id} task={t} isNext={t.id === nextAction?.id}
              celebrating={celebrating === t.id}
              onToggle={onToggleTask} onDelete={onDeleteTask} />
          ))
      }
    </div>
  )

  return (
    <div>
      {/* back + header */}
      <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:28 }}>
        <button onClick={onBack} style={{ ...s.mini,fontSize:18 }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex',alignItems:'center',gap:12 }}>
            <span style={{ fontSize:28 }}>{client.emoji}</span>
            <div>
              <div style={{ fontSize:22,fontWeight:800 }}>{client.name}</div>
              <div style={{ fontSize:13,color:'var(--muted2)' }}>@{client.slug} · {clientTasks.filter(t=>t.status==='open').length} open</div>
            </div>
          </div>
        </div>
      </div>

      {/* Next Action bar */}
      {nextAction && (
        <div style={{ ...s.panel,padding:'14px 20px',marginBottom:24,display:'flex',alignItems:'center',gap:16,borderColor:'rgba(255,200,80,.18)',background:'rgba(255,200,80,.04)' }}>
          <span style={{ fontSize:20 }}>⭐</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11,color:'rgba(255,200,80,.7)',fontWeight:700,textTransform:'uppercase',letterSpacing:.8,marginBottom:2 }}>Next Action</div>
            <div style={{ fontSize:15,fontWeight:700 }}>{nextAction.title}</div>
          </div>
          {nextAction.scheduled_time && (
            <span style={{ ...s.tag,borderColor:'rgba(255,80,0,.25)',color:'rgba(255,160,80,.85)',fontSize:12 }}>🔥 {nextAction.scheduled_time}</span>
          )}
        </div>
      )}

      {/* Brain dump on client page */}
      <div style={{ ...s.panel,padding:'16px 20px',marginBottom:28 }}>
        <BrainDumpInput clients={[client]} onAddTask={onAddTask} onCreateClient={async () => null} defaultClientId={client.id} />
      </div>

      {/* 3-column task view */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:20 }}>
        <BucketCol label="Carryover" bucket="carryover" color="rgba(255,150,0,.8)"  tasks={byBucket('carryover')} />
        <BucketCol label="Today"     bucket="today"     color="rgba(0,200,255,.8)"  tasks={byBucket('today')} />
        <BucketCol label="Backlog"   bucket="backlog"   color="rgba(160,160,255,.7)" tasks={byBucket('backlog')} />
      </div>

      {/* Done (collapsed) */}
      <div style={{ ...s.panel,padding:16 }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer' }} onClick={() => setDoneOpen(d => !d)}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <div style={{ width:8,height:8,borderRadius:99,background:'rgba(0,220,100,.7)' }} />
            <span style={{ fontSize:13,fontWeight:700 }}>Done</span>
            <span style={{ fontSize:11,color:'var(--muted2)',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.09)',borderRadius:99,padding:'1px 7px' }}>{done.length}</span>
          </div>
          <span style={{ color:'var(--muted2)',fontSize:13 }}>{doneOpen ? '▲' : '▶'}</span>
        </div>
        {doneOpen && done.length === 0 && (
          <p style={{ fontSize:12,color:'var(--muted2)',textAlign:'center',padding:'16px 0',marginTop:10 }}>No completed tasks yet.</p>
        )}
        {doneOpen && done.map(t => (
          <TaskRow key={t.id} task={t} celebrating={false} onToggle={onToggleTask} onDelete={onDeleteTask} />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   TOP NAV
══════════════════════════════════════════ */
function TopNav({ view, onNav, onAddClient, search, onSearch, taskCount }) {
  const navs = ['home','clients','today']
  const labels = { home:'Home', clients:'Clients', today:'Today' }

  return (
    <header style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:20,marginBottom:36,padding:'0 0 20px',borderBottom:'1px solid rgba(255,255,255,.07)' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
        <div style={{ width:32,height:32,borderRadius:10,background:'linear-gradient(135deg,rgba(255,130,0,.9),rgba(0,200,255,.7),rgba(180,0,255,.8))' }} />
        <div>
          <div style={{ fontWeight:800,fontSize:16,letterSpacing:-.3 }}>UpNext</div>
          <div style={{ fontSize:11,color:'var(--muted2)' }}>Client task cockpit</div>
        </div>
      </div>

      <nav style={{ display:'flex',alignItems:'center',gap:2 }}>
        {navs.map(n => (
          <button key={n} onClick={() => onNav(n)}
            style={{ fontWeight:600,fontSize:13,padding:'8px 16px',borderRadius:999,cursor:'pointer',transition:'all .15s',
              color: view===n?'var(--text)':'var(--muted2)',
              background: view===n?'rgba(255,255,255,.08)':'transparent',
              border: `1px solid ${view===n?'rgba(255,255,255,.14)':'transparent'}` }}>
            {labels[n]}
          </button>
        ))}
      </nav>

      <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:260 }}>
        <div style={{ flex:1,display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.09)',borderRadius:999,padding:'8px 14px' }}>
          <span style={{ opacity:.4,fontSize:13 }}>🔍</span>
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search tasks…"
            style={{ border:0,outline:0,background:'transparent',color:'var(--text)',fontSize:13,width:'100%' }} />
        </div>
        <button onClick={onAddClient} title="Add Client"
          style={{ ...s.mini,width:36,height:36,borderRadius:999,fontSize:20 }}>＋</button>
        <div style={{ width:36,height:36,borderRadius:999,background:'linear-gradient(135deg,rgba(255,255,255,.3),rgba(255,255,255,.08))',border:'1px solid rgba(255,255,255,.12)',display:'grid',placeItems:'center',fontSize:14,fontWeight:700 }}>
          N
        </div>
      </div>
    </header>
  )
}

/* ══════════════════════════════════════════
   APP
══════════════════════════════════════════ */
export default function App() {
  const [clients, setClients] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('home')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [showWelcomeBack, setShowWelcomeBack] = useState(false)
  const [focusTask, setFocusTask] = useState(null)
  const [celebrating, setCelebrating] = useState(null)
  const [dopamine, setDopamine] = useState(null)
  const [reminder, setReminder] = useState(null)
  const [search, setSearch] = useState('')

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at'),
      supabase.from('tasks').select('*').order('sort_order').order('created_at', { ascending: false }),
    ])
    if (c) setClients(c)
    if (t) setTasks(t)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  /* ── Welcome back trigger (15 min inactive) ── */
  useEffect(() => {
    if (loading) return
    const last = localStorage.getItem('upnext_last_active')
    if (last) {
      const diff = Date.now() - parseInt(last)
      const hasCarryover = tasks.some(t => t.bucket === 'carryover' && t.status === 'open')
      if (diff > 15 * 60 * 1000 && hasCarryover) setShowWelcomeBack(true)
    }
    // update last active every 60s
    localStorage.setItem('upnext_last_active', Date.now().toString())
    const iv = setInterval(() => localStorage.setItem('upnext_last_active', Date.now().toString()), 60000)
    return () => clearInterval(iv)
  }, [loading, tasks])

  /* ── Reminder checker ── */
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const due = tasks.find(t => {
        if (!t.remind_at || t.status === 'done') return false
        const rt = new Date(t.remind_at)
        return rt <= now && rt > new Date(now - 2 * 60000)
      })
      if (due && (!reminder || reminder.id !== due.id)) {
        setReminder(due); playReminder()
      }
    }
    const iv = setInterval(check, 30000)
    check()
    return () => clearInterval(iv)
  }, [tasks, reminder])

  /* ── Completion dopamine ── */
  const triggerDopamine = () => {
    const phrase = DOPAMINE[Math.floor(Math.random() * DOPAMINE.length)]
    setDopamine(phrase)
    setTimeout(() => setDopamine(null), 1500)
  }

  /* ── Auto-carryover: if scheduled_date < today and still open ── */
  useEffect(() => {
    if (loading) return
    const stale = tasks.filter(t => t.status === 'open' && t.bucket === 'today' && t.scheduled_date && t.scheduled_date < todayStr())
    if (stale.length === 0) return
    const ids = stale.map(t => t.id)
    supabase.from('tasks').update({ bucket: 'carryover' }).in('id', ids).then(() => {
      setTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, bucket: 'carryover' } : t))
    })
  }, [loading])

  /* ── Task actions ── */
  const handleToggleTask = async (task) => {
    const isDone = task.status === 'done'
    const newStatus = isDone ? 'open' : 'done'
    await supabase.from('tasks').update({ status: newStatus, completed_at: isDone ? null : new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
    if (!isDone) {
      setCelebrating(task.id)
      playChime()
      triggerDopamine()
      setTimeout(() => setCelebrating(null), 800)
    }
  }

  const handleDeleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const handleAddTask = async (payload) => {
    const { data, error } = await supabase.from('tasks').insert(payload).select().single()
    if (!error) setTasks(prev => [data, ...prev])
    else alert('Error: ' + error.message)
  }

  const handleAddClient = (c) => setClients(prev => [...prev, c])

  const handleCreateClientFromMention = async (name) => {
    const { data, error } = await supabase.from('clients').insert({
      name, emoji: '👤', color_gradient: GRADIENTS[clients.length % GRADIENTS.length],
      slug: slugify(name), last_touched_at: new Date().toISOString()
    }).select().single()
    if (!error) { setClients(prev => [...prev, data]); return data }
    return null
  }

  const handleDeleteClient = async (id) => {
    if (!confirm('Delete this client and all their tasks?')) return
    await supabase.from('tasks').delete().eq('client_id', id)
    await supabase.from('clients').delete().eq('id', id)
    setClients(prev => prev.filter(c => c.id !== id))
    setTasks(prev => prev.filter(t => t.client_id !== id))
    if (selectedClientId === id) { setSelectedClientId(null); setView('home') }
  }

  /* ── Computed ── */
  const activeSortedClients = clients
    .filter(c => {
      const ct = tasks.filter(t => t.client_id === c.id && t.status === 'open')
      return ct.length > 0
    })
    .sort((a, b) => {
      const na = getNextAction(tasks.filter(t => t.client_id === a.id && t.status === 'open'))
      const nb = getNextAction(tasks.filter(t => t.client_id === b.id && t.status === 'open'))
      if (!na && !nb) return 0; if (!na) return 1; if (!nb) return -1
      const pm = { now:0, normal:1, later:2 }
      if (pm[na.priority] !== pm[nb.priority]) return pm[na.priority] - pm[nb.priority]
      const bm = { carryover:0, today:1, backlog:2 }
      return bm[na.bucket] - bm[nb.bucket]
    })

  const selectedClient = clients.find(c => c.id === selectedClientId)
  const globalNext = getNextAction(tasks.filter(t => t.status === 'open'))

  const filteredTasks = search
    ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : []

  if (loading) return (
    <div style={{ display:'grid',placeItems:'center',height:'100vh',background:'var(--bg0)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:28,fontWeight:800,marginBottom:10 }}>UpNext</div>
        <div style={{ color:'var(--muted2)',fontSize:14,animation:'pulse 1.2s ease infinite' }}>Loading your workspace…</div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth:1280,margin:'0 auto',padding:'28px 28px 80px' }}>
      {/* overlays */}
      <DopamineOverlay phrase={dopamine} />

      {focusTask && (
        <FocusMode
          task={focusTask}
          client={clients.find(c => c.id === focusTask.client_id)}
          onDone={() => { handleToggleTask(focusTask); setFocusTask(null) }}
          onQuit={() => setFocusTask(null)}
        />
      )}

      {showWelcomeBack && (
        <WelcomeBackModal
          tasks={tasks} clients={clients}
          onClose={() => setShowWelcomeBack(false)}
          onFocus={(t) => { setFocusTask(t); setShowWelcomeBack(false) }}
          onMarkDone={(id) => { const t = tasks.find(x => x.id === id); if(t) handleToggleTask(t) }}
        />
      )}

      {showAddClient && (
        <AddClientModal initialName={newClientName}
          onClose={() => { setShowAddClient(false); setNewClientName('') }}
          onAdd={handleAddClient} />
      )}

      {reminder && (
        <ReminderToast reminder={reminder}
          onDone={() => { const t = tasks.find(x => x.id === reminder.id); if(t) handleToggleTask(t); setReminder(null) }}
          onSnooze={(mins) => {
            const newTime = new Date(Date.now() + mins * 60000).toISOString()
            supabase.from('tasks').update({ remind_at: newTime }).eq('id', reminder.id)
            setTasks(prev => prev.map(t => t.id === reminder.id ? { ...t, remind_at: newTime } : t))
            setReminder(null)
          }}
          onDismiss={() => setReminder(null)} />
      )}

      <TopNav view={selectedClientId ? 'client' : view} onNav={(v) => { setView(v); setSelectedClientId(null) }}
        onAddClient={() => setShowAddClient(true)} search={search} onSearch={setSearch}
        taskCount={tasks.filter(t => t.status === 'open').length} />

      {/* ── Search results ── */}
      {search && (
        <div style={{ ...s.panel,padding:24,marginBottom:32 }}>
          <div style={{ fontWeight:700,marginBottom:16,fontSize:15 }}>Results for "{search}"</div>
          {filteredTasks.length === 0
            ? <p style={{ color:'var(--muted2)',fontSize:14 }}>No tasks found.</p>
            : filteredTasks.map(t => {
                const client = clients.find(c => c.id === t.client_id)
                return (
                  <div key={t.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                    <span style={{ flex:1,fontSize:14,color: t.status==='done'?'var(--muted2)':'var(--text)',textDecoration: t.status==='done'?'line-through':'none' }}>{t.title}</span>
                    {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                    <span style={s.tag}>{t.bucket}</span>
                  </div>
                )
              })
          }
        </div>
      )}

      {/* ── CLIENT DETAIL ── */}
      {!search && selectedClientId && selectedClient && (
        <ClientDetailPage
          client={selectedClient}
          tasks={tasks}
          celebrating={celebrating}
          onBack={() => { setSelectedClientId(null) }}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onAddTask={handleAddTask}
        />
      )}

      {/* ── HOME ── */}
      {!search && !selectedClientId && view === 'home' && (
        <>
          {/* Brain Dump */}
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 16px',borderRadius:999,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',fontWeight:800,fontSize:13 }}>
              🧠 Brain Dump Zone
            </div>
            {globalNext && (
              <button onClick={() => setFocusTask(globalNext)}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:999,background:'rgba(0,200,255,.12)',border:'1px solid rgba(0,200,255,.25)',color:'rgba(0,210,255,.9)',fontWeight:700,fontSize:13,cursor:'pointer' }}>
                ▶ Focus Now
              </button>
            )}
          </div>

          <div style={{ ...s.panel,padding:'18px 22px',marginBottom:48 }}>
            <BrainDumpInput clients={clients} onAddTask={handleAddTask} onCreateClient={handleCreateClientFromMention} />
          </div>

          {/* Active Clients */}
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
            <div style={{ display:'flex',alignItems:'center',gap:10,padding:'8px 16px',borderRadius:999,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',fontWeight:800,fontSize:13 }}>
              🏢 Active Clients
            </div>
            <button onClick={() => setShowAddClient(true)} style={{ ...s.chip('primary'),fontSize:13 }}>+ New Client</button>
          </div>

          <div style={{ ...s.panel,padding:22,background:'rgba(8,10,18,.9)' }}>
            {activeSortedClients.length === 0 ? (
              <EmptyState icon="🏢" title="No active clients yet"
                sub="Add a client and assign tasks to get started."
                actions={[
                  <button key="a" style={{ ...s.chip('primary'),padding:'9px 18px' }} onClick={() => setShowAddClient(true)}>Add a client</button>
                ]} />
            ) : (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:18 }}>
                {activeSortedClients.map(c => (
                  <ClientCard key={c.id} client={c} tasks={tasks} celebrating={celebrating}
                    onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask}
                    onAddTask={handleAddTask} onDeleteClient={handleDeleteClient}
                    onTaskClick={() => {}}
                    onClick={() => { setSelectedClientId(c.id) }}
                  />
                ))}
              </div>
            )}
            <div style={{ display:'flex',justifyContent:'center',marginTop:20 }}>
              <button onClick={() => setView('clients')}
                style={{ ...s.chip(),padding:'9px 22px',fontSize:13 }}>See all clients →</button>
            </div>
          </div>
        </>
      )}

      {/* ── CLIENTS ── */}
      {!search && !selectedClientId && view === 'clients' && (
        <div style={{ ...s.panel,padding:28 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24 }}>
            <div style={{ fontWeight:800,fontSize:18 }}>All Clients</div>
            <button onClick={() => setShowAddClient(true)} style={{ ...s.chip('primary'),padding:'9px 18px',fontSize:13 }}>+ New Client</button>
          </div>
          {clients.length === 0 ? (
            <EmptyState icon="👥" title="No clients yet"
              sub="Add your first client to get started."
              actions={[<button key="a" style={{ ...s.chip('primary'),padding:'9px 18px' }} onClick={() => setShowAddClient(true)}>Add Client</button>]} />
          ) : (
            <div style={{ display:'flex',flexDirection:'column',gap:2 }}>
              {clients.map(c => {
                const ct = tasks.filter(t => t.client_id === c.id && t.status === 'open')
                return (
                  <div key={c.id} onClick={() => { setSelectedClientId(c.id) }}
                    style={{ display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:12,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.07)',cursor:'pointer',transition:'background .1s' }}>
                    <span style={{ fontSize:22 }}>{c.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700,fontSize:14 }}>{c.name}</div>
                      <div style={{ fontSize:12,color:'var(--muted2)' }}>@{c.slug} · {ct.length} open</div>
                    </div>
                    <span style={{ color:'var(--muted2)',fontSize:13 }}>→</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TODAY (placeholder) ── */}
      {!search && !selectedClientId && view === 'today' && (
        <div style={{ ...s.panel,padding:40,textAlign:'center' }}>
          <div style={{ fontSize:40,marginBottom:16 }}>📅</div>
          <div style={{ fontWeight:800,fontSize:20,marginBottom:10 }}>Today View</div>
          <p style={{ color:'var(--muted2)',fontSize:14,maxWidth:320,margin:'0 auto' }}>
            A focused view of all your tasks due today across every client. Coming soon.
          </p>
        </div>
      )}
    </div>
  )
}
