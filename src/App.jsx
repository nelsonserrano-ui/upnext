import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'

/* ─── tiny helpers ─────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0]

function parseInput(raw) {
  let title = raw
  let scheduled_time = null
  let priority = 'normal'
  let scheduled_date = today()

  const timeMatch = raw.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)
  if (timeMatch) { scheduled_time = timeMatch[1].toUpperCase(); title = title.replace(timeMatch[0], '') }

  if (/\btomorrow\b/i.test(raw)) {
    const d = new Date(); d.setDate(d.getDate() + 1)
    scheduled_date = d.toISOString().split('T')[0]
    title = title.replace(/\btomorrow\b/gi, '')
  } else if (/\btoday\b/i.test(raw)) {
    title = title.replace(/\btoday\b/gi, '')
  }

  if (/\bASAP\b/i.test(raw) || /!!/.test(raw)) { priority = 'asap'; title = title.replace(/\bASAP\b/gi, '').replace(/!!/g, '') }
  title = title.replace(/~/g, '').replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
  return { title, scheduled_time, scheduled_date, priority }
}

const CLIENT_GRADIENTS = [
  'linear-gradient(90deg,rgba(255,150,0,.95),rgba(255,80,0,.75),rgba(255,210,140,.90))',
  'linear-gradient(90deg,rgba(0,200,255,.95),rgba(0,255,170,.70),rgba(110,80,255,.92))',
  'linear-gradient(90deg,rgba(180,0,255,.95),rgba(255,0,140,.70),rgba(255,220,0,.80))',
  'linear-gradient(90deg,rgba(0,255,120,.90),rgba(0,180,255,.80),rgba(180,0,255,.70))',
  'linear-gradient(90deg,rgba(255,60,120,.95),rgba(255,160,0,.80),rgba(255,220,120,.85))',
]

/* ─── styled atoms (inline-style components) ─────────── */
const s = {
  shell: { maxWidth: 1320, margin: '0 auto', padding: '34px 28px 90px' },
  panel: {
    background: 'var(--panel)', border: '1px solid rgba(255,255,255,.10)',
    borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-soft)',
    backdropFilter: 'blur(12px)',
  },
  pill: {
    fontSize: 12, padding: '6px 10px', borderRadius: 999,
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.10)',
    color: 'var(--muted)', display: 'inline-block',
  },
  chip: (variant) => ({
    borderRadius: 999, padding: '8px 10px',
    background: 'rgba(255,255,255,.05)',
    border: `1px solid ${variant === 'primary' ? 'rgba(0,200,255,.35)' : variant === 'danger' ? 'rgba(255,120,0,.35)' : 'rgba(255,255,255,.10)'}`,
    color: 'var(--muted)', fontSize: 12, fontWeight: 650, cursor: 'pointer',
    transition: 'all .12s ease',
  }),
  iconbtn: {
    width: 40, height: 40, borderRadius: 999,
    border: '1px solid rgba(255,255,255,.10)', background: 'rgba(255,255,255,.05)',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
    color: 'var(--muted)', fontSize: 18,
  },
  mini: {
    width: 34, height: 34, borderRadius: 10,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)',
    color: 'var(--muted)', fontSize: 16, cursor: 'pointer',
    display: 'grid', placeItems: 'center',
  },
  tag: {
    fontSize: 11, padding: '3px 8px', borderRadius: 999,
    border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)',
    color: 'var(--muted)', flexShrink: 0,
  },
}

/* ─── Modal ────────────────────────────────────────── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',backdropFilter:'blur(6px)',zIndex:100,display:'grid',placeItems:'center',padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.panel, width:'min(480px,100%)', padding:28, animation:'slideDown .2s ease' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:700 }}>{title}</h3>
          <button onClick={onClose} style={{ ...s.mini, fontSize:20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ─── AddClientModal ───────────────────────────────── */
function AddClientModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👤')
  const [gradIdx, setGradIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    const { data, error } = await supabase.from('clients').insert({
      name: name.trim(), emoji, color_gradient: CLIENT_GRADIENTS[gradIdx]
    }).select().single()
    setLoading(false)
    if (!error) { onAdd(data); onClose() }
    else alert('Error: ' + error.message)
  }

  const emojis = ['👤','🍊','🌊','⭐','🚀','💼','🎯','🏆','💡','🔥']

  return (
    <Modal title="Add Client" onClose={onClose}>
      <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:6,display:'block' }}>Client Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. Acme Corp"
            style={{ width:'100%',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:'10px 14px',color:'var(--text)',fontSize:14,outline:'none' }} />
        </div>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:8,display:'block' }}>Emoji</label>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {emojis.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ ...s.mini, background: emoji===e?'rgba(255,255,255,.15)':'rgba(255,255,255,.05)', border:`1px solid ${emoji===e?'rgba(255,255,255,.3)':'rgba(255,255,255,.10)'}`, fontSize:20 }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:8,display:'block' }}>Color</label>
          <div style={{ display:'flex',gap:8 }}>
            {CLIENT_GRADIENTS.map((g,i) => (
              <button key={i} onClick={() => setGradIdx(i)}
                style={{ width:28,height:28,borderRadius:99,background:g,border:gradIdx===i?'2px solid white':'2px solid transparent',cursor:'pointer' }} />
            ))}
          </div>
        </div>
        <button onClick={submit} disabled={loading}
          style={{ marginTop:4,padding:'12px 0',borderRadius:12,background:'rgba(0,200,255,.18)',border:'1px solid rgba(0,200,255,.35)',color:'var(--text)',fontWeight:700,fontSize:14,cursor:'pointer' }}>
          {loading ? 'Adding…' : 'Add Client'}
        </button>
      </div>
    </Modal>
  )
}

