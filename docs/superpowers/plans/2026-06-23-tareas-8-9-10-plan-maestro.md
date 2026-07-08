# TAREAS 8-9-10 Plan Maestro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. ONE sub-task at a time. Get Diego's OK before each commit.

**Goal:** Flujo completo mecanico (TAREA 8) + verificar GPS tracking (TAREA 9) + panel usuario PC (TAREA 10).

**Architecture:** Todo va por /api/auth con service key (patron ya establecido). Sin nuevos archivos /api/. mechanic.js tiene modal de cierre completo ya escrito — el problema es que usa sb.from() directo (bloqueado por RLS). TAREA 10 agrega panel en landing.html usando roles existentes.

**Tech Stack:** Vanilla JS, Supabase REST (service key), /api/auth multi-role, Supabase Storage bucket 'job-photos'.

---

## Estado actual del codigo (leido 23 Jun 2026)

### Lo que YA EXISTE en mechanic.js (no reescribir):
- `openCompleteModal(id)` (linea 409): modal completo con checklist, fotos, partes, firma, fecha proximo servicio
- `submitComplete(id)` (linea 574): recoge todos los datos, sube fotos, llama emails/SMS. **PROBLEMA: usa sb.from('bookings').update() directo → RLS bloquea**
- `saveChecklist()` (linea 995): guarda checklist + started_at. **PROBLEMA: usa sb.from() directo → RLS bloquea**
- `saveNotes(id, notes)` (linea 692): guarda mechanic_notes. **PROBLEMA: usa sb.from() directo → RLS bloquea**
- `completeService()` (linea 871): timer complete. **PROBLEMA: usa sb.from() directo → RLS bloquea**
- Fotos suben a bucket 'job-photos' (uploadPhoto funcion linea 562)

### Lo que FALTA en mechanic.js:
- Botones Accept/Reject (solo existe swipe derecha que hace setStatus 'confirmed')
- Boton "🏠 Arrived" para jobs en estado enroute
- Los 5 sb.from() que escriben en bookings → necesitan ir por API

### Lo que YA EXISTE en api/auth.js (no tocar):
- `handleMechanicUpdateStatus` (lineas 151-179): actualiza status con service key. Acepta: pending, confirmed, enroute, in_progress, completed, cancelled
- `handlePublicTrack` (lineas 181-306): lee booking + mechanic_location con service key. Ya funciona.
- 10 roles activos. Archivo tiene 324 lineas.

### TAREA 9 - estado real:
`handlePublicTrack` ya retorna `mechanic_location: {lat, lng}` desde mechanic_locations con service key (sin filtro is_online). track.html ya tiene 15s polling. **TAREA 9 esta 95% implementada.** El unico pendiente es que el GPS del mecanico llegue a mechanic_locations — diagnostico en marcha con toasts en mechanic.js.

---

## SQL COMPLETO PARA CORRER EN SUPABASE (antes de ejecutar cualquier tarea)

```sql
-- Columnas nuevas en bookings (para TAREA 8)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS photo_before_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS photo_after_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_signature_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS next_service_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS next_service_type TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_duration_seconds INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_service_checklist JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_service_notes TEXT;

-- parts_used ya existe como TEXT (lo usan sendInvoice), no agregar

-- Verificar que mechanic_id existe (ya deberia existir)
-- SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name='mechanic_id';
```

**Paso manual en Supabase Dashboard:**
Storage → New bucket → Nombre: `job-photos` → Publico: SI → Create

Si el bucket ya existe, verificar que tiene policy: `INSERT, SELECT` para `anon` role.

---

## TAREA 8 — Flujo completo mecanico

### Archivos a tocar
- Modify: `api/auth.js` (~324 lineas) — agregar 5 handlers nuevos + dispatch
- Modify: `js/mechanic.js` (~1350 lineas) — card(), submitComplete(), saveChecklist(), saveNotes(), completeService()
- Modify: `sw.js` — bump version v18 → v19
- Modify: `mechanic.html` — bump ?v= en script tag

**Riesgos:**
- Si uploadPhoto() falla (bucket no existe), fotos silenciosamente null → plan: en submitComplete, mostrar toast si foto falla pero no bloquear cierre
- mechanic.js usa `sb.from()` en saveNotes (linea 692) que se llama al perder focus en textarea → si RLS bloquea, el error es silencioso. Plan: mostrar toast de error.
- client_signature es base64 PNG ~100KB → entra dentro del limite de 4.5MB de Vercel

