import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import * as XLSX from "xlsx-js-style"
import { CalendarDays, Car, ChevronLeft, ChevronRight, Download, Loader2, LogIn, LogOut, Plus, RefreshCw, Settings, UserPlus, Users, X } from "lucide-react"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ""
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ""
const configured = Boolean(SUPABASE_URL && SUPABASE_KEY)
const monthName = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" })
const money = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 })
const PERSON_STYLES = [
  { color: "bg-blue-500", soft: "bg-blue-50 border-blue-200 text-blue-800" },
  { color: "bg-emerald-500", soft: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { color: "bg-amber-500", soft: "bg-amber-50 border-amber-200 text-amber-800" },
  { color: "bg-violet-500", soft: "bg-violet-50 border-violet-200 text-violet-800" },
  { color: "bg-rose-500", soft: "bg-rose-50 border-rose-200 text-rose-800" },
  { color: "bg-cyan-500", soft: "bg-cyan-50 border-cyan-200 text-cyan-800" },
]

function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` }
function formatDate(value) { return value ? new Intl.DateTimeFormat("cs-CZ").format(new Date(`${value}T12:00:00`)) : "" }
function directionLabel(direction) { return direction === "round" ? "Tam i zpět" : direction === "back" ? "Pouze zpět" : "Pouze tam" }
function styleFor(index) { return PERSON_STYLES[index % PERSON_STYLES.length] }

async function api(path, { method="GET", token, body }={}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" || method === "PATCH" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  if (text) { try { data = JSON.parse(text) } catch { data = text } }
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || "Požadavek se nepodařil.")
  return data
}

function getStoredSession() {
  try { return JSON.parse(localStorage.getItem("travel-session") || "null") } catch { return null }
}

export default function App() {
  const [session, setSession] = useState(getStoredSession)
  const [people, setPeople] = useState([])
  const [trips, setTrips] = useState([])
  const [cursor, setCursor] = useState(new Date())
  const [selectedPeople, setSelectedPeople] = useState([])
  const [showTripForm, setShowTripForm] = useState(false)
  const [showPersonForm, setShowPersonForm] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newPerson, setNewPerson] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ personId:"", date:isoDate(new Date()), direction:"round", purpose:"", amount:"" })

  const year = cursor.getFullYear(), month = cursor.getMonth()
  const firstDay = new Date(year, month, 1)
  const mondayOffset = (firstDay.getDay()+6)%7
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = Array.from({length:42}, (_,i) => { const d=i-mondayOffset+1; return d>=1 && d<=daysInMonth ? d : null })

  async function loadData() {
    if (!session?.access_token) return
    setLoading(true); setError("")
    try {
      const [peopleData,tripsData] = await Promise.all([
        api("/rest/v1/people?select=*&order=created_at.asc", {token:session.access_token}),
        api("/rest/v1/trips?select=*&order=date.asc", {token:session.access_token}),
      ])
      const styled = peopleData.map((p,i)=>({...p,...styleFor(i)}))
      setPeople(styled)
      setSelectedPeople(cur => cur.length ? cur.filter(id=>styled.some(p=>p.id===id)) : styled.map(p=>p.id))
      setTrips(tripsData.map(t=>({...t,personId:t.person_id})))
      if (!form.personId && styled[0]) setForm(cur=>({...cur,personId:styled[0].id}))
    } catch(e) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(()=>{ loadData() },[session?.access_token])

  const monthTrips = useMemo(()=>trips.filter(t=>{
    const d=new Date(`${t.date}T12:00:00`)
    return d.getFullYear()===year && d.getMonth()===month && selectedPeople.includes(t.personId)
  }),[trips,year,month,selectedPeople])
  const total=monthTrips.reduce((s,t)=>s+Number(t.amount),0)
  const roundTrips=monthTrips.filter(t=>t.direction==="round").length

  function shiftMonth(delta){ setCursor(new Date(year,month+delta,1)) }
  function togglePerson(id){ setSelectedPeople(cur=>cur.includes(id)?cur.filter(x=>x!==id):[...cur,id]) }
  function openForDate(date){ setEditingTrip(null); setForm(cur=>({...cur,personId:cur.personId||people[0]?.id||"",date,purpose:"",amount:"",direction:"round"})); setShowTripForm(true) }
  function openEditTrip(trip){ setEditingTrip(trip); setConfirmDelete(false); setForm({personId:trip.personId,date:trip.date,direction:trip.direction,purpose:trip.purpose||"",amount:String(trip.amount)}); setShowTripForm(true) }
  function logout(){ localStorage.removeItem("travel-session"); setSession(null); setPeople([]); setTrips([]); setSelectedPeople([]) }

  async function submitTrip(e){
    e.preventDefault(); setLoading(true); setError("")
    try {
      const payload={person_id:form.personId,date:form.date,direction:form.direction,purpose:form.purpose.trim(),amount:Number(form.amount||0)}
      if(editingTrip){
        const rows=await api(`/rest/v1/trips?id=eq.${editingTrip.id}`,{method:"PATCH",token:session.access_token,body:payload})
        const saved=rows[0]
        setTrips(cur=>cur.map(t=>t.id===editingTrip.id?{...saved,personId:saved.person_id}:t))
      } else {
        const rows=await api("/rest/v1/trips",{method:"POST",token:session.access_token,body:{...payload,created_by:session.user.id}})
        const saved=rows[0]
        setTrips(cur=>[...cur,{...saved,personId:saved.person_id}])
      }
      setShowTripForm(false); setEditingTrip(null); setConfirmDelete(false); setForm(cur=>({...cur,purpose:"",amount:""}))
    } catch(e){ setError(e.message) } finally { setLoading(false) }
  }
  async function deleteTrip(){
    if(!editingTrip)return
    setLoading(true); setError("")
    try {
      await api(`/rest/v1/trips?id=eq.${editingTrip.id}`,{method:"DELETE",token:session.access_token})
      setTrips(cur=>cur.filter(t=>t.id!==editingTrip.id))
      setShowTripForm(false); setEditingTrip(null); setConfirmDelete(false)
    } catch(e){ setError(e.message) } finally { setLoading(false) }
  }
  async function addPerson(e){
    e.preventDefault(); const name=newPerson.trim(); if(!name)return
    setLoading(true); setError("")
    try {
      const rows=await api("/rest/v1/people",{method:"POST",token:session.access_token,body:{name,created_by:session.user.id}})
      const person={...rows[0],...styleFor(people.length)}
      setPeople(cur=>[...cur,person]); setSelectedPeople(cur=>[...cur,person.id]); setForm(cur=>({...cur,personId:person.id}))
      setNewPerson(""); setShowPersonForm(false)
    } catch(e){ setError(e.message) } finally { setLoading(false) }
  }

  function exportExcel(){
    if(!monthTrips.length){ setError("Pro vybraný měsíc nejsou žádné cesty k exportu."); return }
    try {
      const rows=[...monthTrips].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>{
        const p=people.find(x=>x.id===t.personId)
        return {Datum:formatDate(t.date),Osoba:p?.name||"Neznámá osoba",Směr:directionLabel(t.direction),Poznámka:t.purpose||"","Cestovné (Kč)":Number(t.amount)}
      })
      const ws=XLSX.utils.json_to_sheet(rows)
      ws["!autofilter"]={ref:`A1:E${rows.length+1}`}; ws["!cols"]=[{wch:14},{wch:22},{wch:18},{wch:35},{wch:18}]
      for(let r=1;r<=rows.length;r++){ const a=XLSX.utils.encode_cell({r,c:4}); if(ws[a]) ws[a].z='#,##0 "Kč"' }
      const summary=people.filter(p=>selectedPeople.includes(p.id)).map(p=>{
        const pt=monthTrips.filter(t=>t.personId===p.id)
        return {Osoba:p.name,"Pouze tam":pt.filter(t=>t.direction==="there").length,"Pouze zpět":pt.filter(t=>t.direction==="back").length,"Tam i zpět":pt.filter(t=>t.direction==="round").length,"Celkem cest":pt.length,"Cestovné celkem (Kč)":pt.reduce((s,t)=>s+Number(t.amount),0)}
      }).filter(x=>x["Celkem cest"]>0)
      summary.push({Osoba:"CELKEM","Pouze tam":monthTrips.filter(t=>t.direction==="there").length,"Pouze zpět":monthTrips.filter(t=>t.direction==="back").length,"Tam i zpět":roundTrips,"Celkem cest":monthTrips.length,"Cestovné celkem (Kč)":total})
      const sws=XLSX.utils.aoa_to_sheet([["Měsíční přehled cestovného"],["Období",monthName.format(cursor)],["Počet cest",monthTrips.length],["Cestovné celkem",total],["Export vytvořen",new Date().toLocaleString("cs-CZ")],[]])
      XLSX.utils.sheet_add_json(sws,summary,{origin:"A7"}); sws["!cols"]=[{wch:24},{wch:15},{wch:15},{wch:15},{wch:15},{wch:24}]
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Cesty"); XLSX.utils.book_append_sheet(wb,sws,"Souhrn")
      XLSX.writeFile(wb,`cestovne-${year}-${String(month+1).padStart(2,"0")}.xlsx`)
    } catch(e){ setError(`Export do Excelu se nepodařil: ${e.message}`) }
  }

  if(!configured) return <SetupScreen />
  if(!session) return <LoginScreen onLogin={setSession} />

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="flex items-center gap-3"><div className="rounded-2xl bg-blue-600 p-2.5 text-white"><Car className="h-5 w-5"/></div><div><h1 className="text-xl font-bold">Kalendář spolujízd</h1><p className="text-sm text-slate-500">Přihlášen: {session.user?.email}</p></div></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Obnovit</Button><Button variant="outline" onClick={exportExcel} disabled={!monthTrips.length}><Download className="h-4 w-4"/>Exportovat Excel</Button><Button variant="outline" onClick={()=>setShowPersonForm(true)}><UserPlus className="h-4 w-4"/>Přidat osobu</Button><Button onClick={()=>openForDate(isoDate(new Date()))}><Plus className="h-4 w-4"/>Přidat cestu</Button><Button variant="ghost" onClick={logout}><LogOut className="h-4 w-4"/>Odhlásit</Button></div>
    </div></header>
    <main className="mx-auto max-w-7xl space-y-5 px-5 py-6">
      {error&&<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="grid gap-4 sm:grid-cols-3"><Metric icon={<CalendarDays className="h-5 w-5"/>} label="Cesty tento měsíc" value={monthTrips.length}/><Metric icon={<Car className="h-5 w-5"/>} label="Cesty tam i zpět" value={roundTrips}/><Metric icon={<Users className="h-5 w-5"/>} label="Cestovné celkem" value={money.format(total)}/></section>
      <Card><div className="flex flex-col gap-4 border-b p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-2"><Button variant="outline" onClick={()=>shiftMonth(-1)}><ChevronLeft className="h-4 w-4"/></Button><h2 className="min-w-52 text-center text-lg font-semibold capitalize">{monthName.format(cursor)}</h2><Button variant="outline" onClick={()=>shiftMonth(1)}><ChevronRight className="h-4 w-4"/></Button></div><div className="flex flex-wrap gap-2">{people.map(p=><button key={p.id} onClick={()=>togglePerson(p.id)} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${selectedPeople.includes(p.id)?p.soft:"border-slate-200 bg-white text-slate-400"}`}><span className={`h-2.5 w-2.5 rounded-full ${p.color}`}/>{p.name}</button>)}</div></div>
      <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500">{["Po","Út","St","Čt","Pá","So","Ne"].map(d=><div key={d} className="p-3">{d}</div>)}</div><div className="grid grid-cols-7">{cells.map((day,index)=>{const date=day?`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";const dt=monthTrips.filter(t=>t.date===date);const today=date===isoDate(new Date());return <div key={index} onClick={()=>day&&openForDate(date)} className={`group min-h-32 border-b border-r p-2 ${day?"cursor-pointer bg-white hover:bg-blue-50/50":"bg-slate-50"}`}>{day&&<div className="mb-2 flex items-center justify-between"><div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${today?"bg-blue-600 font-bold text-white":"text-slate-600"}`}>{day}</div><Plus className="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100"/></div>}<div className="space-y-1.5">{dt.map(t=>{const p=people.find(x=>x.id===t.personId);return <motion.div key={t.id} onClick={e=>{e.stopPropagation();openEditTrip(t)}} className={`rounded-lg border px-2 py-2 text-sm ${p?.soft||"bg-slate-50"}`} title={`${p?.name||""} · ${directionLabel(t.direction)}`}><div className="font-semibold">{p?.name}</div><div className="font-bold">{money.format(Number(t.amount))}</div></motion.div>})}</div></div>})}</div></div></div></Card>
    </main>
    {showPersonForm&&<Modal close={()=>setShowPersonForm(false)} title="Nový dojíždějící"><form onSubmit={addPerson} className="space-y-5"><Field label="Jméno"><Input autoFocus required value={newPerson} onChange={e=>setNewPerson(e.target.value)} placeholder="Např. Petr"/></Field><div className="flex justify-end gap-3"><Button variant="outline" onClick={()=>setShowPersonForm(false)}>Zrušit</Button><Button type="submit" disabled={loading}>Přidat</Button></div></form></Modal>}
    {showTripForm&&<Modal close={()=>{setShowTripForm(false);setEditingTrip(null);setConfirmDelete(false)}} title={editingTrip?"Upravit cestu":"Nová cesta"}><form onSubmit={submitTrip} className="space-y-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Koho vezeš"><Select required value={form.personId} onChange={e=>setForm({...form,personId:e.target.value})}><option value="" disabled>Vyber osobu</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field><Field label="Datum"><Input type="date" required value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Field><Field label="Směr cesty"><Select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option value="round">Tam i zpět</option><option value="there">Pouze tam</option><option value="back">Pouze zpět</option></Select></Field><Field label="Cestovné (Kč)"><Input type="number" min="0" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></Field></div><Field label="Poznámka"><Input value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})}/></Field>{editingTrip&&confirmDelete&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="font-semibold">Opravdu chcete tuto cestu smazat?</p><p className="mt-1">{formatDate(editingTrip.date)} · {directionLabel(editingTrip.direction)} · {money.format(Number(editingTrip.amount))}</p><div className="mt-3 flex gap-2"><Button variant="outline" onClick={()=>setConfirmDelete(false)}>Zrušit</Button><Button variant="danger" onClick={deleteTrip} disabled={loading}>Potvrdit smazání</Button></div></div>}<div className="flex flex-wrap justify-between gap-3"><div>{editingTrip&&!confirmDelete&&<Button variant="danger" onClick={()=>setConfirmDelete(true)}>Smazat</Button>}</div><div className="flex gap-3"><Button variant="outline" onClick={()=>{setShowTripForm(false);setEditingTrip(null);setConfirmDelete(false)}}>Zrušit</Button><Button type="submit" disabled={loading}>{editingTrip?"Uložit změny":"Uložit cestu"}</Button></div></div></form></Modal>}
  </div>
}

function LoginScreen({onLogin}){
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [loading,setLoading]=useState(false); const [error,setError]=useState("")
  async function login(e){e.preventDefault();setLoading(true);setError("");try{const data=await api("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password}});localStorage.setItem("travel-session",JSON.stringify(data));onLogin(data)}catch(err){setError(err.message)}finally{setLoading(false)}}
  return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><Card className="w-full max-w-md p-6"><div className="mb-5 w-fit rounded-2xl bg-blue-600 p-3 text-white"><Car className="h-6 w-6"/></div><h1 className="text-2xl font-bold">Evidence cestovného</h1><p className="mb-5 mt-1 text-sm text-slate-500">Přihlas se účtem vytvořeným v Supabase.</p><form onSubmit={login} className="space-y-4"><Field label="E-mail"><Input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Heslo"><Input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>{error&&<p className="text-sm text-red-600">{error}</p>}<Button type="submit" disabled={loading} className="w-full">{loading?<Loader2 className="h-4 w-4 animate-spin"/>:<LogIn className="h-4 w-4"/>}Přihlásit</Button></form></Card></div>
}
function SetupScreen(){return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><Card className="w-full max-w-2xl p-6"><div className="mb-4 w-fit rounded-2xl bg-amber-100 p-3 text-amber-700"><Settings className="h-6 w-6"/></div><h1 className="text-2xl font-bold">Dokonči připojení k Supabase</h1><p className="mt-2 text-sm text-slate-500">V kořeni projektu vytvoř soubor .env.local a vlož do něj:</p><pre className="mt-5 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">VITE_SUPABASE_URL=https://tvuj-projekt.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxx</pre></Card></div>}
function Button({children,className="",variant="default",type="button",...props}){const v={default:"border-blue-600 bg-blue-600 text-white hover:bg-blue-700",outline:"border-slate-300 bg-white text-slate-700 hover:bg-slate-50",ghost:"border-transparent bg-transparent text-slate-600 hover:bg-slate-100",danger:"border-red-600 bg-red-600 text-white hover:bg-red-700"};return <button type={type} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition disabled:opacity-50 ${v[variant]} ${className}`} {...props}>{children}</button>}
function Card({children,className=""}){return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>}
function Input({className="",...props}){return <input className={`h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${className}`} {...props}/>}
function Select({children,...props}){return <select className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500" {...props}>{children}</select>}
function Field({label,children}){return <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>}
function Metric({icon,label,value}){return <Card className="p-5"><div className="flex items-center gap-4"><div className="rounded-xl bg-blue-50 p-3 text-blue-600">{icon}</div><div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div></div></Card>}
function Modal({close,title,children}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><motion.div initial={{opacity:0,scale:.97}} animate={{opacity:1,scale:1}} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><Button variant="ghost" onClick={close}><X className="h-5 w-5"/></Button></div>{children}</motion.div></div>}
