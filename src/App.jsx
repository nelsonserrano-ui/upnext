import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'

/* ─── helpers ─────────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0]

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

  if (/\bASAP\b/i.test(raw) || /!!/.test(raw)) {
    priority = 'asap'
    title = title.replace(/\bASAP\b/gi, '').replace(/!!/g, '')
  }
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

const s = {
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
    transition: 'all .12s ease', fontFamily: 'var(--font-body)',
  }),
  mini: {
    width: 34, height: 34, borderRadius: 10,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.10)',
    color: 'var(--muted)', fontSize: 16, cursor: 'pointer',
    display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)',
  },
  tag: {
    fontSize: 11, padding: '3px 8px', borderRadius: 999,
    border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)',
    color: 'var(--muted)', flexShrink: 0,
  },
  input: {
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
    borderRadius: 10, padding: '10px 14px', color: 'var(--text)',
    fontSize: 14, outline: 'none', fontFamily: 'var(--font-body)', width: '100%',
  },
}

/* ─── Modal shell ─────────────────────────────────── */
function Modal({ onClose, children, width = 520 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',backdropFilter:'blur(8px)',zIndex:200,display:'grid',placeItems:'center',padding:20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.panel, width:`min(${width}px,100%)`, padding:28, animation:'slideDown .2s ease', maxHeight:'92vh', overflowY:'auto' }}>
        {children}
      </div>
    </div>
  )
}