---

### Task 8-1: Roles mechanic-accept, mechanic-reject, mechanic-arrived en api/auth.js

**Files:** Modify `api/auth.js` — insertar antes de `handleClientCancel`

- [ ] **Step 1: Leer api/auth.js para confirmar punto de insercion**

Confirmar que la funcion `handleClientCancel` empieza en linea ~122 (puede haber variado con los commits anteriores). El bloque nuevo va ANTES de handleClientCancel.

- [ ] **Step 2: Insertar los 3 handlers**

Insertar despues del cierre de `handleMechanicLocation` (linea ~96) y antes de `handleClientCancel`:

```javascript
async function handleMechanicAccept(req, res) {
  const { pin, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ mechanic_id: mechanic.id }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to accept booking' });
  return res.status(200).json({ ok: true, mechanic_name: mechanic.name });
}

async function handleMechanicReject(req, res) {
  const { pin, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'pending', mechanic_id: null }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to reject booking' });
  return res.status(200).json({ ok: true });
}

async function handleMechanicArrived(req, res) {
  const { pin, booking_id } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'in_progress', arrived_at: new Date().toISOString() }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to mark arrived' });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 3: Wiring en dispatch**

En el bloque `export default async function handler`, agregar antes de `return handleAdmin(req, res)`:

```javascript
  if (role === 'mechanic-accept') return handleMechanicAccept(req, res);
  if (role === 'mechanic-reject') return handleMechanicReject(req, res);
  if (role === 'mechanic-arrived') return handleMechanicArrived(req, res);
```

- [ ] **Step 4: Syntax check**

```bash
node --check api/auth.js && echo OK
```

Expected: `OK`

- [ ] **Step 5: Commit (esperando OK de Diego)**

```bash
git add api/auth.js
git commit -m "feat: mechanic-accept, mechanic-reject, mechanic-arrived API roles"
```

---

### Task 8-2: Role mechanic-checklist en api/auth.js

**Files:** Modify `api/auth.js` — insertar despues de handleMechanicArrived

- [ ] **Step 1: Insertar handleMechanicChecklist**

Insertar inmediatamente despues del cierre de `handleMechanicArrived`:

```javascript
async function handleMechanicChecklist(req, res) {
  const { pin, booking_id, checklist, notes } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        started_at: new Date().toISOString(),
        pre_service_checklist: checklist || null,
        pre_service_notes: notes || null,
      }),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to save checklist' });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Wiring en dispatch**

```javascript
  if (role === 'mechanic-checklist') return handleMechanicChecklist(req, res);
```

- [ ] **Step 3: Syntax check**

```bash
node --check api/auth.js && echo OK
```

Expected: `OK`

---

### Task 8-3: Role mechanic-complete en api/auth.js

**Files:** Modify `api/auth.js` — insertar despues de handleMechanicChecklist

- [ ] **Step 1: Insertar handleMechanicComplete**

```javascript
async function handleMechanicComplete(req, res) {
  const { pin, booking_id, mechanic_notes, parts_used, photo_before_url, photo_after_url, client_signature_url, next_service_date, duration_seconds } = req.body;
  if (!pin || String(pin).trim().length < 4) return res.status(401).json({ error: 'PIN required' });
  if (!booking_id) return res.status(400).json({ error: 'booking_id required' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const contactsResp = await fetch(`${SUPABASE_URL}/rest/v1/escalation_contacts?select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!contactsResp.ok) return res.status(500).json({ error: 'Database error' });
  const contacts = await contactsResp.json();
  const mechanic = contacts.find(c => c.phone && c.phone.replace(/[\s+\-()\s]/g, '').slice(-4) === String(pin).trim());
  if (!mechanic) return res.status(401).json({ error: 'Invalid PIN' });

  const payload = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    mechanic_notes: mechanic_notes || null,
    parts_used: parts_used || null,
    next_service_date: next_service_date || null,
  };
  if (photo_before_url) payload.photo_before_url = photo_before_url;
  if (photo_after_url) payload.photo_after_url = photo_after_url;
  if (client_signature_url) payload.client_signature_url = client_signature_url;
  if (duration_seconds) payload.service_duration_seconds = duration_seconds;

  const updateResp = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking_id)}`,
    {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    }
  );
  if (!updateResp.ok) return res.status(500).json({ error: 'Failed to complete booking' });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 2: Wiring en dispatch**

```javascript
  if (role === 'mechanic-complete') return handleMechanicComplete(req, res);
