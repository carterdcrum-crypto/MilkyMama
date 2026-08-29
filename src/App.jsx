import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Home, ClipboardList, TimerReset, Package, BarChart3, ChevronLeft, ChevronRight,
  Plus, Minus, Settings as SettingsIcon, History, Trophy, Flower2, Pause, Play,
  Square, Droplets, Milk, Sparkles, X, Download, Trash2, RotateCcw, Check, Share2,
  Sun, MoonStar, Heart, Star, Cloud, Leaf
} from 'lucide-react'

const STORAGE_KEY = 'milkyMama.v1'
const defaultData = {
  sessions: [],
  stash: [],
  settings: {
    dailyGoal: 24,
    unit: 'oz',
    haptics: true,
    sounds: true,
    reduceMotion: false,
    notifications: true,
  },
  gameScores: { dropPop: 0, mamaMatch: 0 },
}

const NAV = [
  ['home', 'Home', Home],
  ['log', 'Log', ClipboardList],
  ['pump', 'Pump Room', TimerReset],
  ['stash', 'Stash', Package],
  ['progress', 'Progress', BarChart3],
]

const MATCH_TYPES = ['flower', 'star', 'heart', 'cloud', 'moon', 'milk', 'leaf', 'drops']
const ACHIEVEMENT_ICONS = {
  first: Droplets,
  start: Star,
  track: Flower2,
  routine: Flower2,
  stash: Leaf,
  fifty: Heart,
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const sameDay = (a, b = new Date()) => new Date(a).toDateString() === new Date(b).toDateString()
const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const fmtTime = iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const fmtDuration = sec => `${Math.max(0, Math.floor((sec || 0) / 60))}m`
const clamp = (n, a, b) => Math.min(Math.max(n, a), b)

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!parsed) return defaultData
    return {
      ...defaultData,
      ...parsed,
      settings: { ...defaultData.settings, ...parsed.settings },
      gameScores: { ...defaultData.gameScores, ...parsed.gameScores },
    }
  } catch {
    return defaultData
  }
}