/* ─── TaskRow ──────────────────────────────────────── */
function TaskRow({ task, onToggle, onDelete }) {
  const [hover, setHover] = useState(false)
  const isHot = task.scheduled_time != null
  const done = task.status === 'done'

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 4px',borderBottom:'1px solid rgba(255,255,255,.05)',transition:'background .12s' }}>
      <button onClick={() => onToggle(task)}
        style={{ width:18,height:18,borderRadius:6,border:'1px solid rgba(255,255,255,.25)',background: done?'rgba(0,200,255,.7)':'transparent',flexShrink:0,cursor:'pointer',display:'grid',placeItems:'center',fontSize:11,color:'white' }}>
        {done ? '✓' : ''}
      </button>
      <span style={{ flex:1,fontSize:13,fontWeight:600,color: done?'var(--muted2)':'rgba(234,240,255,.90)', textDecoration: done?'line-through':'none', whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
        {task.title}
      </span>
      {isHot && !done && (
        <span style={{ fontSize:11,padding:'3px 7px',borderRadius:999,background:'rgba(255,80,0,.18)',border:'1px solid rgba(255,80,0,.3)',color:'rgba(255,160,80,.9)',flexShrink:0 }}>
          🔥 {task.scheduled_time}
        </span>
      )}
      {!isHot && !done && (
        <span style={{ fontSize:11,padding:'3px 7px',borderRadius:999,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',color:'var(--muted2)',flexShrink:0 }}>
          No time
        </span>
      )}
      {hover && (
        <button onClick={() => onDelete(task.id)}
          style={{ background:'rgba(255,60,60,.15)',border:'1px solid rgba(255,60,60,.25)',borderRadius:8,color:'rgba(255,100,100,.9)',fontSize:11,padding:'3px 7px',cursor:'pointer',flexShrink:0 }}>
          ✕
        </button>
      )}
    </div>
  )
}

/* ─── ClientCard ───────────────────────────────────── */
function ClientCard({ client, tasks, onToggleTask, onDeleteTask, onAddTask, onDeleteClient }) {
  const [adding, setAdding] = useState(false)
  const [quickInput, setQuickInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const clientTasks = tasks.filter(t => t.client_id === client.id && t.status !== 'done')
  const nextAction = clientTasks.find(t => t.scheduled_time) || clientTasks[0]

  const addQuick = async () => {
    if (!quickInput.trim()) return
    const parsed = parseInput(quickInput)
    await onAddTask({ ...parsed, client_id: client.id })
    setQuickInput('')
    setAdding(false)
  }

  return (
    <article style={{ position:'relative', borderRadius:'var(--radius-xl)', padding:2, background: client.color_gradient, boxShadow:'var(--shadow)' }}>
      <div style={{ borderRadius: 'calc(var(--radius-xl) - 2px)', background:'rgba(8,10,18,.92)', padding:20, height:'100%', display:'flex', flexDirection:'column', gap:14 }}>
        {/* header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:15,display:'flex',alignItems:'center',gap:8 }}>
            {client.emoji} {client.name}
            <span style={{ fontSize:11,padding:'3px 8px',borderRadius:999,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.12)',color:'var(--muted)',fontFamily:'var(--font-body)',fontWeight:600 }}>
              {clientTasks.length} task{clientTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display:'flex',gap:6,position:'relative' }}>
            <button onClick={() => setAdding(a => !a)} style={s.mini} title="Add task">＋</button>
            <button onClick={() => setMenuOpen(m => !m)} style={s.mini} title="More">⋯</button>
            {menuOpen && (
              <div style={{ position:'absolute',top:40,right:0,background:'#0d1020',border:'1px solid rgba(255,255,255,.12)',borderRadius:14,padding:8,zIndex:10,minWidth:160,boxShadow:'var(--shadow)' }}>
                <button onClick={() => { onDeleteClient(client.id); setMenuOpen(false) }}
                  style={{ display:'block',width:'100%',textAlign:'left',padding:'9px 12px',borderRadius:8,background:'transparent',border:'none',color:'rgba(255,100,100,.9)',fontSize:13,cursor:'pointer' }}>
                  🗑 Delete Client
                </button>
              </div>
            )}
          </div>
        </div>

        {/* quick add row */}
        {adding && (
          <div style={{ display:'flex',gap:8,animation:'slideDown .15s ease' }}>
            <input value={quickInput} onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addQuick()}
              placeholder="Task title… (Enter to add)"
              autoFocus
              style={{ flex:1,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.14)',borderRadius:10,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none' }} />
            <button onClick={addQuick} style={{ ...s.mini, background:'rgba(0,200,255,.15)',border:'1px solid rgba(0,200,255,.3)' }}>✓</button>
          </div>
        )}

        {/* tasks */}
        <div style={{ flex:1 }}>
          {clientTasks.length === 0 && (
            <p style={{ color:'var(--muted2)',fontSize:13,padding:'8px 4px' }}>No tasks yet — hit + to add one</p>
          )}
          {clientTasks.slice(0,5).map(t => (
            <TaskRow key={t.id} task={t} onToggle={onToggleTask} onDelete={onDeleteTask} />
          ))}
          {clientTasks.length > 5 && (
            <p style={{ fontSize:12,color:'var(--muted2)',marginTop:8 }}>+{clientTasks.length - 5} more</p>
          )}
        </div>

        {/* next action footer */}
        {nextAction && (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderRadius:12,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.07)' }}>
            <div style={{ display:'flex',alignItems:'center',gap:8,minWidth:0 }}>
              <span style={{ width:8,height:8,borderRadius:99,background: client.color_gradient,flexShrink:0,boxShadow:'0 0 8px rgba(255,255,255,.4)' }} />
              <span style={{ fontSize:12,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                Next: <strong style={{ color:'var(--text)' }}>{nextAction.title}</strong>
              </span>
            </div>
            <span style={s.pill}>Auto</span>
          </div>
        )}
      </div>
    </article>
  )
}

/* ─── MissedRow ────────────────────────────────────── */
function MissedRow({ task, clients, onAction }) {
  const client = clients.find(c => c.id === task.client_id)
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:14,padding:12 }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0 }}>
        <div style={{ width:10,height:10,borderRadius:99,background:'rgba(255,150,0,.85)',flexShrink:0 }} />
        <span style={{ fontWeight:650,color:'rgba(234,240,255,.90)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontSize:14 }}>{task.title}</span>
        {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
      </div>
      <div style={{ display:'flex',gap:8,flexShrink:0 }}>
        <button style={s.chip()} onClick={() => onAction(task.id,'done')}>Done</button>
        <button style={s.chip('primary')} onClick={() => onAction(task.id,'today')}>Move to Today</button>
        <button style={s.chip('danger')} onClick={() => onAction(task.id,'backlog')}>Backlog</button>
      </div>
    </div>
  )
}

/* ─── App ──────────────────────────────────────────── */
export default function App() {
  const [clients, setClients] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [showAddClient, setShowAddClient] = useState(false)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [activeNav, setActiveNav] = useState('Today')
  const [search, setSearch] = useState('')

  /* fetch data */
  const loadData = useCallback(async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    ])
    if (c) setClients(c)
    if (t) setTasks(t)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  /* missed tasks = status=today but scheduled_date < today */
  const missedTasks = tasks.filter(t =>
    t.status === 'today' && t.scheduled_date < today()
  )

  /* today tasks */
  const todayTasks = tasks.filter(t =>
    t.status === 'today' && t.scheduled_date === today()
  )

  /* add task from brain dump */
  const handleAddTask = async () => {
    if (!input.trim()) return
    const parsed = parseInput(input)
    const payload = {
      ...parsed,
      client_id: selectedClientId || null,
      status: 'today',
    }
    const { data, error } = await supabase.from('tasks').insert(payload).select().single()
    if (!error) { setTasks(prev => [data, ...prev]); setInput('') }
    else alert('Error: ' + error.message)
  }

  const handleAddTaskForClient = async (payload) => {
    const full = { ...payload, status: 'today' }
    const { data, error } = await supabase.from('tasks').insert(full).select().single()
    if (!error) setTasks(prev => [data, ...prev])
    else alert('Error: ' + error.message)
  }

  const handleToggleTask = async (task) => {
    const newStatus = task.status === 'done' ? 'today' : 'done'
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
  }

  const handleDeleteTask = async (id) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const handleMissedAction = async (id, newStatus) => {
    await supabase.from('tasks').update({ status: newStatus, scheduled_date: today() }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, scheduled_date: today() } : t))
  }

  const handleAddClient = (c) => setClients(prev => [...prev, c])

  const handleDeleteClient = async (id) => {
    if (!confirm('Delete this client and all their tasks?')) return
    await supabase.from('tasks').delete().eq('client_id', id)
    await supabase.from('clients').delete().eq('id', id)
    setClients(prev => prev.filter(c => c.id !== id))
    setTasks(prev => prev.filter(t => t.client_id !== id))
  }

  /* search filter for tasks */
  const filteredTasks = search
    ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    : tasks

  const showWelcome = missedTasks.length > 0 && !welcomeDismissed

  const navItems = ['Today', 'Backlog', 'Clients', 'All Tasks']

  if (loading) return (
    <div style={{ display:'grid',placeItems:'center',height:'100vh',color:'var(--muted2)',fontSize:14 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)',fontSize:24,fontWeight:800,marginBottom:10 }}>Command Center</div>
        <div style={{ animation:'pulse 1.2s ease infinite' }}>Loading your workspace…</div>
      </div>
    </div>
  )

  return (
    <div style={s.shell}>
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} onAdd={handleAddClient} />}

      {/* ── Topbar ── */}
      <header style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:22,marginBottom:40 }}>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <div style={{ width:34,height:34,borderRadius:12,background:'radial-gradient(circle at 30% 30%,rgba(255,130,0,.95),rgba(0,200,255,.7),rgba(180,0,255,.75))',boxShadow:'0 0 0 1px rgba(255,255,255,.08) inset' }} />
          <span style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:17,letterSpacing:.2 }}>Command Center</span>
          <span style={s.pill}>v1.0</span>
        </div>

        <nav style={{ display:'flex',alignItems:'center',gap:4 }}>
          {navItems.map(n => (
            <button key={n} onClick={() => setActiveNav(n)}
              style={{ fontFamily:'var(--font-body)',fontWeight:600,fontSize:14,padding:'10px 14px',borderRadius:999,cursor:'pointer',transition:'all .15s',
                color: activeNav===n ? 'var(--text)' : 'var(--muted2)',
                background: activeNav===n ? 'rgba(255,255,255,.07)' : 'transparent',
                border: `1px solid ${activeNav===n?'rgba(255,255,255,.14)':'transparent'}` }}>
              {n}
            </button>
          ))}
        </nav>

        <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:300 }}>
          <div style={{ flex:1,display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',borderRadius:999,padding:'10px 14px' }}>
            <span style={{ opacity:.5,fontSize:14 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              style={{ border:0,outline:0,background:'transparent',color:'var(--text)',fontSize:13,width:'100%' }} />
          </div>
          <button style={s.iconbtn} onClick={() => setShowAddClient(true)} title="Add client">＋</button>
          <div style={{ width:40,height:40,borderRadius:999,background:'radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),rgba(255,255,255,.08))',border:'1px solid rgba(255,255,255,.12)' }} />
        </div>
      </header>

      {/* ── Search results overlay ── */}
      {search && (
        <div style={{ ...s.panel, padding:24, marginBottom:40 }}>
          <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:16 }}>Search: "{search}"</h3>
          {filteredTasks.length === 0 ? (
            <p style={{ color:'var(--muted2)',fontSize:14 }}>No tasks found.</p>
          ) : filteredTasks.map(t => {
            const client = clients.find(c => c.id === t.client_id)
            return (
              <div key={t.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                <span style={{ flex:1,fontSize:14,color: t.status==='done'?'var(--muted2)':'var(--text)',textDecoration: t.status==='done'?'line-through':'none' }}>{t.title}</span>
                {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                <span style={{ ...s.tag }}>{t.status}</span>
                <span style={{ ...s.tag }}>{t.scheduled_date}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Welcome / Missed ── */}
      {!search && showWelcome && (
        <div style={{ display:'flex',justifyContent:'center',marginBottom:64 }}>
          <section style={{ ...s.panel, padding:'22px 22px 18px', width:'min(780px,100%)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute',inset:-2,background:'linear-gradient(90deg,rgba(255,160,0,.22),rgba(0,200,255,.18),rgba(190,0,255,.20))',filter:'blur(22px)',opacity:.55,pointerEvents:'none' }} />
            <div style={{ position:'relative' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
                <h2 style={{ fontFamily:'var(--font-display)',fontSize:18,fontWeight:700 }}>👋 Welcome back</h2>
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  <span style={{ color:'var(--muted2)',fontSize:13 }}>{missedTasks.length} missed task{missedTasks.length!==1?'s':''}</span>
                  <button onClick={() => setWelcomeDismissed(true)} style={{ ...s.chip(), fontSize:12 }}>Dismiss</button>
                </div>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
                {missedTasks.map(t => (
                  <MissedRow key={t.id} task={t} clients={clients} onAction={handleMissedAction} />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── TODAY view ── */}
      {!search && activeNav === 'Today' && (
        <>
          {/* Brain Dump */}
          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',margin:'0 0 18px' }}>
            <span style={{ display:'inline-flex',alignItems:'center',gap:10,padding:'10px 16px',borderRadius:999,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',fontFamily:'var(--font-display)',fontWeight:800,letterSpacing:.2,boxShadow:'0 10px 24px rgba(0,0,0,.35)' }}>
              🧠 Brain Dump Zone
            </span>
          </div>

          <section style={{ ...s.panel, padding:'20px 24px', marginBottom:64 }}>
            <div style={{ display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' }}>
              <div style={{ display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.09)',borderRadius:10,padding:'9px 12px' }}>
                <span style={{ opacity:.7,fontSize:13 }}>👤</span>
                <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                  style={{ background:'transparent',border:'none',outline:'none',color:'var(--muted)',fontSize:13,cursor:'pointer' }}>
                  <option value="">No client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </div>

              <div style={{ flex:1,display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',borderRadius:10,padding:'10px 14px',minWidth:240 }}>
                <span style={{ opacity:.7 }}>✦</span>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  placeholder="What's on your mind? Try: 'Call Tom at 4pm' or 'Fix homepage ASAP'"
                  style={{ flex:1,border:'none',outline:'none',background:'transparent',color:'var(--text)',fontSize:13 }} />
              </div>

              <button onClick={handleAddTask}
                style={{ padding:'10px 20px',borderRadius:10,background:'rgba(0,200,255,.18)',border:'1px solid rgba(0,200,255,.3)',color:'var(--text)',fontWeight:700,fontSize:13,cursor:'pointer',transition:'all .15s',fontFamily:'var(--font-body)' }}>
                Add Task
              </button>
            </div>

            <div style={{ marginTop:12,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
              <span style={{ fontSize:12,color:'var(--muted2)' }}>Quick:</span>
              {['today','tomorrow','ASAP','!!','4pm','~'].map(k => (
                <span key={k} onClick={() => setInput(p => p + ' ' + k)}
                  style={{ fontSize:11,padding:'4px 8px',borderRadius:6,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',color:'var(--muted)',cursor:'pointer' }}>
                  {k}
                </span>
              ))}
            </div>
          </section>

          {/* Today's standalone tasks (no client) */}
          {todayTasks.filter(t => !t.client_id).length > 0 && (
            <section style={{ ...s.panel, padding:24, marginBottom:40, background:'rgba(10,12,20,.85)' }}>
              <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:16,fontSize:16 }}>📋 General Tasks</h3>
              {todayTasks.filter(t => !t.client_id).map(t => (
                <TaskRow key={t.id} task={t} onToggle={handleToggleTask} onDelete={handleDeleteTask} />
              ))}
            </section>
          )}

          {/* Client Cards */}
          <div style={{ display:'flex',alignItems:'center',justifyContent:'center',margin:'0 0 18px' }}>
            <span style={{ display:'inline-flex',alignItems:'center',gap:10,padding:'10px 16px',borderRadius:999,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.12)',fontFamily:'var(--font-display)',fontWeight:800,letterSpacing:.2,boxShadow:'0 10px 24px rgba(0,0,0,.35)' }}>
              🏢 Active Clients
            </span>
          </div>

          <section style={{ ...s.panel, padding:24, background:'rgba(10,12,20,.85)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
              <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:16 }}>
                {clients.length} client{clients.length !== 1 ? 's' : ''}
              </h3>
              <button onClick={() => setShowAddClient(true)}
                style={{ ...s.chip('primary'), padding:'8px 14px', fontSize:13 }}>
                + Add Client
              </button>
            </div>

            {clients.length === 0 ? (
              <div style={{ textAlign:'center',padding:'40px 0',color:'var(--muted2)' }}>
                <div style={{ fontSize:32,marginBottom:12 }}>🏢</div>
                <p>No clients yet. Add your first one!</p>
              </div>
            ) : (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:20 }}>
                {clients.map(c => (
                  <ClientCard key={c.id} client={c} tasks={tasks}
                    onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask}
                    onAddTask={handleAddTaskForClient} onDeleteClient={handleDeleteClient} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ── BACKLOG view ── */}
      {!search && activeNav === 'Backlog' && (
        <section style={{ ...s.panel, padding:24 }}>
          <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:20,fontSize:16 }}>📦 Backlog</h3>
          {tasks.filter(t => t.status === 'backlog').length === 0 ? (
            <p style={{ color:'var(--muted2)',fontSize:14 }}>No tasks in the backlog. Nice!</p>
          ) : tasks.filter(t => t.status === 'backlog').map(t => {
            const client = clients.find(c => c.id === t.client_id)
            return (
              <div key={t.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                <span style={{ flex:1,fontSize:14 }}>{t.title}</span>
                {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                <button onClick={() => handleMissedAction(t.id,'today')} style={s.chip('primary')}>Move to Today</button>
                <button onClick={() => handleDeleteTask(t.id)} style={s.chip('danger')}>Delete</button>
              </div>
            )
          })}
        </section>
      )}

      {/* ── CLIENTS view ── */}
      {!search && activeNav === 'Clients' && (
        <section style={{ ...s.panel, padding:24 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24 }}>
            <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:16 }}>All Clients</h3>
            <button onClick={() => setShowAddClient(true)} style={{ ...s.chip('primary'), padding:'8px 14px', fontSize:13 }}>+ New Client</button>
          </div>
          {clients.length === 0 ? (
            <p style={{ color:'var(--muted2)',fontSize:14 }}>No clients yet.</p>
          ) : (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:20 }}>
              {clients.map(c => (
                <ClientCard key={c.id} client={c} tasks={tasks}
                  onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask}
                  onAddTask={handleAddTaskForClient} onDeleteClient={handleDeleteClient} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── ALL TASKS view ── */}
      {!search && activeNav === 'All Tasks' && (
        <section style={{ ...s.panel, padding:24 }}>
          <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:20,fontSize:16 }}>All Tasks</h3>
          {['today','backlog','done'].map(status => {
            const group = tasks.filter(t => t.status === status)
            if (group.length === 0) return null
            return (
              <div key={status} style={{ marginBottom:28 }}>
                <div style={{ fontSize:12,fontWeight:700,color:'var(--muted2)',textTransform:'uppercase',letterSpacing:1,marginBottom:10 }}>
                  {status} ({group.length})
                </div>
                {group.map(t => {
                  const client = clients.find(c => c.id === t.client_id)
                  return (
                    <div key={t.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)' }}>
                      <span style={{ flex:1,fontSize:14,color: t.status==='done'?'var(--muted2)':'var(--text)',textDecoration: t.status==='done'?'line-through':'none' }}>{t.title}</span>
                      {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                      <span style={{ ...s.tag }}>{t.scheduled_date}</span>
                      {t.scheduled_time && <span style={{ ...s.tag, borderColor:'rgba(255,80,0,.3)',color:'rgba(255,160,80,.9)' }}>🔥 {t.scheduled_time}</span>}
                      <button onClick={() => handleDeleteTask(t.id)} style={s.chip('danger')}>✕</button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