```

- [ ] **Step 3: Syntax check**

```bash
node --check api/auth.js && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit (esperando OK de Diego)**

```bash
git add api/auth.js
git commit -m "feat: mechanic-checklist, mechanic-complete API roles"
```

---

### Task 8-4: Botones Accept/Reject/Arrived en mechanic.js card()

**Files:** Modify `js/mechanic.js` lineas 282-322 (funcion `card`)

Contexto: `card(j)` retorna HTML del job card. Actualmente la seccion de botones (linea 309-317):
```javascript
<div class="actions">
  <button class="abtn nav" onclick="openMaps('${addr}')">📍 Navigate</button>
  <button class="abtn" onclick="openMechChat('${j.id}')">...</button>
  <button class="abtn chat" onclick="openWA(...)">...</button>
  <button class="abtn" onclick="openClientHistory(...)">📋 History</button>
  ${!done?`${st!=='enroute'?`<button class="abtn go" onclick="setStatus('${j.id}','enroute')">🚐 En route</button>`:''}
  <button class="abtn done" onclick="completeJob('${j.id}')">✅ Complete</button>`
  :`<button class="abtn undo" onclick="setStatus('${j.id}','confirmed')">↩ Undo</button>`}
</div>
```

- [ ] **Step 1: Agregar variables para logica de botones**

En la funcion `card(j)`, despues de `const isEnroute = st==='enroute';` (linea ~291), agregar:

```javascript
  const isConfirmedNoMechanic = st === 'confirmed' && !j.mechanic_id;
  const isInProgress = st === 'in_progress';
```

Nota: `j.mechanic_id` requiere que `handleMechanicJobs` incluya `mechanic_id` en los cols. Verificar en auth.js linea ~58 que el select incluye mechanic_id. Si no, agregar.

- [ ] **Step 2: Reemplazar la seccion de botones de accion**

Localizar (linea ~309-317):
```javascript
    <div class="actions">
      <button class="abtn nav" onclick="openMaps('${addr}')">📍 Navigate</button>
      <button class="abtn" onclick="openMechChat('${j.id}')" style="background:rgba(24,72,200,0.1);color:#1848C8">💬 Chat</button>
      <button class="abtn chat" onclick="openWA('${j.phone||j.email||""}','${j.client.replace(/'/g,"\\'")}')">💬 WhatsApp</button>
      <button class="abtn" onclick="openClientHistory('${j.id}','${j.client.replace(/'/g,"\\'")}','${j.client_id||""}')" style="background:rgba(5,150,105,0.1);color:#059669">📋 History</button>
      ${!done?`${st!=='enroute'?`<button class="abtn go" onclick="setStatus('${j.id}','enroute')">🚐 En route</button>`:''}
      <button class="abtn done" onclick="completeJob('${j.id}')">✅ Complete</button>`
      :`<button class="abtn undo" onclick="setStatus('${j.id}','confirmed')">↩ Undo</button>`}
    </div>
```

Reemplazar con:
```javascript
    <div class="actions">
      <button class="abtn nav" onclick="openMaps('${addr}')">📍 Navigate</button>
      <button class="abtn" onclick="openMechChat('${j.id}')" style="background:rgba(24,72,200,0.1);color:#1848C8">💬 Chat</button>
      <button class="abtn chat" onclick="openWA('${j.phone||j.email||""}','${j.client.replace(/'/g,"\\'")}')">💬 WhatsApp</button>
      <button class="abtn" onclick="openClientHistory('${j.id}','${j.client.replace(/'/g,"\\'")}','${j.client_id||""}')" style="background:rgba(5,150,105,0.1);color:#059669">📋 History</button>
      ${isConfirmedNoMechanic ? `
        <button class="abtn go" onclick="acceptJob('${j.id}')" style="background:rgba(5,150,105,0.15);color:#059669;font-weight:700">✅ Accept</button>
        <button class="abtn" onclick="rejectJob('${j.id}')" style="background:rgba(220,38,38,0.1);color:#DC2626">✗ Reject</button>
      ` : ''}
      ${!done && !isConfirmedNoMechanic ? `
        ${st !== 'enroute' && st !== 'in_progress' ? `<button class="abtn go" onclick="setStatus('${j.id}','enroute')">🚐 En route</button>` : ''}
        ${isEnroute ? `<button class="abtn" onclick="markArrived('${j.id}')" style="background:rgba(5,150,105,0.15);color:#059669">🏠 Arrived</button>` : ''}
        <button class="abtn done" onclick="completeJob('${j.id}')">✅ Complete</button>
      ` : ''}
      ${done ? `<button class="abtn undo" onclick="setStatus('${j.id}','confirmed')">↩ Undo</button>` : ''}
    </div>
```