/* ─── Task Detail Modal ───────────────────────────── */
function TaskDetailModal({ task, clients, onClose, onUpdate, onDelete }) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes || '')
  const [subtasks, setSubtasks] = useState([])
  const [newSub, setNewSub] = useState('')
  const [images, setImages] = useState(task.images || [])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  const client = clients.find(c => c.id === task.client_id)

  useEffect(() => {
    supabase.from('subtasks').select('*').eq('task_id', task.id).order('sort_order')
      .then(({ data }) => { if (data) setSubtasks(data) })
  }, [task.id])

  const save = async () => {
    setSaving(true)
    const { data } = await supabase.from('tasks')
      .update({ title, notes, images }).eq('id', task.id).select().single()
    if (data) onUpdate(data)
    setSaving(false)
  }

  const addSub = async () => {
    if (!newSub.trim()) return
    const { data } = await supabase.from('subtasks').insert({
      task_id: task.id, title: newSub.trim(), sort_order: subtasks.length
    }).select().single()
    if (data) { setSubtasks(p => [...p, data]); setNewSub('') }
  }

  const toggleSub = async (st) => {
    await supabase.from('subtasks').update({ completed: !st.completed }).eq('id', st.id)
    setSubtasks(p => p.map(s => s.id === st.id ? { ...s, completed: !s.completed } : s))
  }

  const deleteSub = async (id) => {
    await supabase.from('subtasks').delete().eq('id', id)
    setSubtasks(p => p.filter(s => s.id !== id))
  }

  const handleImage = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 1024 * 1024) { alert('Image must be under 1MB'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setImages(p => [...p, ev.target.result])
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const doneCount = subtasks.filter(s => s.completed).length

  return (
    <Modal onClose={() => { save(); onClose() }} width={560}>
      <div style={{ display:'flex',flexDirection:'column',gap:20 }}>
        {/* header */}
        <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11,color:'var(--muted2)',marginBottom:8,textTransform:'uppercase',letterSpacing:1 }}>Task</div>
            <input value={title} onChange={e => setTitle(e.target.value)}
              style={{ ...s.input, fontSize:17, fontWeight:700, fontFamily:'var(--font-display)' }} />
          </div>
          <button onClick={() => { save(); onClose() }} style={{ ...s.mini, marginTop:22 }}>×</button>
        </div>

        {/* meta */}
        <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
          {client && <span style={{ ...s.tag, fontSize:13 }}>{client.emoji} {client.name}</span>}
          {task.scheduled_time && <span style={{ ...s.tag, fontSize:13, borderColor:'rgba(255,80,0,.3)', color:'rgba(255,160,80,.9)' }}>🔥 {task.scheduled_time}</span>}
          <span style={{ ...s.tag, fontSize:13 }}>{task.scheduled_date}</span>
          <span style={{ ...s.tag, fontSize:13,
            background: task.status==='done'?'rgba(0,200,100,.12)':'rgba(255,255,255,.05)',
            borderColor: task.status==='done'?'rgba(0,200,100,.3)':'rgba(255,255,255,.12)',
            color: task.status==='done'?'rgba(100,255,160,.9)':'var(--muted)' }}>
            {task.status}
          </span>
        </div>

        {/* notes */}
        <div>
          <div style={{ fontSize:11,color:'var(--muted2)',marginBottom:8,textTransform:'uppercase',letterSpacing:1 }}>Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Add notes, links, context…"
            style={{ width:'100%',minHeight:90,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.10)',borderRadius:10,padding:'10px 14px',color:'var(--text)',fontSize:13,outline:'none',resize:'vertical',fontFamily:'var(--font-body)',lineHeight:1.65 }} />
        </div>

        {/* subtasks */}
        <div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
            <div style={{ fontSize:11,color:'var(--muted2)',textTransform:'uppercase',letterSpacing:1 }}>Subtasks</div>
            {subtasks.length > 0 && <span style={{ fontSize:11,color:'var(--muted2)' }}>{doneCount}/{subtasks.length}</span>}
          </div>
          {subtasks.length > 0 && (
            <div style={{ height:4,borderRadius:99,background:'rgba(255,255,255,.08)',marginBottom:10,overflow:'hidden' }}>
              <div style={{ height:'100%',borderRadius:99,background:'rgba(0,200,100,.6)',width:`${(doneCount/subtasks.length)*100}%`,transition:'width .3s ease' }} />
            </div>
          )}
          <div style={{ display:'flex',flexDirection:'column',gap:5,marginBottom:8 }}>
            {subtasks.map(st => (
              <div key={st.id} style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(255,255,255,.03)',borderRadius:8,border:'1px solid rgba(255,255,255,.06)' }}>
                <button onClick={() => toggleSub(st)}
                  style={{ width:16,height:16,borderRadius:4,border:'1px solid rgba(255,255,255,.25)',background: st.completed?'rgba(0,200,100,.7)':'transparent',flexShrink:0,cursor:'pointer',display:'grid',placeItems:'center',fontSize:10,color:'white' }}>
                  {st.completed ? '✓' : ''}
                </button>
                <span style={{ flex:1,fontSize:13,color: st.completed?'var(--muted2)':'var(--text)',textDecoration: st.completed?'line-through':'none' }}>{st.title}</span>
                <button onClick={() => deleteSub(st.id)} style={{ background:'none',border:'none',color:'var(--muted2)',cursor:'pointer',fontSize:16,padding:'0 2px',lineHeight:1 }}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display:'flex',gap:8 }}>
            <input value={newSub} onChange={e => setNewSub(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSub()}
              placeholder="Add subtask… (Enter)"
              style={{ flex:1,...s.input,padding:'8px 12px',fontSize:13 }} />
            <button onClick={addSub} style={{ ...s.mini,background:'rgba(0,200,255,.12)',border:'1px solid rgba(0,200,255,.25)' }}>＋</button>
          </div>
        </div>

        {/* images */}
        <div>
          <div style={{ fontSize:11,color:'var(--muted2)',marginBottom:8,textTransform:'uppercase',letterSpacing:1 }}>Attachments</div>
          {images.length > 0 && (
            <div style={{ display:'flex',gap:8,flexWrap:'wrap',marginBottom:10 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position:'relative' }}>
                  <img src={img} alt="" style={{ width:80,height:80,objectFit:'cover',borderRadius:8,border:'1px solid rgba(255,255,255,.12)',cursor:'pointer' }}
                    onClick={() => window.open(img)} />
                  <button onClick={() => setImages(p => p.filter((_,j) => j !== i))}
                    style={{ position:'absolute',top:-6,right:-6,width:18,height:18,borderRadius:99,background:'rgba(220,50,50,.9)',border:'none',color:'white',fontSize:11,cursor:'pointer',display:'grid',placeItems:'center',lineHeight:1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} style={{ display:'none' }} />
          <button onClick={() => fileRef.current.click()} style={{ ...s.chip(),padding:'8px 14px' }}>
            📎 Attach Image <span style={{ opacity:.5,marginLeft:4,fontSize:11 }}>max 1MB</span>
          </button>
        </div>

        {/* footer */}
        <div style={{ display:'flex',gap:10,justifyContent:'space-between',paddingTop:10,borderTop:'1px solid rgba(255,255,255,.07)' }}>
          <button onClick={() => { onDelete(task.id); onClose() }}
            style={{ ...s.chip('danger'), padding:'10px 16px', fontSize:13 }}>🗑 Delete</button>
          <button onClick={() => { save(); onClose() }} disabled={saving}
            style={{ ...s.chip('primary'), padding:'10px 24px', fontSize:13, color:'var(--text)' }}>
            {saving ? 'Saving…' : '✓ Save & Close'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Pomodoro Widget ─────────────────────────────── */
function PomodoroWidget({ tasks, clients, onClose }) {
  const [phase, setPhase] = useState('pick')
  const [selected, setSelected] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const [paused, setPaused] = useState(false)
  const [isBreak, setIsBreak] = useState(false)

  const available = tasks.filter(t => t.status !== 'done')

  useEffect(() => {
    if (phase !== 'running' || paused) return
    const iv = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (!isBreak) { setIsBreak(true); return 5 * 60 }
          const next = currentIdx + 1
          if (next >= selected.length) { setPhase('done'); return 0 }
          setCurrentIdx(next); setIsBreak(false); return 25 * 60
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [phase, paused, isBreak, currentIdx, selected.length])

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const pct = isBreak ? (timeLeft / (5 * 60)) * 100 : (timeLeft / (25 * 60)) * 100
  const currentTask = tasks.find(t => t.id === selected[currentIdx])

  const skip = () => {
    const next = currentIdx + 1
    if (next >= selected.length) { setPhase('done') }
    else { setCurrentIdx(next); setIsBreak(false); setTimeLeft(25 * 60) }
  }

  return (
    <div style={{ position:'fixed',bottom:24,right:24,zIndex:300,width:300,...s.panel,padding:20,animation:'slideDown .25s ease' }}>
      {phase === 'pick' && (
        <>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
            <span style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:15 }}>🍅 Focus Session</span>
            <button onClick={onClose} style={{ ...s.mini,width:26,height:26,fontSize:16 }}>×</button>
          </div>
          <p style={{ fontSize:12,color:'var(--muted2)',marginBottom:10 }}>Pick tasks to run through in order:</p>
          <div style={{ display:'flex',flexDirection:'column',gap:5,maxHeight:240,overflowY:'auto',marginBottom:12 }}>
            {available.length === 0 && <p style={{ color:'var(--muted2)',fontSize:13 }}>No tasks yet!</p>}
            {available.map(t => {
              const on = selected.includes(t.id)
              const client = clients.find(c => c.id === t.client_id)
              return (
                <div key={t.id} onClick={() => setSelected(p => on ? p.filter(x => x !== t.id) : [...p, t.id])}
                  style={{ display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,background: on?'rgba(0,200,255,.10)':'rgba(255,255,255,.03)',border:`1px solid ${on?'rgba(0,200,255,.25)':'rgba(255,255,255,.07)'}`,cursor:'pointer' }}>
                  <div style={{ width:14,height:14,borderRadius:4,border:'1px solid rgba(255,255,255,.25)',background: on?'rgba(0,200,255,.7)':'transparent',display:'grid',placeItems:'center',fontSize:9,color:'white',flexShrink:0 }}>{on?'✓':''}</div>
                  <span style={{ flex:1,fontSize:12 }}>{t.title}</span>
                  {client && <span style={{ fontSize:11,opacity:.5 }}>{client.emoji}</span>}
                </div>
              )
            })}
          </div>
          {selected.length > 0 && (
            <button onClick={() => { setPhase('running'); setTimeLeft(25 * 60) }}
              style={{ width:'100%',padding:'10px',borderRadius:10,background:'rgba(0,200,255,.18)',border:'1px solid rgba(0,200,255,.35)',color:'var(--text)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'var(--font-body)' }}>
              ▶ Start — {selected.length} task{selected.length !== 1 ? 's' : ''}
            </button>
          )}
        </>
      )}

      {phase === 'running' && (
        <>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
            <span style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:13,color: isBreak?'rgba(100,255,160,.9)':'var(--text)' }}>
              {isBreak ? '☕ Break' : '🍅 Focus'}
            </span>
            <div style={{ display:'flex',gap:6,alignItems:'center' }}>
              <span style={{ fontSize:11,color:'var(--muted2)' }}>{currentIdx + 1}/{selected.length}</span>
              <button onClick={onClose} style={{ ...s.mini,width:24,height:24,fontSize:14 }}>×</button>
            </div>
          </div>
          {currentTask && !isBreak && (
            <p style={{ fontSize:13,fontWeight:600,marginBottom:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{currentTask.title}</p>
          )}
          {isBreak && <p style={{ fontSize:13,color:'rgba(100,255,160,.8)',marginBottom:12 }}>Stretch, breathe, hydrate!</p>}
          <div style={{ display:'flex',justifyContent:'center',marginBottom:14 }}>
            <div style={{ position:'relative',width:110,height:110 }}>
              <svg width="110" height="110" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="55" cy="55" r="48" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
                <circle cx="55" cy="55" r="48" fill="none"
                  stroke={isBreak ? 'rgba(100,255,160,.75)' : 'rgba(0,200,255,.75)'} strokeWidth="7"
                  strokeDasharray={`${2 * Math.PI * 48}`}
                  strokeDashoffset={`${2 * Math.PI * 48 * (1 - pct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition:'stroke-dashoffset 1s linear' }} />
              </svg>
              <div style={{ position:'absolute',inset:0,display:'grid',placeItems:'center',fontFamily:'var(--font-display)',fontSize:26,fontWeight:800 }}>
                {fmt(timeLeft)}
              </div>
            </div>
          </div>
          <div style={{ display:'flex',gap:8,justifyContent:'center' }}>
            <button onClick={() => setPaused(p => !p)} style={{ ...s.chip('primary'),padding:'8px 16px',color:'var(--text)' }}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button onClick={skip} style={{ ...s.chip(),padding:'8px 14px' }}>
              {isBreak ? 'Skip ☕' : 'Skip ⏭'}
            </button>
          </div>
        </>
      )}

      {phase === 'done' && (
        <div style={{ textAlign:'center',padding:'8px 0' }}>
          <div style={{ fontSize:44,marginBottom:10 }}>🎉</div>
          <p style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:17,marginBottom:6 }}>Session Complete!</p>
          <p style={{ fontSize:13,color:'var(--muted2)',marginBottom:16 }}>Crushed {selected.length} task{selected.length !== 1 ? 's' : ''}.</p>
          <button onClick={onClose} style={{ ...s.chip('primary'),padding:'10px 24px',color:'var(--text)' }}>Done ✓</button>
        </div>
      )}
    </div>
  )
}

/* ─── AddClientModal ──────────────────────────────── */
function AddClientModal({ onClose, onAdd, initialName = '' }) {
  const [name, setName] = useState(initialName)
  const [emoji, setEmoji] = useState('👤')
  const [gradIdx, setGradIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const emojis = ['👤','🍊','🌊','⭐','🚀','💼','🎯','🏆','💡','🔥','🦁','🌿']

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

  return (
    <Modal onClose={onClose} width={460}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
        <h3 style={{ fontFamily:'var(--font-display)',fontSize:18,fontWeight:800 }}>Add Client</h3>
        <button onClick={onClose} style={s.mini}>×</button>
      </div>
      <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:6,display:'block' }}>Client Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. Acme Corp" autoFocus style={s.input} />
        </div>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:8,display:'block' }}>Icon</label>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
            {emojis.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                style={{ ...s.mini,fontSize:20,background: emoji===e?'rgba(255,255,255,.15)':'rgba(255,255,255,.05)',border:`1px solid ${emoji===e?'rgba(255,255,255,.3)':'rgba(255,255,255,.10)'}` }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize:12,color:'var(--muted2)',marginBottom:8,display:'block' }}>Color</label>
          <div style={{ display:'flex',gap:8 }}>
            {CLIENT_GRADIENTS.map((g, i) => (
              <button key={i} onClick={() => setGradIdx(i)}
                style={{ width:30,height:30,borderRadius:99,background:g,border:gradIdx===i?'3px solid white':'3px solid transparent',cursor:'pointer' }} />
            ))}
          </div>
        </div>
        <button onClick={submit} disabled={loading}
          style={{ padding:'12px',borderRadius:12,background:'rgba(0,200,255,.18)',border:'1px solid rgba(0,200,255,.35)',color:'var(--text)',fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'var(--font-body)' }}>
          {loading ? 'Adding…' : '+ Add Client'}
        </button>
      </div>
    </Modal>
  )
}

/* ─── TaskRow ─────────────────────────────────────── */
function TaskRow({ task, isNext, onToggle, onDelete, onClick, onDragStart, onDragOver, onDrop, isDragOver }) {
  const [hover, setHover] = useState(false)
  const done = task.status === 'done'

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(task.id) }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(task.id) }}
      onDrop={e => { e.stopPropagation(); onDrop(task.id) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !done && onClick(task)}
      style={{
        display:'flex', alignItems:'center', gap:10, cursor: done?'default':'pointer',
        padding: isNext ? '10px 10px' : '8px 6px',
        marginBottom: isNext ? 6 : 0,
        borderRadius: isNext ? 10 : 0,
        background: isDragOver ? 'rgba(0,200,255,.06)' : isNext ? 'rgba(0,200,255,.07)' : hover ? 'rgba(255,255,255,.02)' : 'transparent',
        border: isNext ? '1px solid rgba(0,200,255,.2)' : isDragOver ? '1px dashed rgba(0,200,255,.25)' : '1px solid transparent',
        borderBottom: !isNext && !isDragOver ? '1px solid rgba(255,255,255,.05)' : undefined,
        transition:'all .1s', userSelect:'none',
      }}>
      <span style={{ opacity:.3,fontSize:13,cursor:'grab',flexShrink:0,lineHeight:1 }}>⠿</span>
      <button onClick={e => { e.stopPropagation(); onToggle(task) }}
        style={{ width:17,height:17,borderRadius:5,border:'1px solid rgba(255,255,255,.22)',background: done?'rgba(0,200,100,.65)':'transparent',flexShrink:0,cursor:'pointer',display:'grid',placeItems:'center',fontSize:10,color:'white' }}>
        {done ? '✓' : ''}
      </button>
      <span style={{ flex:1,fontSize:13,fontWeight:600,color: done?'var(--muted2)':'rgba(234,240,255,.9)',textDecoration: done?'line-through':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
        {task.title}
        {isNext && <span style={{ fontSize:9,marginLeft:6,color:'rgba(0,200,255,.7)',fontWeight:800,letterSpacing:.5 }}>NEXT</span>}
      </span>
      {task.scheduled_time && !done && (
        <span style={{ fontSize:11,padding:'2px 7px',borderRadius:999,background: isNext?'rgba(0,200,255,.12)':'rgba(255,80,0,.15)',border:`1px solid ${isNext?'rgba(0,200,255,.28)':'rgba(255,80,0,.28)'}`,color: isNext?'rgba(0,200,255,.9)':'rgba(255,160,80,.9)',flexShrink:0 }}>
          {isNext?'⚡':'🔥'} {task.scheduled_time}
        </span>
      )}
      {!task.scheduled_time && !done && (
        <span style={{ fontSize:10,padding:'2px 6px',borderRadius:999,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',color:'var(--muted2)',flexShrink:0 }}>—</span>
      )}
      {hover && !done && (
        <button onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          style={{ background:'rgba(255,50,50,.12)',border:'1px solid rgba(255,50,50,.22)',borderRadius:7,color:'rgba(255,100,100,.85)',fontSize:11,padding:'2px 7px',cursor:'pointer',flexShrink:0 }}>
          ✕
        </button>
      )}
    </div>
  )
}

/* ─── ClientCard ──────────────────────────────────── */
function ClientCard({ client, tasks, onToggleTask, onDeleteTask, onAddTask, onDeleteClient, onTaskClick, onReorderTasks }) {
  const [adding, setAdding] = useState(false)
  const [quickInput, setQuickInput] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const menuRef = useRef()

  const clientTasks = tasks
    .filter(t => t.client_id === client.id && t.status !== 'done')
    .sort((a, b) => {
      const am = timeToMinutes(a.scheduled_time), bm = timeToMinutes(b.scheduled_time)
      if (am !== bm) return am - bm
      return (a.sort_order || 0) - (b.sort_order || 0)
    })

  const nextTask = clientTasks[0]

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addQuick = async () => {
    if (!quickInput.trim()) return
    const parsed = parseInput(quickInput)
    await onAddTask({ ...parsed, client_id: client.id })
    setQuickInput(''); setAdding(false)
  }

  const handleDrop = (targetId) => {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return }
    const ids = clientTasks.map(t => t.id)
    const from = ids.indexOf(draggedId), to = ids.indexOf(targetId)
    const reordered = [...ids]
    reordered.splice(from, 1); reordered.splice(to, 0, draggedId)
    onReorderTasks(reordered)
    setDraggedId(null); setDragOverId(null)
  }

  return (
    <article style={{ position:'relative',borderRadius:'var(--radius-xl)',padding:2,background:client.color_gradient,boxShadow:'var(--shadow)' }}>
      <div style={{ borderRadius:'calc(var(--radius-xl) - 2px)',background:'rgba(8,10,18,.93)',padding:20,height:'100%',display:'flex',flexDirection:'column',gap:12 }}>
        {/* header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:15,display:'flex',alignItems:'center',gap:8 }}>
            {client.emoji} {client.name}
            <span style={{ fontSize:11,padding:'2px 7px',borderRadius:999,background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.10)',color:'var(--muted)',fontFamily:'var(--font-body)',fontWeight:600 }}>
              {clientTasks.length}
            </span>
          </div>
          <div ref={menuRef} style={{ display:'flex',gap:5,position:'relative' }}>
            <button onClick={() => setAdding(a => !a)} style={s.mini} title="Add task">＋</button>
            <button onClick={() => setMenuOpen(m => !m)} style={s.mini} title="More">⋯</button>
            {menuOpen && (
              <div style={{ position:'absolute',top:38,right:0,background:'#0c0f1d',border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:6,zIndex:100,minWidth:160,boxShadow:'0 20px 50px rgba(0,0,0,.8)' }}>
                <button onClick={() => { onDeleteClient(client.id); setMenuOpen(false) }}
                  style={{ display:'block',width:'100%',textAlign:'left',padding:'9px 12px',borderRadius:8,background:'transparent',border:'none',color:'rgba(255,100,100,.9)',fontSize:13,cursor:'pointer',fontFamily:'var(--font-body)' }}>
                  🗑 Delete Client
                </button>
              </div>
            )}
          </div>
        </div>

        {/* quick add */}
        {adding && (
          <div style={{ display:'flex',gap:8,animation:'slideDown .15s ease' }}>
            <input value={quickInput} onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter') addQuick(); if (e.key==='Escape') setAdding(false) }}
              placeholder="Task… (Enter)" autoFocus
              style={{ flex:1,...s.input,padding:'8px 12px',fontSize:13 }} />
            <button onClick={addQuick} style={{ ...s.mini,background:'rgba(0,200,255,.12)',border:'1px solid rgba(0,200,255,.25)' }}>✓</button>
          </div>
        )}

        {/* tasks */}
        <div style={{ flex:1 }}>
          {clientTasks.length === 0 && (
            <p style={{ color:'var(--muted2)',fontSize:12,padding:'6px 4px' }}>No tasks — hit + to add</p>
          )}
          {clientTasks.map((t, i) => (
            <TaskRow key={t.id} task={t}
              isNext={i === 0 && !!t.scheduled_time}
              onToggle={onToggleTask} onDelete={onDeleteTask} onClick={onTaskClick}
              onDragStart={id => setDraggedId(id)}
              onDragOver={id => setDragOverId(id)}
              onDrop={handleDrop}
              isDragOver={dragOverId === t.id && draggedId !== t.id}
            />
          ))}
        </div>

        {/* next action */}
        {nextTask && (
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderRadius:10,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)' }}>
            <div style={{ display:'flex',alignItems:'center',gap:8,minWidth:0 }}>
              <span style={{ width:7,height:7,borderRadius:99,background:client.color_gradient,flexShrink:0,boxShadow:'0 0 8px rgba(255,255,255,.5)' }} />
              <span style={{ fontSize:12,color:'var(--muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                Next: <strong style={{ color:'var(--text)' }}>{nextTask.title}</strong>
              </span>
            </div>
            <span style={s.pill}>Auto</span>
          </div>
        )}
      </div>
    </article>
  )
}

/* ─── MissedRow ───────────────────────────────────── */
function MissedRow({ task, clients, onAction }) {
  const client = clients.find(c => c.id === task.client_id)
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:14,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:'10px 14px' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0 }}>
        <div style={{ width:9,height:9,borderRadius:99,background:'rgba(255,150,0,.85)',flexShrink:0 }} />
        <span style={{ fontWeight:650,color:'rgba(234,240,255,.90)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontSize:14 }}>{task.title}</span>
        {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
      </div>
      <div style={{ display:'flex',gap:6,flexShrink:0 }}>
        <button style={s.chip()} onClick={() => onAction(task.id,'done')}>Done</button>
        <button style={s.chip('primary')} onClick={() => onAction(task.id,'today')}>Today</button>
        <button style={s.chip('danger')} onClick={() => onAction(task.id,'backlog')}>Backlog</button>
      </div>
    </div>
  )
}

/* ─── Brain Dump with @mention ────────────────────── */
function BrainDumpInput({ clients, onAddTask, onCreateClient }) {
  const [input, setInput] = useState('')
  const [clientId, setClientId] = useState('')
  const [mention, setMention] = useState(null)
  const [results, setResults] = useState([])
  const [highlight, setHighlight] = useState(0)
  const [newName, setNewName] = useState(null)
  const inputRef = useRef()

  const handleChange = (e) => {
    const val = e.target.value
    setInput(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === ' ')) {
      const query = val.slice(atIdx + 1).split(' ')[0]
      const matches = clients.filter(c => c.name.toLowerCase().startsWith(query.toLowerCase()))
      setMention({ query, startPos: atIdx })
      setResults(matches)
      setHighlight(0)
      setNewName(query.length > 1 ? query : null)
    } else {
      setMention(null); setResults([]); setNewName(null)
    }
  }

  const selectClient = (client) => {
    const before = input.slice(0, mention.startPos)
    const after = input.slice(mention.startPos + 1).replace(/^\S*\s?/, '')
    setInput(before + after)
    setClientId(client.id)
    setMention(null); setResults([]); setNewName(null)
    inputRef.current?.focus()
  }

  const createAndSelect = async () => {
    if (!newName?.trim()) return
    const nc = await onCreateClient(newName.trim())
    if (nc) selectClient(nc)
  }

  const handleKeyDown = (e) => {
    if (mention && (results.length > 0 || newName)) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
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
    await onAddTask({ ...parsed, client_id: clientId || null, status: 'today' })
    setInput(''); setMention(null); setResults([])
  }

  const exactMatch = results.find(c => c.name.toLowerCase() === newName?.toLowerCase())

  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.09)',borderRadius:10,padding:'9px 12px' }}>
          <span style={{ opacity:.65,fontSize:13 }}>👤</span>
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            style={{ background:'transparent',border:'none',outline:'none',color:'var(--muted)',fontSize:13,cursor:'pointer' }}>
            <option value="">No client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <div style={{ flex:1,display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',borderRadius:10,padding:'10px 14px',minWidth:200 }}>
          <span style={{ opacity:.6,fontSize:14 }}>✦</span>
          <input ref={inputRef} value={input} onChange={handleChange} onKeyDown={handleKeyDown}
            placeholder="'Call Tom at 4pm' · '@Client task' · 'Fix bug ASAP tomorrow'"
            style={{ flex:1,border:'none',outline:'none',background:'transparent',color:'var(--text)',fontSize:13 }} />
        </div>
        <button onClick={handleAdd}
          style={{ padding:'10px 22px',borderRadius:10,background:'rgba(0,200,255,.18)',border:'1px solid rgba(0,200,255,.3)',color:'var(--text)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'var(--font-body)',whiteSpace:'nowrap' }}>
          Add Task
        </button>
      </div>

      {/* @mention dropdown */}
      {mention && (results.length > 0 || (newName && !exactMatch)) && (
        <div style={{ position:'absolute',top:'calc(100% + 6px)',left:0,background:'#0c0f1d',border:'1px solid rgba(255,255,255,.14)',borderRadius:12,padding:6,zIndex:150,minWidth:220,boxShadow:'0 20px 50px rgba(0,0,0,.8)',animation:'slideDown .15s ease' }}>
          {results.map((c, i) => (
            <div key={c.id} onClick={() => selectClient(c)}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,background: highlight===i?'rgba(255,255,255,.08)':'transparent',cursor:'pointer' }}>
              <span style={{ fontSize:16 }}>{c.emoji}</span>
              <span style={{ fontSize:13 }}>{c.name}</span>
            </div>
          ))}
          {newName && !exactMatch && (
            <div onClick={createAndSelect}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:8,background: highlight===results.length?'rgba(0,200,255,.10)':'transparent',cursor:'pointer',borderTop: results.length?'1px solid rgba(255,255,255,.07)':'none',marginTop: results.length?4:0 }}>
              <span style={{ fontSize:16 }}>＋</span>
              <span style={{ fontSize:13,color:'rgba(0,200,255,.9)' }}>Create "{newName}"</span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop:10,display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
        <span style={{ fontSize:12,color:'var(--muted2)' }}>Quick:</span>
        {['today','tomorrow','ASAP','!!','3pm','@client'].map(k => (
          <span key={k} onClick={() => { setInput(p => p + (p&&!p.endsWith(' ')?' ':'')+k); inputRef.current?.focus() }}
            style={{ fontSize:11,padding:'3px 8px',borderRadius:6,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.09)',color:'var(--muted)',cursor:'pointer' }}>
            {k}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ─── App ─────────────────────────────────────────── */
export default function App() {
  const [clients, setClients] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [activeNav, setActiveNav] = useState('Today')
  const [search, setSearch] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showPomodoro, setShowPomodoro] = useState(false)

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

  const missedTasks = tasks.filter(t => t.status === 'today' && t.scheduled_date < today())
  const todayTasks = tasks.filter(t => t.status === 'today' && t.scheduled_date === today())
  const showWelcome = missedTasks.length > 0 && !welcomeDismissed

  const handleAddTask = async (payload) => {
    const { data, error } = await supabase.from('tasks').insert({ ...payload, status: 'today' }).select().single()
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
    if (selectedTask?.id === id) setSelectedTask(null)
  }

  const handleMissedAction = async (id, status) => {
    await supabase.from('tasks').update({ status, scheduled_date: today() }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, scheduled_date: today() } : t))
  }

  const handleUpdateTask = (updated) => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))

  const handleAddClient = (c) => setClients(prev => [...prev, c])

  const handleCreateClientFromMention = async (name) => {
    const { data, error } = await supabase.from('clients').insert({
      name, emoji: '👤', color_gradient: CLIENT_GRADIENTS[clients.length % CLIENT_GRADIENTS.length]
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
  }

  const handleReorderTasks = async (orderedIds) => {
    setTasks(prev => {
      const next = [...prev]
      orderedIds.forEach((id, i) => {
        const idx = next.findIndex(t => t.id === id)
        if (idx !== -1) next[idx] = { ...next[idx], sort_order: i }
      })
      return next
    })
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from('tasks').update({ sort_order: i }).eq('id', id)
    ))
  }

  const navItems = ['Today', 'Backlog', 'Clients', 'All Tasks']
  const filtered = search ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : []

  if (loading) return (
    <div style={{ display:'grid',placeItems:'center',height:'100vh' }}>
      <div style={{ textAlign:'center',color:'var(--muted2)' }}>
        <div style={{ fontFamily:'var(--font-display)',fontSize:32,fontWeight:800,color:'var(--text)',marginBottom:10 }}>UpNext</div>
        <div style={{ animation:'pulse 1.2s ease infinite' }}>Loading your workspace…</div>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth:1320,margin:'0 auto',padding:'34px 28px 90px' }}>
      {showAddClient && (
        <AddClientModal initialName={newClientName}
          onClose={() => { setShowAddClient(false); setNewClientName('') }}
          onAdd={handleAddClient} />
      )}
      {selectedTask && (
        <TaskDetailModal task={selectedTask} clients={clients}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask} />
      )}
      {showPomodoro && (
        <PomodoroWidget tasks={todayTasks} clients={clients} onClose={() => setShowPomodoro(false)} />
      )}

      {/* Topbar */}
      <header style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:22,marginBottom:40 }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ width:34,height:34,borderRadius:12,background:'radial-gradient(circle at 30% 30%,rgba(255,130,0,.95),rgba(0,200,255,.7),rgba(180,0,255,.75))' }} />
          <span style={{ fontFamily:'var(--font-display)',fontWeight:800,fontSize:18,letterSpacing:.2 }}>UpNext</span>
        </div>
        <nav style={{ display:'flex',alignItems:'center',gap:3 }}>
          {navItems.map(n => (
            <button key={n} onClick={() => setActiveNav(n)}
              style={{ fontFamily:'var(--font-body)',fontWeight:600,fontSize:14,padding:'9px 14px',borderRadius:999,cursor:'pointer',transition:'all .15s',
                color: activeNav===n?'var(--text)':'var(--muted2)',
                background: activeNav===n?'rgba(255,255,255,.07)':'transparent',
                border: `1px solid ${activeNav===n?'rgba(255,255,255,.14)':'transparent'}` }}>
              {n}
            </button>
          ))}
        </nav>
        <div style={{ display:'flex',alignItems:'center',gap:8,minWidth:280 }}>
          <div style={{ flex:1,display:'flex',alignItems:'center',gap:8,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.10)',borderRadius:999,padding:'9px 14px' }}>
            <span style={{ opacity:.4,fontSize:13 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              style={{ border:0,outline:0,background:'transparent',color:'var(--text)',fontSize:13,width:'100%' }} />
          </div>
          <button onClick={() => setShowPomodoro(p => !p)} title="Focus Session"
            style={{ ...s.mini,width:40,height:40,borderRadius:999,fontSize:18,background: showPomodoro?'rgba(255,80,0,.15)':'rgba(255,255,255,.05)',border:`1px solid ${showPomodoro?'rgba(255,80,0,.3)':'rgba(255,255,255,.10)'}` }}>🍅</button>
          <button onClick={() => setShowAddClient(true)} title="Add Client"
            style={{ ...s.mini,width:40,height:40,borderRadius:999,fontSize:22 }}>＋</button>
          <div style={{ width:38,height:38,borderRadius:999,background:'radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),rgba(255,255,255,.08))',border:'1px solid rgba(255,255,255,.12)' }} />
        </div>
      </header>

      {/* Search results */}
      {search && (
        <div style={{ ...s.panel,padding:24,marginBottom:40 }}>
          <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:16,fontSize:15 }}>Results for "{search}"</h3>
          {filtered.length === 0
            ? <p style={{ color:'var(--muted2)',fontSize:14 }}>No tasks found.</p>
            : filtered.map(t => {
                const client = clients.find(c => c.id === t.client_id)
                return (
                  <div key={t.id} onClick={() => setSelectedTask(t)}
                    style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)',cursor:'pointer' }}>
                    <span style={{ flex:1,fontSize:14,color: t.status==='done'?'var(--muted2)':'var(--text)',textDecoration: t.status==='done'?'line-through':'none' }}>{t.title}</span>
                    {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                    <span style={s.tag}>{t.status}</span>
                  </div>
                )
              })
          }
        </div>
      )}

      {/* Missed tasks welcome */}
      {!search && showWelcome && (
        <div style={{ display:'flex',justifyContent:'center',marginBottom:56 }}>
          <section style={{ ...s.panel,padding:'20px 22px',width:'min(820px,100%)',position:'relative',overflow:'hidden' }}>
            <div style={{ position:'absolute',inset:-2,background:'linear-gradient(90deg,rgba(255,160,0,.20),rgba(0,200,255,.16),rgba(190,0,255,.18))',filter:'blur(22px)',opacity:.55,pointerEvents:'none' }} />
            <div style={{ position:'relative' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                <h2 style={{ fontFamily:'var(--font-display)',fontSize:17,fontWeight:800 }}>👋 Welcome back — {missedTasks.length} missed</h2>
                <button onClick={() => setWelcomeDismissed(true)} style={{ ...s.chip(),fontSize:12 }}>Dismiss</button>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {missedTasks.map(t => <MissedRow key={t.id} task={t} clients={clients} onAction={handleMissedAction} />)}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TODAY */}
      {!search && activeNav === 'Today' && (
        <>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
            <span style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'9px 16px',borderRadius:999,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.11)',fontFamily:'var(--font-display)',fontWeight:800,fontSize:14 }}>
              🧠 Brain Dump
            </span>
            <button onClick={() => setShowPomodoro(p => !p)}
              style={{ display:'flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:999,background: showPomodoro?'rgba(255,80,0,.14)':'rgba(255,255,255,.05)',border:`1px solid ${showPomodoro?'rgba(255,80,0,.28)':'rgba(255,255,255,.11)'}`,color:'var(--text)',fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'var(--font-body)' }}>
              🍅 Focus Session
            </button>
          </div>
          <section style={{ ...s.panel,padding:'18px 22px',marginBottom:52 }}>
            <BrainDumpInput clients={clients} onAddTask={handleAddTask} onCreateClient={handleCreateClientFromMention} />
          </section>

          {todayTasks.filter(t => !t.client_id).length > 0 && (
            <section style={{ ...s.panel,padding:22,marginBottom:36,background:'rgba(10,12,20,.85)' }}>
              <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:14,fontSize:15 }}>📋 General Tasks</h3>
              {todayTasks.filter(t => !t.client_id)
                .sort((a,b) => timeToMinutes(a.scheduled_time) - timeToMinutes(b.scheduled_time))
                .map((t,i) => (
                  <TaskRow key={t.id} task={t} isNext={i===0&&!!t.scheduled_time}
                    onToggle={handleToggleTask} onDelete={handleDeleteTask} onClick={setSelectedTask}
                    onDragStart={()=>{}} onDragOver={()=>{}} onDrop={()=>{}} isDragOver={false} />
                ))}
            </section>
          )}

          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
            <span style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'9px 16px',borderRadius:999,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.11)',fontFamily:'var(--font-display)',fontWeight:800,fontSize:14 }}>
              🏢 Clients
            </span>
            <button onClick={() => setShowAddClient(true)}
              style={{ ...s.chip('primary'),padding:'9px 16px',fontSize:13,color:'rgba(0,200,255,.9)' }}>
              + New Client
            </button>
          </div>
          <section style={{ ...s.panel,padding:22,background:'rgba(10,12,20,.85)' }}>
            {clients.length === 0 ? (
              <div style={{ textAlign:'center',padding:'40px 0',color:'var(--muted2)' }}>
                <div style={{ fontSize:36,marginBottom:12 }}>🏢</div>
                <p style={{ marginBottom:16 }}>No clients yet.</p>
                <button onClick={() => setShowAddClient(true)} style={{ ...s.chip('primary'),padding:'10px 20px',color:'rgba(0,200,255,.9)' }}>Add First Client</button>
              </div>
            ) : (
              <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:18 }}>
                {clients.map(c => (
                  <ClientCard key={c.id} client={c} tasks={tasks}
                    onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask}
                    onAddTask={handleAddTask} onDeleteClient={handleDeleteClient}
                    onTaskClick={setSelectedTask} onReorderTasks={handleReorderTasks} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* BACKLOG */}
      {!search && activeNav === 'Backlog' && (
        <section style={{ ...s.panel,padding:24 }}>
          <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:20,fontSize:15 }}>📦 Backlog</h3>
          {tasks.filter(t => t.status === 'backlog').length === 0
            ? <p style={{ color:'var(--muted2)',fontSize:14 }}>Backlog empty. Nice!</p>
            : tasks.filter(t => t.status === 'backlog').map(t => {
                const client = clients.find(c => c.id === t.client_id)
                return (
                  <div key={t.id} onClick={() => setSelectedTask(t)}
                    style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,.06)',cursor:'pointer' }}>
                    <span style={{ flex:1,fontSize:14 }}>{t.title}</span>
                    {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                    <button onClick={e => { e.stopPropagation(); handleMissedAction(t.id,'today') }} style={{ ...s.chip('primary'),padding:'7px 12px' }}>Move to Today</button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteTask(t.id) }} style={{ ...s.chip('danger'),padding:'7px 12px' }}>Delete</button>
                  </div>
                )
              })
          }
        </section>
      )}

      {/* CLIENTS */}
      {!search && activeNav === 'Clients' && (
        <section style={{ ...s.panel,padding:24 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:22 }}>
            <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,fontSize:15 }}>All Clients</h3>
            <button onClick={() => setShowAddClient(true)} style={{ ...s.chip('primary'),padding:'8px 16px',color:'rgba(0,200,255,.9)' }}>+ New Client</button>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:18 }}>
            {clients.map(c => (
              <ClientCard key={c.id} client={c} tasks={tasks}
                onToggleTask={handleToggleTask} onDeleteTask={handleDeleteTask}
                onAddTask={handleAddTask} onDeleteClient={handleDeleteClient}
                onTaskClick={setSelectedTask} onReorderTasks={handleReorderTasks} />
            ))}
          </div>
        </section>
      )}

      {/* ALL TASKS */}
      {!search && activeNav === 'All Tasks' && (
        <section style={{ ...s.panel,padding:24 }}>
          <h3 style={{ fontFamily:'var(--font-display)',fontWeight:700,marginBottom:20,fontSize:15 }}>All Tasks</h3>
          {['today','backlog','done'].map(status => {
            const group = tasks.filter(t => t.status === status)
            if (!group.length) return null
            return (
              <div key={status} style={{ marginBottom:28 }}>
                <div style={{ fontSize:11,fontWeight:700,color:'var(--muted2)',textTransform:'uppercase',letterSpacing:1.2,marginBottom:10 }}>
                  {status} — {group.length}
                </div>
                {group.map(t => {
                  const client = clients.find(c => c.id === t.client_id)
                  return (
                    <div key={t.id} onClick={() => setSelectedTask(t)}
                      style={{ display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)',cursor:'pointer' }}>
                      <span style={{ flex:1,fontSize:14,color: t.status==='done'?'var(--muted2)':'var(--text)',textDecoration: t.status==='done'?'line-through':'none' }}>{t.title}</span>
                      {client && <span style={s.tag}>{client.emoji} {client.name}</span>}
                      {t.scheduled_time && <span style={{ ...s.tag,borderColor:'rgba(255,80,0,.28)',color:'rgba(255,160,80,.85)' }}>🔥 {t.scheduled_time}</span>}
                      <button onClick={e => { e.stopPropagation(); handleDeleteTask(t.id) }} style={{ ...s.chip('danger'),padding:'6px 10px' }}>✕</button>
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