export default function App() {
  const [screen, setScreen] = useState('home')
  const [data, setData] = useState(loadData)
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), [data])
  useEffect(() => {
    const handler = event => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const go = target => {
    window.scrollTo({ top: 0, behavior: data.settings.reduceMotion ? 'auto' : 'smooth' })
    setScreen(target)
  }

  const saveSession = session => {
    setData(current => ({ ...current, sessions: [session, ...current.sessions] }))
    go('home')
  }

  const common = {
    data,
    setData,
    go,
    saveSession,
    installPrompt,
    addStash: item => setData(current => ({ ...current, stash: [item, ...current.stash] })),
    removeStash: id => setData(current => ({ ...current, stash: current.stash.filter(item => item.id !== id) })),
    updateSettings: patch => setData(current => ({ ...current, settings: { ...current.settings, ...patch } })),
    setGameScore: (name, score) => setData(current => {
      const old = current.gameScores[name] || 0
      const next = name === 'mamaMatch' && old ? Math.min(old, score) : Math.max(old, score)
      return { ...current, gameScores: { ...current.gameScores, [name]: next } }
    }),
  }

  const main = NAV.some(([id]) => id === screen)
  const night = ['pump', 'drop-pop', 'mama-match'].includes(screen)

  return <div className={`app-shell ${night ? 'night-shell' : ''}`}>
    <main className="phone-stage">
      {screen === 'home' && <HomeScreen {...common} />}
      {screen === 'log' && <LogScreen {...common} />}
      {screen === 'pump' && <PumpScreen {...common} />}
      {screen === 'stash' && <StashScreen {...common} />}
      {screen === 'progress' && <ProgressScreen {...common} />}
      {screen === 'history' && <HistoryScreen {...common} />}
      {screen === 'achievements' && <AchievementsScreen {...common} />}
      {screen === 'garden' && <GardenScreen {...common} />}
      {screen === 'drop-pop' && <DropPopScreen {...common} />}
      {screen === 'mama-match' && <MamaMatchScreen {...common} />}
      {screen === 'settings' && <SettingsScreen {...common} />}
    </main>
    {main && <BottomNav current={screen} go={go} />}
  </div>
}

function BottomNav({ current, go }) {
  return <nav className="bottom-nav" aria-label="Primary navigation">
    {NAV.map(([id, label, Icon]) => <button key={id} className={current === id ? 'active' : ''} onClick={() => go(id)}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </button>)}
  </nav>
}

function ScreenHeader({ title, go, action, night = false, back = 'home' }) {
  return <header className={`screen-header ${night ? 'night' : ''}`}>
    <button className="icon-button" onClick={() => go(back)} aria-label="Back"><ChevronLeft size={21} /></button>
    <h1>{title}</h1>
    {action || <span className="header-spacer" />}
  </header>
}

function Stat({ label, value, small = false }) {
  return <div className="stat-card"><span>{label}</span><strong className={small ? 'small' : ''}>{value}</strong></div>
}

function Segmented({ value, onChange, options }) {
  return <div className="segmented">{options.map(([id, label]) => <button key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>
}

function Stepper({ value, setValue, step = 1, min = 0, suffix = '' }) {
  return <div className="stepper">
    <button onClick={() => setValue(Math.max(min, Number(value) - step))} aria-label="Decrease"><Minus size={14} /></button>
    <strong>{Number(value).toFixed(step < 1 ? 1 : 0)} {suffix && <small>{suffix}</small>}</strong>
    <button onClick={() => setValue(Number(value) + step)} aria-label="Increase"><Plus size={14} /></button>
  </div>
}

function FormRow({ label, children }) {
  return <div className="form-row"><span>{label}</span><div className="form-row-control">{children}</div></div>
}

function Empty({ icon, title, text }) {
  return <div className="empty-card">{icon}<div><strong>{title}</strong><p>{text}</p></div></div>
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-card" onClick={event => event.stopPropagation()}>
      <div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X size={17} /></button></div>
      {children}
    </div>
  </div>
}

function HomeScreen({ data, go }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = data.sessions.filter(session => sameDay(session.startedAt))
  const ounces = today.reduce((sum, session) => sum + Number(session.ounces || 0), 0)
  const goal = Number(data.settings.dailyGoal || 24)
  const pct = clamp(Math.round((ounces / goal) * 100), 0, 100)
  const latest = data.sessions[0]
  const fridge = sumLocation(data.stash, 'Fridge')
  const freezer = sumLocation(data.stash, 'Freezer')
  const GreetingIcon = hour < 18 ? Sun : MoonStar

  return <div className="screen light home-screen">
    <div className="home-topbar"><div><h1>{greeting}, Mama! <GreetingIcon className="greeting-icon" size={17} /></h1><p>You’re doing amazing today.</p></div></div>
    <div className="progress-orbit" style={{ '--progress': `${pct * 3.6}deg` }}><div className="orbit-inner"><strong>{ounces.toFixed(1)}</strong><span>of {goal} oz</span><b>{pct}%</b></div></div>
    <div className="stat-grid three"><Stat label="Sessions" value={today.length} /><Stat label="Streak" value={calcStreak(data.sessions)} /><Stat label="Last Pump" value={latest ? relativeTime(new Date(latest.startedAt)) : 'None'} small /></div>
    <div className="stash-preview-grid"><button className="stash-preview fridge" onClick={() => go('stash')}><span>Fridge</span><strong>{fridge.toFixed(1)} oz</strong></button><button className="stash-preview freezer" onClick={() => go('stash')}><span>Freezer</span><strong>{freezer.toFixed(1)} oz</strong></button></div>
    <button className="primary-cta" onClick={() => go('pump')}><Milk size={18} /> Start Pumping</button>
    <button className="secondary-cta" onClick={() => go('log')}>Log Session</button>
    {data.sessions.length === 0 && <div className="empty-card compact home-empty"><Droplets size={21} /><div><strong>No sessions yet</strong><p>Start pumping or log a completed session.</p></div></div>}
  </div>
}

function LogScreen({ data, go, saveSession }) {
  const now = new Date()
  const [mode, setMode] = useState('simple')
  const [unit, setUnit] = useState(data.settings.unit || 'oz')
  const [date, setDate] = useState(now.toISOString().slice(0, 10))
  const [time, setTime] = useState(now.toTimeString().slice(0, 5))
  const [total, setTotal] = useState(0)
  const [duration, setDuration] = useState(1200)
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(0)
  const [tag, setTag] = useState('Home')
  const [notes, setNotes] = useState('')

  useEffect(() => { if (mode === 'advanced') setTotal(Number(left) + Number(right)) }, [mode, left, right])

  const save = () => {
    const oz = unit === 'mL' ? total / 29.5735 : total
    saveSession({ id: uid(), startedAt: new Date(`${date}T${time}`).toISOString(), ounces: Number(oz.toFixed(2)), durationSec: duration, leftOz: mode === 'advanced' ? left : null, rightOz: mode === 'advanced' ? right : null, tag, notes })
  }

  return <div className="screen light log-screen">
    <ScreenHeader title="Log Session" go={go} action={<button className="text-action" onClick={save}>Save</button>} />
    <Segmented value={mode} onChange={setMode} options={[["simple", "Simple"], ["advanced", "Advanced"]]} />
    <div className="form-list">
      <FormRow label="Date"><input type="date" value={date} onChange={event => setDate(event.target.value)} /></FormRow>
      <FormRow label="Time"><input type="time" value={time} onChange={event => setTime(event.target.value)} /></FormRow>
      {mode === 'simple' && <FormRow label="Total Ounces"><Stepper value={total} setValue={setTotal} step={0.5} suffix={unit} /><div className="unit-toggle"><button className={unit === 'oz' ? 'active' : ''} onClick={() => setUnit('oz')}>oz</button><button className={unit === 'mL' ? 'active' : ''} onClick={() => setUnit('mL')}>mL</button></div></FormRow>}
      <FormRow label="Duration"><div className="stepper"><button onClick={() => setDuration(Math.max(60, duration - 60))} aria-label="Decrease duration"><Minus size={14} /></button><strong>{String(Math.floor(duration / 60)).padStart(2, '0')}:00</strong><button onClick={() => setDuration(duration + 60)} aria-label="Increase duration"><Plus size={14} /></button></div></FormRow>
    </div>
    {mode === 'advanced' && <section className="form-section"><p className="eyebrow">Advanced Logging</p><FormRow label="Left Ounces"><Stepper value={left} setValue={setLeft} step={0.5} suffix="oz" /></FormRow><FormRow label="Right Ounces"><Stepper value={right} setValue={setRight} step={0.5} suffix="oz" /></FormRow><div className="calculated-total">Total = Left + Right = <strong>{(Number(left) + Number(right)).toFixed(1)} oz</strong><Check size={14} /></div></section>}
    <div className="form-list second"><FormRow label="Tag"><select value={tag} onChange={event => setTag(event.target.value)}><option>Home</option><option>Work</option><option>Night</option><option>Power Pump</option></select></FormRow><div className="notes-block"><label htmlFor="session-notes">Notes</label><textarea id="session-notes" value={notes} onChange={event => setNotes(event.target.value)} aria-label="Session notes" /></div></div>
    <button className="primary-cta sticky-save" onClick={save}>Save Session</button>
  </div>
}

function PumpScreen({ data, go, saveSession }) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const [finishMode, setFinishMode] = useState(false)
  const [ounces, setOunces] = useState(0)
  const started = useRef(new Date())

  useEffect(() => { if (!running) return undefined; const timer = setInterval(() => setElapsed(value => value + 1), 1000); return () => clearInterval(timer) }, [running])
  const finish = () => { if (!finishMode) { setRunning(false); setFinishMode(true); return }; saveSession({ id: uid(), startedAt: started.current.toISOString(), ounces, durationSec: elapsed, leftOz: null, rightOz: null, tag: 'Pump Room', notes: '' }) }

  return <div className="screen night pump-screen">
    <ScreenHeader title="Pumping Session" go={go} night action={<Sparkles size={15} />} />
    <NightStars />
    <div className="timer-display">{toClock(elapsed)}<span>Elapsed</span></div>
    <div className="pump-actions"><button className="night-secondary" onClick={() => setRunning(value => !value)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pause' : 'Resume'}</button><button className="pink-button" onClick={finish}><Square size={15} />{finishMode ? 'Save' : 'Finish'}</button></div>
    {finishMode && <div className="finish-card"><label>How much did you pump?</label><Stepper value={ounces} setValue={setOunces} step={0.5} suffix="oz" /><button className="pink-button wide" onClick={finish}>Save Session</button></div>}
    <section className="quick-games"><h2>Quick Games</h2><p>Play a game while you pump!</p><div className="game-cards two"><GameCard icon={<Droplets size={34} />} title="Drop Pop" meta={`High Score ${data.gameScores.dropPop || 0}`} tone="blue" onClick={() => go('drop-pop')} /><GameCard icon={<Heart size={34} />} title="Mama Match" meta={data.gameScores.mamaMatch ? `Best Time ${data.gameScores.mamaMatch}s` : 'No score yet'} tone="pink" onClick={() => go('mama-match')} /></div></section>
    <div className="session-start-row"><span>Session Started</span><strong>{fmtTime(started.current)}</strong></div>
    <button className="cancel-session" onClick={() => go('home')}>Cancel Session</button>
  </div>
}

function NightStars() { return <div className="night-stars" aria-hidden="true">{Array.from({ length: 13 }, (_, i) => <i key={i} />)}</div> }
function GameCard({ icon, title, meta, tone, onClick }) { return <button className="game-card" onClick={onClick}><span className={`game-icon ${tone}`}>{icon}</span><strong>{title}</strong><small>{meta}</small></button> }

function StashScreen({ data, go, addStash, removeStash }) {
  const [filter, setFilter] = useState('All')
  const [open, setOpen] = useState(false)
  const [ounces, setOunces] = useState(4)
  const [location, setLocation] = useState('Fridge')
  const list = filter === 'All' ? data.stash : data.stash.filter(item => item.location === filter)
  const total = data.stash.reduce((sum, item) => sum + Number(item.ounces), 0)
  const add = () => { addStash({ id: uid(), ounces: Number(ounces), location, storedAt: new Date().toISOString() }); setOpen(false) }

  return <div className="screen light stash-screen">
    <ScreenHeader title="Stash" go={go} action={<button className="round-add" onClick={() => setOpen(true)} aria-label="Add milk"><Plus size={16} /></button>} />
    <Segmented value={filter} onChange={setFilter} options={[["All", "All"], ["Fridge", "Fridge"], ["Freezer", "Freezer"], ["Room", "Room"]]} />
    <div className="stash-summary"><div><span>Total Stored</span><strong>{total.toFixed(1)} <small>oz</small></strong></div><div><span>Containers</span><strong>{data.stash.length}</strong></div></div>
    <div className="stash-location-grid"><div className="mint-card"><span>Fridge</span><strong>{sumLocation(data.stash, 'Fridge').toFixed(1)} oz</strong></div><div className="blue-card"><span>Freezer</span><strong>{sumLocation(data.stash, 'Freezer').toFixed(1)} oz</strong></div></div>
    <h2 className="section-title">Recent Containers</h2>
    {list.length === 0 ? <Empty icon={<Milk size={21} />} title="No milk stored yet" text="Add a container to begin tracking your stash." /> : <div className="container-list">{list.map(item => { const status = stashStatus(item); return <div className="container-row" key={item.id}><span className={`bottle-dot ${item.location.toLowerCase()}`}><Milk size={16} /></span><span className="container-copy"><strong>Breast Milk</strong><small>{item.location} · {fmtDate(item.storedAt)}</small></span><span className={`freshness ${status.tone}`}>{status.label}</span><strong className="container-amount">{Number(item.ounces).toFixed(1)} oz</strong><button className="tiny-delete" onClick={() => removeStash(item.id)} aria-label="Remove container"><X size={13} /></button></div> })}</div>}
    {open && <Modal title="Add Milk" onClose={() => setOpen(false)}><label>Amount</label><Stepper value={ounces} setValue={setOunces} step={0.5} suffix="oz" /><label>Store in</label><select value={location} onChange={event => setLocation(event.target.value)}><option>Fridge</option><option>Freezer</option><option>Room</option></select><button className="primary-cta" onClick={add}>Add to Stash</button></Modal>}
  </div>
}

function ProgressScreen({ data, go }) {
  const [range, setRange] = useState('7')
  const days = range === 'today' ? 1 : range === '7' ? 7 : 30
  const scoped = data.sessions.filter(session => Date.now() - new Date(session.startedAt).getTime() <= days * 86400000)
  const total = scoped.reduce((sum, session) => sum + Number(session.ounces), 0)
  const avg = scoped.length ? total / scoped.length : 0
  const avgDur = scoped.length ? scoped.reduce((sum, session) => sum + (session.durationSec || 0), 0) / scoped.length : 0
  const chart = useMemo(() => dailyBuckets(data.sessions, Math.min(days, 7)), [data.sessions, days])
  const achievements = getAchievements(data)
  const max = Math.max(...chart.map(item => item.value), 1)

  return <div className="screen light progress-screen">
    <ScreenHeader title="Progress" go={go} action={<button className="icon-button" onClick={() => go('settings')} aria-label="Settings"><SettingsIcon size={18} /></button>} />
    <Segmented value={range} onChange={setRange} options={[["today", "Today"], ["7", "7 Days"], ["30", "30 Days"]]} />
    <section className="progress-summary"><div className="progress-stats"><Stat label="Total Ounces" value={`${total.toFixed(1)} oz`} /><Stat label="Sessions" value={scoped.length} /><Stat label="Average" value={`${avg.toFixed(1)} oz`} /></div><div className="avg-duration"><span>Avg Duration</span><strong>{fmtDuration(avgDur)}</strong></div></section>
    <section className="chart-card"><h2>Ounces Per Day</h2><div className="chart-y"><span>{Math.ceil(max)}</span><span>{Math.ceil(max / 2)}</span><span>0</span></div><div className="bar-chart">{chart.map((item, index) => <div className="bar-wrap" key={index}><div className="bar" style={{ height: `${Math.max(7, item.value / max * 108)}px` }} /><small>{item.label}</small></div>)}</div></section>
    <section className="achievement-preview"><div className="section-heading"><h2>Achievements</h2><button onClick={() => go('achievements')}>View All</button></div><div className="achievement-badges">{achievements.slice(0, 3).map(item => <AchievementBadge key={item.id} item={item} />)}</div></section>
    <div className="utility-links"><button onClick={() => go('garden')}><Flower2 size={17} /><span>Milky Garden</span><ChevronRight size={15} /></button><button onClick={() => go('history')}><History size={17} /><span>Session History</span><ChevronRight size={15} /></button></div>
  </div>
}

function AchievementBadge({ item }) { const Icon = ACHIEVEMENT_ICONS[item.id] || Trophy; return <div><span className={`badge badge-${item.id} ${item.unlocked ? 'unlocked' : ''}`}><Icon size={25} /></span><small>{item.title}</small></div> }

function GardenScreen({ data, go }) {
  const xp = data.sessions.length * 12 + Math.round(data.sessions.reduce((sum, session) => sum + Number(session.ounces), 0))
  const level = Math.max(1, Math.floor(xp / 60) + 1)
  const inLevel = xp % 60
  const blooms = Math.min(5, Math.floor((data.sessions.length + 2) / 3))
  return <div className="screen garden-screen"><ScreenHeader title="Milky Garden" go={go} /><p className="garden-subtitle">Keep going, your garden is growing!</p><div className="garden-scene"><div className="light-string" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div><div className="garden-cloud c1" /><div className="garden-cloud c2" /><div className="garden-fence" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div><div className="garden-pots">{Array.from({ length: 5 }, (_, i) => <GardenPot key={i} active={i < blooms} index={i} />)}</div><div className="garden-grass" /></div><div className="garden-progress-card"><strong>Garden Progress</strong><div className="garden-progress-meta"><span>Level {level}</span><span>{inLevel} / 60 XP</span></div><div className="xp-track"><div style={{ width: `${inLevel / 60 * 100}%` }} /></div></div></div>
}

function GardenPot({ active, index }) { return <div className={`garden-pot pot-${index} ${active ? 'active' : ''}`}>{active && <div className="plant-stem"><Flower2 size={index % 2 ? 42 : 36} /></div>}<div className="pot-rim" /><div className="pot-body" /></div> }

function AchievementsScreen({ data, go }) {
  const achievements = getAchievements(data)
  const unlocked = achievements.filter(item => item.unlocked)
  return <div className="screen light achievements-screen"><ScreenHeader title="Achievements" go={go} /><p className="center-meta">{unlocked.length} / {achievements.length} Unlocked</p>{unlocked.length > 0 && <><h2 className="section-title">Recently Unlocked</h2><div className="achievement-list">{unlocked.slice(0, 2).map(item => <AchievementRow key={item.id} item={item} />)}</div></>}<h2 className="section-title">All Achievements</h2><div className="achievement-list">{achievements.map(item => <AchievementRow key={item.id} item={item} />)}</div></div>
}

function AchievementRow({ item }) { const Icon = ACHIEVEMENT_ICONS[item.id] || Trophy; return <div className={`achievement-row ${item.unlocked ? 'unlocked' : ''}`}><span className={`achievement-icon badge-${item.id}`}><Icon size={20} /></span><span><strong>{item.title}</strong><small>{item.desc}</small></span>{item.unlocked ? <span className="check-pill"><Check size={13} /></span> : <span className="achievement-progress">{item.progress}</span>}</div> }

function HistoryScreen({ data, go }) {
  const grouped = groupSessions(data.sessions)
  return <div className="screen light history-screen"><ScreenHeader title="History" go={go} />{data.sessions.length === 0 ? <Empty icon={<History size={21} />} title="No sessions yet" text="Completed pumping sessions will appear here." /> : Object.entries(grouped).map(([date, sessions]) => <section className="history-day" key={date}><h2>{date}</h2><div className="history-card">{sessions.map(session => <div className="history-row" key={session.id}><span className="history-time"><strong>{fmtTime(session.startedAt)}</strong><small>{fmtDuration(session.durationSec)}</small></span><strong className="history-ounces">{Number(session.ounces).toFixed(1)} oz</strong><span className="history-sides">{session.leftOz != null ? <><small>L {Number(session.leftOz).toFixed(1)}</small><small>R {Number(session.rightOz).toFixed(1)}</small></> : <small>{session.tag}</small>}</span></div>)}</div></section>)}</div>
}

function DropPopScreen({ data, go, setGameScore }) {
  const [score, setScore] = useState(0)
  const [time, setTime] = useState(30)
  const [paused, setPaused] = useState(false)
  const [drops, setDrops] = useState(() => newDrops())
  useEffect(() => { if (paused || time <= 0) return undefined; const timer = setInterval(() => setTime(value => value - 1), 1000); return () => clearInterval(timer) }, [paused, time])
  useEffect(() => { if (time === 0) setGameScore('dropPop', score) }, [time, score, setGameScore])
  const pop = id => { if (time <= 0 || paused) return; setScore(value => value + 30); setDrops(items => items.map(item => item.id === id ? randomDrop(id) : item)); if (data.settings.haptics && navigator.vibrate) navigator.vibrate(18) }
  return <div className="screen night game-screen drop-pop-screen"><ScreenHeader title="Drop Pop" go={go} back="pump" night action={<span className="coin"><i />{data.gameScores.dropPop || 0}</span>} /><div className="game-hud"><span>{time} sec</span><strong>{score}<small>x{Math.max(1, Math.floor(score / 90) + 1)} Combo</small></strong><button className="round-night" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume' : 'Pause'}>{paused ? <Play size={15} /> : <Pause size={15} />}</button></div><div className="drop-field"><NightStars />{drops.map(item => <button key={item.id} className={`drop drop-${item.kind}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => pop(item.id)} aria-label="Pop drop"><span className="drop-shape"><i className="eye left" /><i className="eye right" /><i className="smile" /></span><b>+30</b></button>)}</div>{time === 0 && <div className="game-over"><strong>{score} points</strong><button className="pink-button" onClick={() => { setScore(0); setTime(30); setDrops(newDrops()) }}>Play Again</button></div>}</div>
}

function newDrops() { return Array.from({ length: 6 }, (_, index) => randomDrop(index)) }
function randomDrop(id) { return { id, x: 7 + Math.random() * 80, y: 12 + Math.random() * 68, kind: id % 5 } }

function MatchIcon({ type, size = 25 }) {
  const props = { size, strokeWidth: 1.9 }
  if (type === 'flower') return <Flower2 {...props} />
  if (type === 'star') return <Star {...props} />
  if (type === 'heart') return <Heart {...props} />
  if (type === 'cloud') return <Cloud {...props} />
  if (type === 'moon') return <MoonStar {...props} />
  if (type === 'milk') return <Milk {...props} />
  if (type === 'leaf') return <Leaf {...props} />
  return <Droplets {...props} />
}

function MamaMatchScreen({ data, go, setGameScore }) {
  const makeCards = () => shuffle([...MATCH_TYPES, ...MATCH_TYPES]).map((type, index) => ({ id: index, type, open: false, matched: false }))
  const [cards, setCards] = useState(makeCards)
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const open = cards.filter(card => card.open && !card.matched)
  const done = cards.every(card => card.matched)
  useEffect(() => { if (done) return undefined; const timer = setInterval(() => setSeconds(value => value + 1), 1000); return () => clearInterval(timer) }, [done])
  useEffect(() => { if (done && seconds) setGameScore('mamaMatch', seconds) }, [done, seconds, setGameScore])
  const flip = id => { if (open.length >= 2) return; const next = cards.map(card => card.id === id ? { ...card, open: true } : card); setCards(next); const opened = next.filter(card => card.open && !card.matched); if (opened.length === 2) { setMoves(value => value + 1); setTimeout(() => setCards(current => { const pair = current.filter(card => card.open && !card.matched); if (pair.length !== 2) return current; const [a, b] = pair; return a.type === b.type ? current.map(card => card.id === a.id || card.id === b.id ? { ...card, matched: true } : card) : current.map(card => card.id === a.id || card.id === b.id ? { ...card, open: false } : card) }), 500) } }
  const restart = () => { setCards(makeCards()); setMoves(0); setSeconds(0) }
  return <div className="screen night game-screen match-screen"><ScreenHeader title="Mama Match" go={go} back="pump" night /><NightStars /><div className="match-hud"><strong>{toClock(seconds)}</strong><span>Moves<b>{moves}</b></span></div><div className="match-grid">{cards.map(card => <button key={card.id} className={`match-card ${(card.open || card.matched) ? `open match-${card.type}` : ''}`} onClick={() => flip(card.id)} aria-label="Match card">{(card.open || card.matched) ? <MatchIcon type={card.type} /> : <Flower2 size={20} />}</button>)}</div>{done && <div className="game-over"><strong>Matched in {seconds}s</strong><button className="pink-button" onClick={restart}>Play Again</button></div>}</div>
}

function SettingsScreen({ data, go, setData, updateSettings, installPrompt }) {
  const [goal, setGoal] = useState(data.settings.dailyGoal)
  const exportData = () => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'milky-mama-data.json'; link.click(); URL.revokeObjectURL(url) }
  return <div className="screen light settings-screen"><ScreenHeader title="Settings" go={go} /><div className="settings-list"><SettingRow label="Daily Goal"><div className="inline-input"><input type="number" min="1" value={goal} onChange={event => { const value = Number(event.target.value || 24); setGoal(value); updateSettings({ dailyGoal: value }) }} /><span>oz</span></div></SettingRow><SettingRow label="Preferred Unit"><select value={data.settings.unit} onChange={event => updateSettings({ unit: event.target.value })}><option>oz</option><option>mL</option></select></SettingRow><SettingRow label="Haptics"><Switch checked={data.settings.haptics} onChange={value => updateSettings({ haptics: value })} /></SettingRow><SettingRow label="Sounds"><Switch checked={data.settings.sounds} onChange={value => updateSettings({ sounds: value })} /></SettingRow><SettingRow label="Reduce Motion"><Switch checked={data.settings.reduceMotion} onChange={value => updateSettings({ reduceMotion: value })} /></SettingRow><SettingRow label="Notifications"><Switch checked={data.settings.notifications} onChange={value => updateSettings({ notifications: value })} /></SettingRow></div><div className="settings-actions"><button onClick={exportData}><span>Export Data (JSON)</span><ChevronRight size={14} /></button><button onClick={() => setData(current => ({ ...current, gameScores: defaultData.gameScores }))}><span>Reset Game Scores</span><ChevronRight size={14} /></button><button onClick={() => setData(current => ({ ...current, sessions: [] }))}><span>Reset Session History</span><ChevronRight size={14} /></button><button className="danger" onClick={() => { if (confirm('Delete all Milky Mama data on this device?')) setData(defaultData) }}><span>Delete All Data</span></button></div>{installPrompt && <button className="install-row" onClick={() => installPrompt.prompt()}><Download size={16} /><span>Install Milky Mama</span><ChevronRight size={14} /></button>}</div>
}

function SettingRow({ label, children }) { return <div className="setting-row"><span>{label}</span>{children}</div> }
function Switch({ checked, onChange }) { return <button className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-label={checked ? 'On' : 'Off'}><span /></button> }
function stashStatus(item) { const age = (Date.now() - new Date(item.storedAt).getTime()) / 86400000; if (item.location === 'Fridge' && age > 3) return { label: 'Use Soon', tone: 'soon' }; if (age <= 2) return { label: 'Fresh', tone: 'fresh' }; return { label: 'Good', tone: 'good' } }
function toClock(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }
function relativeTime(date) { const mins = Math.floor((Date.now() - date.getTime()) / 60000); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h ${mins % 60}m ago`; return `${Math.floor(hours / 24)}d ago` }
function sumLocation(stash, location) { return stash.filter(item => item.location === location).reduce((sum, item) => sum + Number(item.ounces), 0) }
function calcStreak(sessions) { const days = [...new Set(sessions.map(session => new Date(session.startedAt).toDateString()))]; let streak = 0; const date = new Date(); for (let i = 0; i < 365; i += 1) { if (days.includes(date.toDateString())) streak += 1; else if (i > 0) break; date.setDate(date.getDate() - 1) } return streak }
function dailyBuckets(sessions, count) { const result = []; for (let i = count - 1; i >= 0; i -= 1) { const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i); const end = new Date(start); end.setDate(end.getDate() + 1); const value = sessions.filter(session => { const when = new Date(session.startedAt); return when >= start && when < end }).reduce((sum, session) => sum + Number(session.ounces), 0); result.push({ label: start.toLocaleDateString(undefined, { weekday: 'narrow' }), value }) } return result }
function groupSessions(sessions) { return sessions.reduce((groups, session) => { const key = new Date(session.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); (groups[key] ??= []).push(session); return groups }, {}) }
function getAchievements(data) { const count = data.sessions.length, total = data.sessions.reduce((sum, session) => sum + Number(session.ounces), 0), streak = calcStreak(data.sessions), stored = data.stash.reduce((sum, item) => sum + Number(item.ounces), 0); return [{ id: 'first', title: 'First Drop', desc: 'Log your first session', unlocked: count >= 1, progress: `${count}/1` }, { id: 'start', title: 'Getting Started', desc: 'Log 5 sessions', unlocked: count >= 5, progress: `${Math.min(count, 5)}/5` }, { id: 'track', title: 'Keeping Track', desc: 'Log 25 sessions', unlocked: count >= 25, progress: `${Math.min(count, 25)}/25` }, { id: 'routine', title: 'Routine Builder', desc: 'Reach a 3 day logging streak', unlocked: streak >= 3, progress: `${Math.min(streak, 3)}/3` }, { id: 'stash', title: 'Stash Starter', desc: 'Store 20 ounces', unlocked: stored >= 20, progress: `${Math.min(Math.round(stored), 20)}/20` }, { id: 'fifty', title: 'Fifty Ounces', desc: 'Pump 50 ounces total', unlocked: total >= 50, progress: `${Math.min(Math.round(total), 50)}/50` }] }
function shuffle(items) { return [...items].sort(() => Math.random() - 0.5) }