- [ ] **Step 3: Agregar funciones acceptJob, rejectJob, markArrived**

Despues de `async function setStatus(id, status) { ... }` (linea ~357), agregar:

```javascript
async function acceptJob(id) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'mechanic-accept', pin: stored.pin || '', booking_id: id }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    toast('Error: ' + (err.error || 'Could not accept job'));
    return;
  }
  const data = await resp.json();
  const j = jobs.find(x => x.id === id);
  if (j) { j.mechanic_id = mechanic?.id || 'assigned'; }
  render(); badges();
  toast('✅ Job accepted!');
  if (j) sendClientPush(j.client_id, {
    title: '🔧 Mechanic assigned',
    body: `${data.mechanic_name || 'Your mechanic'} has accepted your booking. You'll be notified when they're on the way.`,
    url: '/',
    tag: 'booking-accepted-' + id
  });
}

async function rejectJob(id) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'mechanic-reject', pin: stored.pin || '', booking_id: id }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    toast('Error: ' + (err.error || 'Could not reject job'));
    return;
  }
  const j = jobs.find(x => x.id === id);
  if (j) { j.status = 'pending'; j.mechanic_id = null; }
  render(); badges();
  toast('Job returned to pool');
}

async function markArrived(id) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'mechanic-arrived', pin: stored.pin || '', booking_id: id }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    toast('Error: ' + (err.error || 'Could not mark arrived'));
    return;
  }
  const j = jobs.find(x => x.id === id);
  if (j) j.status = 'in_progress';
  render(); badges();
  toast('🏠 Arrived — service timer will start with checklist');
  stopRouteTimer(id);
}
```

- [ ] **Step 4: Verificar que handleMechanicJobs incluye mechanic_id en cols**

En `api/auth.js` funcion `handleMechanicJobs` (~linea 58):
```javascript
const cols = 'id,client_id,client_name,client_email,client_phone,service_name,service_price,scheduled_date,scheduled_time,status,suburb,address,van_number,notes,mechanic_notes,client_rating,client_review';
```

Agregar `mechanic_id` a los cols:
```javascript
const cols = 'id,client_id,client_name,client_email,client_phone,service_name,service_price,scheduled_date,scheduled_time,status,suburb,address,van_number,notes,mechanic_notes,client_rating,client_review,mechanic_id';
```

Y en mechanic.js, donde se mapean los datos del job (buscar la funcion `load()` o donde se construye el objeto job), verificar que `mechanic_id` se incluye en el objeto `j`. Si los datos de API se usan directamente (j.mechanic_id deberia existir si el col esta en la query).

- [ ] **Step 5: Syntax check**

```bash
node --check js/mechanic.js && echo OK
node --check api/auth.js && echo OK
```

Expected: `OK OK`

- [ ] **Step 6: Commit (esperando OK de Diego)**

```bash
git add js/mechanic.js api/auth.js
git commit -m "feat: Accept/Reject/Arrived buttons for mechanic job flow"
```

---

### Task 8-5: Fix RLS en submitComplete, saveChecklist, saveNotes, completeService

**Files:** Modify `js/mechanic.js` — 4 funciones

**Contexto:** Estas 4 funciones usan sb.from('bookings').update() directo → RLS bloquea silenciosamente. Hay que reemplazarlas con fetch a /api/auth.

- [ ] **Step 1: Reemplazar saveNotes (linea 692)**

Localizar:
```javascript
async function saveNotes(id,notes){ await sb.from('bookings').update({mechanic_notes:notes}).eq('id',id); }
```

Reemplazar con:
```javascript
async function saveNotes(id, notes) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-update-status', pin: stored.pin || '', booking_id: id, status: jobs.find(x=>x.id===id)?.status || 'confirmed', mechanic_notes: notes }),
    });
    if (!resp.ok) toast('Could not save notes');
  } catch(e) { toast('Notes save error: ' + e.message); }
}
```

Nota: mechanic-update-status solo acepta `status`. Para notas necesitamos un rol separado. Alternativa mas simple: agregar `mechanic_notes` como campo opcional en `handleMechanicUpdateStatus` — si viene en el body, lo incluye en el PATCH.

Implementar opcion simple: modificar `handleMechanicUpdateStatus` en api/auth.js para aceptar `mechanic_notes` opcional:

En `handleMechanicUpdateStatus`, cambiar:
```javascript
body: JSON.stringify({ status, ...(status === 'enroute' ? { mechanic_id: mechanic.id } : {}) }),
```
a:
```javascript
body: JSON.stringify({ status, mechanic_notes: mechanic_notes || undefined, ...(status === 'enroute' ? { mechanic_id: mechanic.id } : {}) }),
```

Y al inicio de la funcion agregar `mechanic_notes` al destructuring:
```javascript
const { pin, booking_id, status, mechanic_notes } = req.body;
```

Y actualizar `saveNotes` en mechanic.js:
```javascript
async function saveNotes(id, notes) {
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const j = jobs.find(x => x.id === id);
  if (!j) return;
  try {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'mechanic-update-status', pin: stored.pin || '', booking_id: id, status: j.status, mechanic_notes: notes }),
    });
    if (!resp.ok) toast('Could not save notes');
  } catch(e) { toast('Notes error: ' + e.message); }
}
```

- [ ] **Step 2: Reemplazar saveChecklist (linea 995-1018)**

Localizar el bloque dentro de `saveChecklist()`:
```javascript
  if (checklistBookingId && sb) {
    await sb.from('bookings').update({
      started_at: new Date().toISOString(),
      pre_service_checklist: JSON.stringify(checklistState),
      pre_service_notes: notes
    }).eq('id', checklistBookingId);
  }
```

Reemplazar con:
```javascript
  if (checklistBookingId) {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'mechanic-checklist', pin: stored.pin || '', booking_id: checklistBookingId, checklist: checklistState, notes }),
      });
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); toast('Checklist save failed: ' + (err.error||'unknown')); return; }
    } catch(e) { toast('Checklist error: ' + e.message); return; }
  }
```

- [ ] **Step 3: Reemplazar submitComplete (linea 574-687)**

El bloque que escribe en DB (lineas 592-603):
```javascript
  const updateData = {
    status:'completed',
    mechanic_notes: notes,
    parts_used: parts,
    next_service_date: nextDate,
    client_signature: signature,
    completed_at: new Date().toISOString()
  };
  if(photoBeforeUrl) updateData.photo_before = photoBeforeUrl;
  if(photoAfterUrl) updateData.photo_after = photoAfterUrl;

  await sb.from('bookings').update(updateData).eq('id',id);
```

Reemplazar con:
```javascript
  const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
  const duration = activeTimerBookingId === id && serviceStartTime
    ? Math.floor((Date.now() - serviceStartTime) / 1000) : null;

  const resp = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'mechanic-complete',
      pin: stored.pin || '',
      booking_id: id,
      mechanic_notes: notes || null,
      parts_used: parts || null,
      photo_before_url: photoBeforeUrl || null,
      photo_after_url: photoAfterUrl || null,
      client_signature_url: signature || null,
      next_service_date: nextDate || null,
      duration_seconds: duration,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (btn) { btn.textContent = '✅ Complete job'; btn.disabled = false; }
    toast('Error: ' + (err.error || 'Could not complete job'));
    return;
  }
```

- [ ] **Step 4: Reemplazar completeService (timer complete, linea 877-928)**

El bloque que escribe en DB (lineas 877-883):
```javascript
  if (bookingId && sb) {
    await sb.from('bookings').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      service_duration_seconds: duration
    }).eq('id', bookingId);
```

Reemplazar con:
```javascript
  if (bookingId) {
    const stored = JSON.parse(localStorage.getItem('drbike-mech') || '{}');
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'mechanic-complete', pin: stored.pin || '', booking_id: bookingId, duration_seconds: duration }),
      });
      if (!resp.ok) { toast('Could not complete job via timer'); }
    } catch(e) { toast('Timer complete error: ' + e.message); }
```

- [ ] **Step 5: Syntax check**

```bash
node --check js/mechanic.js && echo OK
node --check api/auth.js && echo OK
```

Expected: `OK OK`

- [ ] **Step 6: Bump SW version y cache busting**

En `sw.js`: `drbike-static-v18` → `drbike-static-v19`, `drbike-pages-v18` → `drbike-pages-v19`

En `mechanic.html`: `mechanic.js?v=20260624` → `mechanic.js?v=20260625`

- [ ] **Step 7: Commit y deploy (esperando OK de Diego)**

```bash
git add js/mechanic.js api/auth.js sw.js mechanic.html
git commit -m "feat: mechanic completion flow via server-side API (bypass RLS)"
git push origin main
npx vercel --prod
```

---

## TAREA 9 — GPS tracking en track.html

**Estado: 95% IMPLEMENTADO.**

Lo que ya funciona (desde sesion anterior):
- `handlePublicTrack` en auth.js retorna `mechanic_location: {lat, lng}` desde mechanic_locations con service key (sin filtro is_online)
- track.html hace 15s polling al mismo endpoint
- track.html muestra "Locating mechanic..." mientras espera
- track.html coloca el marker 🚐 cuando llega la ubicacion

**Lo unico pendiente:** Verificar que GPS del mecanico llega a mechanic_locations.
- Con el deploy del 22 Jun, mechanic.js ahora muestra toast si GPS permission es denied
- Si Diego ve el toast "GPS: Location permission denied" en el celular → habilitar permiso en browser settings
- Si Diego ve "📍 Location shared: -XX, XXX" → GPS funciona, esperar que aparezca en track.html en 15s

**No hay codigo nuevo para TAREA 9.** Solo verificacion.

---

## TAREA 10 — Panel usuario PC (landing.html)

### Archivos a tocar
- Modify: `landing.html` (~2600 lineas) — funcion `updateNavForSession` (~linea 1894) + agregar funcion `openAccountPanel()`

**Sin nuevas funciones de /api/** — usa roles existentes: `client-bookings`, `client-cancel`, `client-reschedule`

**Riesgos:**
- landing.html tiene 2600 lineas y es fragil — cambios quirurgicos solamente
- El supabase client en landing.html es `_sb` (no `sb`) — no confundir
- Bikes: `_sb.from('bikes')` puede estar bloqueado por RLS. Plan: si falla, omitir seccion bikes del panel (no es critico)

---

### Task 10-1: Cambiar nav button para abrir panel en vez de sign out

**Files:** Modify `landing.html` linea ~1894-1921 (funcion `updateNavForSession`)

- [ ] **Step 1: Leer lineas 1894-1922 para confirmar codigo actual**

- [ ] **Step 2: Reemplazar el onclick del nav button cuando esta logueado**

Localizar (linea ~1901-1902):
```javascript
    btn.textContent = 'Hi, ' + first;
    btn.onclick = function() { if (confirm('Sign out?')) _sb.auth.signOut(); };
```

Reemplazar con:
```javascript
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ' + first;
    btn.onclick = function() { openAccountPanel(session); };
```

- [ ] **Step 3: Syntax check (validar que el HTML no rompió el script)**

Abrir landing.html en browser y verificar que la navbar carga. No hay node --check para HTML — validacion visual.

---

### Task 10-2: Implementar openAccountPanel()

**Files:** Modify `landing.html` — agregar funcion despues de `updateNavForSession`

- [ ] **Step 1: Insertar openAccountPanel despues del cierre de updateNavForSession (~linea 1922)**

```javascript
function openAccountPanel(session) {
  document.getElementById('account-panel')?.remove();
  var user = session && session.user ? session.user : null;
  if (!user) { openAuthModal(); return; }
  var meta = user.user_metadata || {};
  var name = meta.full_name || meta.name || user.email || '';

  var panel = document.createElement('div');
  panel.id = 'account-panel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5)';
  panel.innerHTML = [
    '<div id="account-panel-inner" style="position:absolute;right:0;top:0;bottom:0;width:min(420px,100vw);background:#fff;display:flex;flex-direction:column;overflow:hidden">',
      '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">',
        '<div>',
          '<div style="font-size:16px;font-weight:700;color:#111827">' + esc(name) + '</div>',
          '<div style="font-size:12px;color:#6b7280">' + esc(user.email || '') + '</div>',
        '</div>',
        '<button id="account-panel-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280">&#215;</button>',
      '</div>',
      '<div style="flex:1;overflow-y:auto;padding:20px 24px">',
        '<div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">My Bookings</div>',
        '<div id="account-bookings" style="min-height:60px;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:13px">Loading...</div>',
      '</div>',
      '<div style="padding:16px 24px;border-top:1px solid #e5e7eb">',
        '<button id="account-signout-btn" style="width:100%;padding:11px;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Sign out</button>',
      '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(panel);

  document.getElementById('account-panel-close').addEventListener('click', function() { panel.remove(); });
  panel.addEventListener('click', function(e) { if (e.target === panel) panel.remove(); });
  document.getElementById('account-signout-btn').addEventListener('click', function() {
    if (confirm('Sign out?')) { _sb.auth.signOut(); panel.remove(); }
  });

  // Load bookings
  _sb.auth.getSession().then(function(res) {
    var sess = res.data && res.data.session ? res.data.session : null;
    if (!sess) return;
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'client-bookings', access_token: sess.access_token, client_id: sess.user.id })
    }).then(function(r) { return r.json(); }).then(function(bookings) {
      var el = document.getElementById('account-bookings');
      if (!el) return;
      var STATUS_COLORS = { pending:'#F59E0B', confirmed:'#0A58CA', enroute:'#22C55E', in_progress:'#22C55E', completed:'#6B7280', cancelled:'#EF4444' };
      var STATUS_LABELS = { pending:'Pending', confirmed:'Confirmed', enroute:'En Route', in_progress:'In Progress', completed:'Completed', cancelled:'Cancelled' };
      if (!bookings || !bookings.length) { el.textContent = 'No bookings yet.'; return; }
      var upcoming = bookings.filter(function(b) { return ['pending','confirmed','enroute','in_progress'].includes(b.status); });
      var past = bookings.filter(function(b) { return ['completed','cancelled'].includes(b.status); });
      var html = '';
      if (upcoming.length) {
        html += '<div style="font-size:11px;font-weight:700;color:#059669;text-transform:uppercase;margin-bottom:8px">Upcoming (' + upcoming.length + ')</div>';
        upcoming.forEach(function(b) {
          var canEdit = b.status === 'pending' || b.status === 'confirmed';
          html += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:8px">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
          html += '<div style="font-size:13px;font-weight:600;color:#111827">' + esc(b.service_name || 'Service') + '</div>';
          html += '<span style="font-size:11px;font-weight:600;color:' + (STATUS_COLORS[b.status]||'#6B7280') + '">' + (STATUS_LABELS[b.status]||b.status) + '</span>';
          html += '</div>';
          html += '<div style="font-size:12px;color:#6b7280">' + esc(b.scheduled_date||'') + (b.scheduled_time ? ' · ' + esc(b.scheduled_time) : '') + '</div>';
          if (canEdit) {
            html += '<div style="display:flex;gap:6px;margin-top:8px">';
            html += '<button class="acct-resched-btn" data-id="' + esc(b.id) + '" data-date="' + esc(b.scheduled_date||'') + '" data-time="' + esc(b.scheduled_time||'08:00') + '" style="flex:1;padding:6px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;font-family:inherit">📅 Reschedule</button>';
            html += '<button class="acct-cancel-btn" data-id="' + esc(b.id) + '" style="flex:1;padding:6px;border:1px solid #fee2e2;border-radius:6px;background:#fff;color:#dc2626;font-size:12px;cursor:pointer;font-family:inherit">Cancel</button>';
            html += '</div>';
          }
          html += '</div>';
        });
      }
      if (past.length) {
        html += '<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-top:16px;margin-bottom:8px">History (' + past.length + ')</div>';
        past.slice(0, 5).forEach(function(b) {
          html += '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:8px">';
          html += '<div style="display:flex;justify-content:space-between">';
          html += '<div style="font-size:13px;font-weight:600;color:#111827">' + esc(b.service_name||'Service') + '</div>';
          html += '<span style="font-size:11px;color:' + (STATUS_COLORS[b.status]||'#6B7280') + '">' + (STATUS_LABELS[b.status]||b.status) + '</span>';
          html += '</div>';
          html += '<div style="font-size:12px;color:#6b7280">' + esc(b.scheduled_date||'') + '</div>';
          html += '</div>';
        });
      }
      el.innerHTML = html;

      // Wire cancel buttons
      el.querySelectorAll('.acct-cancel-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var bookingId = btn.dataset.id;
          if (!confirm('Cancel this booking?')) return;
          _sb.auth.getSession().then(function(s) {
            var sess = s.data && s.data.session ? s.data.session : null;
            if (!sess) return;
            btn.textContent = '...';
            fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'client-cancel', access_token: sess.access_token, booking_id: bookingId, client_id: sess.user.id })
            }).then(function(r) {
              if (r.ok) { openAccountPanel(sess); }
              else { btn.textContent = 'Cancel'; alert('Could not cancel. Please call us.'); }
            });
          });
        });
      });

      // Wire reschedule buttons
      el.querySelectorAll('.acct-resched-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var bookingId = btn.dataset.id;
          var currentDate = btn.dataset.date;
          var currentTime = btn.dataset.time;
          var newDate = prompt('New date (YYYY-MM-DD):', currentDate);
          if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
          var timeOpts = ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00'];
          var newTime = prompt('New time:\n' + timeOpts.join(' / '), currentTime);
          if (!newTime || !timeOpts.includes(newTime)) return;
          _sb.auth.getSession().then(function(s) {
            var sess = s.data && s.data.session ? s.data.session : null;
            if (!sess) return;
            fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'client-reschedule', access_token: sess.access_token, booking_id: bookingId, client_id: sess.user.id, scheduled_date: newDate, scheduled_time: newTime })
            }).then(function(r) {
              if (r.ok) { openAccountPanel(sess); }
              else { alert('Could not reschedule. Please call us.'); }
            });
          });
        });
      });

    }).catch(function() {
      var el = document.getElementById('account-bookings');
      if (el) el.textContent = 'Could not load bookings.';
    });
  });
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```

Nota: landing.html puede ya tener una funcion `esc` — si la tiene, NO agregar otra. Verificar con Grep antes de insertar.

- [ ] **Step 2: Verificar que no hay esc() duplicado en landing.html**

```bash
grep -n "function esc" landing.html
```

Si ya existe, omitir la definicion de esc en el codigo de arriba.

- [ ] **Step 3: Syntax check (visual)**

Abrir landing.html en browser → sign in con Google → nav button muestra "Hi, Diego" → click abre panel derecho → panel muestra bookings

- [ ] **Step 4: Commit y deploy (esperando OK de Diego)**

```bash
git add landing.html
git commit -m "feat: account panel for logged-in PC users (bookings, cancel, reschedule)"
git push origin main
npx vercel --prod
```

---

## Resumen ejecutivo

### Total archivos a tocar
| Archivo | Cambios |
|---------|---------|
| `api/auth.js` | +5 handlers: mechanic-accept, mechanic-reject, mechanic-arrived, mechanic-checklist, mechanic-complete. +mechanic_notes en mechanic-update-status. +mechanic_id en mechanic-jobs cols. |
| `js/mechanic.js` | card() +botones, +acceptJob, +rejectJob, +markArrived, fix saveNotes, fix saveChecklist, fix submitComplete, fix completeService |
| `sw.js` | v18 → v19 |
| `mechanic.html` | script v=20260624 → v=20260625 |
| `landing.html` | updateNavForSession + openAccountPanel |

### SQL para correr en Supabase (TODO junto)
```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS photo_before_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS photo_after_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_signature_url TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS next_service_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS next_service_type TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS service_duration_seconds INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_service_checklist JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pre_service_notes TEXT;
```

**Paso manual Supabase Storage:**
Storage → New bucket → `job-photos` → Public: YES

### Orden recomendado de ejecucion
1. Diego corre el SQL + crea bucket (prerequisito)
2. TAREA 8: Tasks 8-1 → 8-2 → 8-3 → 8-4 → 8-5 (en orden, con OK de Diego entre cada commit)
3. TAREA 9: Solo verificacion — no hay code changes
4. TAREA 10: Tasks 10-1 → 10-2

### Estimado de tiempo por tarea
- TAREA 8: ~90-120 min (5 sub-tasks, el mas complejo es 8-5 con 4 funciones)
- TAREA 9: ~5 min (solo verificacion en device)
- TAREA 10: ~30 min (2 sub-tasks, todo en landing.html)
