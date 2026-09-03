// js/i18n-es.js — el diccionario de espanol, y nada mas.
//
// Separado de js/i18n.js el 01-sep-2026. Los tres idiomas vivian en un solo
// archivo de 165 KB que TODOS los visitantes descargaban entero: un cliente
// leyendo la app en ingles se bajaba 164 KB de espanol y chino que no iba a
// usar nunca, y el traductor ni siquiera consulta el diccionario cuando el
// idioma es ingles (translateValue devuelve el texto tal cual).
//
// Cargado bajo demanda por ensureLang() en js/i18n.js. NUNCA lo importes con
// `?v=`: js/i18n.js lo importa sin query, y una query crearia una SEGUNDA
// copia del modulo con su propio diccionario - el mismo error que se quito el
// 28-jul-2026 y que CLAUDE.md pide no repetir. El unico modo de entregar una
// version nueva a un navegador que ya entro es subir CACHE_STATIC en sw.js.

export default {
  // Punto 8 de la auditoria: la ACL no se puede excluir por contrato ni
  // firmando, asi que decir "no se reembolsa" a secas antes de un cobro es
  // una afirmacion enganosa sobre los derechos del cliente - un area que la
  // ACCC persigue activamente. Misma formula que ya usa terms.html.
  'This does not affect your rights under the Australian Consumer Law, which cannot be excluded.':
    'Esto no afecta tus derechos bajo la Ley del Consumidor de Australia, que no se pueden excluir.',
  // El turno se pierde ANTES de tocar la tarjeta (api/_slot-hold.js), asi
  // que este mensaje es el que reemplaza a un cobro y su reembolso.
  'That time is no longer available. Please pick another time.':
    'Ese horario ya no esta disponible. Elegi otro, por favor.',
  // Screen reader strings (audit point 15). The three "Step N of 3" labels
  // are NOT flagged by scripts/i18n-check.mjs: they are passed INTO
  // translateValue() via announce(), and the check only sees strings
  // outside it. That is the documented gap in CLAUDE.md - added by hand,
  // in the same commit that created them.
  'Live map. Waiting for the mechanic position.':
    'Mapa en vivo. Esperando la posicion del mecanico.',
  'Mechanic on the way': 'Mecanico en camino',
  min: 'min',
  'Step 1 of 3: choose a service': 'Paso 1 de 3: elegi un servicio',
  'Step 2 of 3: choose a date and time': 'Paso 2 de 3: elegi fecha y hora',
  'Step 3 of 3: your address': 'Paso 3 de 3: tu direccion',
  // Skip link (audit point 13). All three languages in the same commit
  // that creates the string, per the project rule.
  'Skip to content': 'Saltar al contenido',
  // Catalogue services added to the All Services modal (landing.html) and
  // the mobile home (index.html) on 2026-08-02. Every one of these exists in
  // the Supabase `services` table and was bookable already - they were just
  // advertised nowhere, so nobody knew to ask for them.
  // Two spellings of some descriptions on purpose: index.html's cards end in
  // a full stop and landing.html's do not, and the dictionary is keyed on the
  // exact rendered text.
  'E-bike Diagnostic': 'Diagnóstico de e-bike',
  'Full system scan, firmware check and error code review.':
    'Escaneo completo del sistema, revisión de firmware y códigos de error.',
  'Full system scan, firmware check and error code review':
    'Escaneo completo del sistema, revisión de firmware y códigos de error',
  'Firmware Update': 'Actualización de firmware',
  'Software update for e-bike motor and display':
    'Actualización de software del motor y la pantalla de la e-bike',
  'Cable connections, bolts, and a full brake and gear adjustment':
    'Conexiones de cables, tornillería y ajuste completo de frenos y cambios',
  'Bike Build — New Bike': 'Armado de bici nueva',
  'Full assembly of a new boxed bike.': 'Armado completo de una bici nueva en caja.',
  'Full assembly of a new boxed bike': 'Armado completo de una bici nueva en caja',
  'Tubeless Tyre Install': 'Instalación de cubierta tubeless',
  'Tubeless conversion per wheel': 'Conversión a tubeless por rueda',
  'Hydro Brake Install': 'Instalación de freno hidráulico',
  'Full hydraulic brake system installation':
    'Instalación completa del sistema de frenos hidráulicos',
  'Derailleur Install': 'Instalación de descarrilador',
  'Front or rear derailleur installation': 'Instalación de descarrilador delantero o trasero',
  'True Hanger Derailleur': 'Alineación de patilla de cambio',
  'Hanger straightened, gear setup included': 'Patilla enderezada, ajuste de cambios incluido',
  'Handlebar Install': 'Instalación de manillar',
  'Remove and refit handlebars': 'Desmontaje y montaje de manillar',
  'Accessory / Part Install': 'Instalación de accesorio o pieza',
  'Professional fitting of accessories': 'Montaje profesional de accesorios',
  'E-Bike & Electronics': 'E-bikes y electrónica',
  Assembly: 'Armado',
  'Lower Leg Service': 'Service de barras inferiores',
  'Full lower leg strip, clean and oil refresh':
    'Desarme completo de barras, limpieza y cambio de aceite',
  'Air Can Service': 'Service de cámara de aire',
  'Air spring disassembly and new o-rings': 'Desarme del resorte neumático y o-rings nuevos',
  'Urgent same-day help. Call us and we quote your repair on the spot.':
    'Ayuda urgente el mismo día. Llamanos y te cotizamos la reparación al momento.',
  // Bottom nav
  Home: 'Inicio',
  Bookings: 'Reservas',
  Track: 'Rastrear',
  'My Bikes': 'Mis Bicis',
  Profile: 'Perfil',
  // Home screen
  'Book a Service': 'Reservar Servicio',
  'View Services': 'Ver Servicios',
  'View All': 'Ver Todo',
  Services: 'Servicios',
  // Login / Signup
  'Welcome Back!': '¡Bienvenido de nuevo!',
  'Login to your account': 'Inicia sesión en tu cuenta',
  'Continue with Google': 'Continuar con Google',
  or: 'o',
  Email: 'Correo',
  Password: 'Contraseña',
  'Forgot Password?': '¿Olvidaste tu contraseña?',
  'Reset Password': 'Restablecer contraseña',
  "Enter your email and we'll send you a reset link":
    'Ingresa tu correo y te enviaremos un enlace para restablecerla',
  'Send reset link': 'Enviar enlace',
  'Back to sign in': 'Volver a iniciar sesión',
  "Don't remember your email either?": '¿Tampoco recuerdas tu correo?',
  'WhatsApp us': 'Escríbenos por WhatsApp',
  'Please enter your email.': 'Por favor, ingresa tu correo.',
  'Sending...': 'Enviando...',
  'Could not send reset link. Please try again.': 'No pudimos enviar el enlace. Intenta de nuevo.',
  'Check your email': 'Revisa tu correo',
  'We sent a password reset link to': 'Te enviamos un enlace para restablecer tu contraseña a',
  'It can take a minute to arrive.': 'Puede tardar un minuto en llegar.',
  'Resend email': 'Reenviar correo',
  'Link sent': 'Enlace enviado',
  'Set a new password': 'Elige una nueva contraseña',
  'Choose a new password for your account.': 'Elige una nueva contraseña para tu cuenta.',
  'New password': 'Nueva contraseña',
  'Update password': 'Actualizar contraseña',
  'Password must be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres.',
  'Updating...': 'Actualizando...',
  'Could not update password. Please try again.':
    'No pudimos actualizar la contraseña. Intenta de nuevo.',
  'Password updated - you are signed in.': 'Contraseña actualizada. Ya iniciaste sesión.',
  Login: 'Iniciar sesión',
  "Don't have an account?": '¿No tienes una cuenta?',
  'Sign up': 'Regístrate',
  'Create Account': 'Crear Cuenta',
  'Full Name': 'Nombre completo',
  'Already have an account?': '¿Ya tienes una cuenta?',
  'Sign in': 'Inicia sesión',
  // My Bookings
  'My Bookings': 'Mis Reservas',
  Upcoming: 'Próximas',
  History: 'Historial',
  'No upcoming bookings': 'No tienes próximas reservas',
  'Book your first service today!': '¡Reserva tu primer servicio hoy!',
  'No booking history': 'Sin historial de reservas',
  'Completed services will appear here.': 'Los servicios completados aparecerán aquí.',
  'Showing your most recent bookings': 'Mostrando tus reservas más recientes',
  Date: 'Fecha',
  Time: 'Hora',
  Address: 'Dirección',
  'Visit & diagnosis': 'Visita y diagnóstico',
  'Book Again': 'Reservar de nuevo',
  'Track Live': 'Rastrear en vivo',
  'Share tracking link': 'Compartir enlace de rastreo',
  Reschedule: 'Reprogramar',
  'New date': 'Nueva fecha',
  'New time': 'Nuevo horario',
  'Loading available times...': 'Cargando horarios disponibles...',
  'No times available': 'No hay horarios disponibles',
  Back: 'Volver',
  '- unavailable': '- no disponible',
  'No times available that day - try another date.':
    'No hay horarios disponibles ese día - prueba otra fecha.',
  'Could not load times': 'No se pudieron cargar los horarios',
  'Could not check availability. Try again.':
    'No se pudo verificar la disponibilidad. Intenta de nuevo.',
  'Cancel booking': 'Cancelar reserva',
  Close: 'Cerrar',
  'Your mechanic': 'Tu mecánico',
  'Rate this mechanic': 'Calificar a este mecánico',
  'Your review': 'Tu reseña',
  'Client reviews': 'Reseñas de clientes',
  'Jobs done': 'Trabajos hechos',
  Rating: 'Calificación',
  'Prefer a specific mechanic? (optional)': '¿Preferís un mecánico en particular? (opcional)',
  "We'll try to send your job to them first.": 'Vamos a intentar asignarte primero con ellos.',
  jobs: 'trabajos',
  // Payment method (card on file, 2026-07-22)
  'Payment Method': 'Método de Pago',
  '💳 Card on file': '💳 Tarjeta guardada',
  'Auto-charged when your mechanic completes a job':
    'Se cobra automáticamente cuando tu mecánico termina el servicio',
  Remove: 'Quitar',
  'No card saved': 'No tenés tarjeta guardada',
  'Save a card so your mechanic can charge you automatically instead of using EFTPOS':
    'Guardá una tarjeta para que tu mecánico te cobre automáticamente en vez de usar EFTPOS',
  'Add card': 'Agregar tarjeta',
  'Save card': 'Guardar tarjeta',
  'Removing...': 'Quitando...',
  'Card saved': 'Tarjeta guardada',
  'Card removed': 'Tarjeta eliminada',
  'Could not save card. Please try again.': 'No pudimos guardar la tarjeta. Intentá de nuevo.',
  'Could not remove card': 'No pudimos quitar la tarjeta',

  // My Bikes
  'Service history is a Standard/VIP perk':
    'El historial de servicios es un beneficio Standard/VIP',
  'Upgrade your membership to see every past service for this bike.':
    'Mejorá tu membresía para ver todos los servicios anteriores de esta bici.',
  'No bikes added yet': 'Aún no has agregado bicis',
  'Add your first bike below': 'Agrega tu primera bici abajo',
  '+ Add a Bike': '+ Agregar una Bici',
  'New Bike': 'Bici Nueva',
  'Predicted next service': 'Próximo servicio estimado',
  "You're likely due for a service": 'Probablemente necesites un servicio',
  'We recommend a service roughly every 3 months.':
    'Recomendamos un servicio aproximadamente cada 3 meses.',
  'You were due around': 'Correspondía alrededor del',
  'Your next one is around': 'El próximo sería alrededor del',
  // Live Tracking
  'Live Tracking': 'Rastreo en Vivo',
  'Change booking': 'Cambiar reserva',
  'Loading booking...': 'Cargando reserva...',
  'On the way to you': 'En camino hacia ti',
  Confirmed: 'Confirmado',
  'En Route': 'En Camino',
  // The rest of the booking statuses. Only Confirmed and En Route were here,
  // so the account panel on landing.html showed "Pending" in English next to
  // Spanish copy. Masculine to agree with the Confirmado already above.
  Pending: 'Pendiente',
  'In Progress': 'En curso',
  Completed: 'Completado',
  Cancelled: 'Cancelado',
  // landing.html's own booking confirmation and its failure message
  'Booking Confirmed!': '¡Reserva confirmada!',
  'Something went wrong. Please call us at 0433 963 250.':
    'Algo salió mal. Llamanos al 0433 963 250.',
  // Honest failure states. They replaced the mock data that used to fill in
  // for a failed query (2026-07-28).
  'You have a booking in progress': 'Tenés una reserva a medio hacer',
  'Could not load services': 'No pudimos cargar los servicios',
  'Could not load your bookings': 'No pudimos cargar tus reservas',
  "You're offline": 'Estás sin conexión',
  'Sign in to see your bookings': 'Iniciá sesión para ver tus reservas',
  Arrived: 'Llegó',
  Done: 'Listo',
  Message: 'Mensaje',
  'Share link': 'Compartir enlace',
  'Mechanic profile': 'Perfil del mecánico',
  'Dr. Bike Mobile Mechanic': 'Mecánico Móvil Dr. Bike',
  Call: 'Llamar',
  WhatsApp: 'WhatsApp',
  'Services completed': 'servicios completados',
  // Review
  'Review Service': 'Calificar Servicio',
  'How was your experience?': '¿Cómo fue tu experiencia?',
  "We'd love to hear your feedback.": 'Nos encantaría escuchar tu opinión.',
  'Tell us about your experience...': 'Cuéntanos sobre tu experiencia...',
  'Submit Review': 'Enviar Reseña',
  'Maybe Later': 'Tal Vez Después',
  // Profile
  'Your referral code': 'Tu código de referido',
  'You and your friend each get $15 off': 'Tú y tu amigo reciben $15 de descuento',
  'Copy code': 'Copiar código',
  Share: 'Compartir',
  'Friends referred': 'Amigos referidos',
  'Credits earned': 'Créditos ganados',
  'How it works': 'Cómo funciona',
  // Profile - rider tier card
  'New Rider': 'Ciclista Nuevo',
  'Bronze Rider': 'Ciclista Bronce',
  'Silver Rider': 'Ciclista Plata',
  'Gold Rider': 'Ciclista Oro',
  'Diamond Rider': 'Ciclista Diamante',
  'service completed': 'servicio completado',
  'services completed': 'servicios completados',
  'more service to reach': 'servicio más para llegar a',
  'more services to reach': 'servicios más para llegar a',
  "You've reached our highest tier - thank you for riding with us!":
    'Llegaste a nuestro nivel más alto - ¡gracias por andar con nosotros!',
  // Profile - membership card
  Membership: 'Membresía',
  Plan: 'Plan',
  Active: 'Activa',
  Paused: 'Pausada',
  'Resume membership': 'Reanudar membresía',
  'Pause membership': 'Pausar membresía',
  Cancel: 'Cancelar',
  // Profile - push notifications
  Notifications: 'Notificaciones',
  'Mechanic messages': 'Mensajes del mecánico',
  'Get a phone alert when your mechanic messages you':
    'Recibí una alerta en tu celular cuando tu mecánico te escriba',
  Enable: 'Activar',
  'Enabling...': 'Activando...',
  Enabled: 'Activado',
  // Home nav greeting (split from the dynamic name for translation) -
  // translateScreen() looks up the TRIMMED text node, so the key has no
  // trailing space even though the rendered node does (verified: a key
  // with a trailing space here never matches).
  'Hi,': 'Hola,',
  // Booking flow - Step 1 (select service)
  'Not sure what your bike needs?': '¿No estás seguro qué necesita tu bici?',
  'Take a photo or describe the problem — our AI will recommend the right service.':
    'Sacá una foto o describí el problema - nuestra IA te va a recomendar el servicio correcto.',
  Photo: 'Foto',
  'Describe the problem...': 'Describí el problema...',
  'Ask AI': 'Preguntar a la IA',
  'Select Service': 'Elegí un Servicio',
  'Emergency Service': 'Servicio de Emergencia',
  'Price and availability confirmed by phone or WhatsApp - tap to contact us directly.':
    'Precio y disponibilidad se confirman por teléfono o WhatsApp - tocá para contactarnos directamente.',
  "Emergency visits depend on where our mechanic already is, so we confirm these directly - call or WhatsApp us and we'll tell you right away if we can help and what it'll cost.":
    'Las visitas de emergencia dependen de dónde esté nuestro mecánico, así que las confirmamos directamente - llamanos o escribinos por WhatsApp y te decimos al toque si podemos ayudarte y cuánto cuesta.',
  'Back to services': 'Volver a los servicios',
  'Which bike?': '¿Qué bici?',
  Skip: 'Omitir',
  Continue: 'Continuar',
  // Service categories (full + short chip labels)
  'Scheduled services': 'Servicios programados',
  Scheduled: 'Programado',
  Brakes: 'Frenos',
  'Cockpit & levers': 'Cabina y palancas',
  Cockpit: 'Cabina',
  Drivetrain: 'Transmisión',
  'Gears & cables': 'Cambios y cables',
  Gears: 'Cambios',
  'Wheels & tyres': 'Ruedas y neumáticos',
  Wheels: 'Ruedas',
  'Electronic & e-bike': 'Electrónica y e-bike',
  'E-Bike': 'E-Bike',
  Suspension: 'Suspensión',
  'General & assembly': 'General y armado',
  General: 'General',
  // Booking flow - Step 2 (calendar)
  'Choose Date & Time': 'Elegí Fecha y Hora',
  'Select Date': 'Elegí la fecha',
  'Select Time': 'Elegí la hora',
  January: 'Enero',
  February: 'Febrero',
  March: 'Marzo',
  April: 'Abril',
  May: 'Mayo',
  June: 'Junio',
  July: 'Julio',
  August: 'Agosto',
  September: 'Septiembre',
  October: 'Octubre',
  November: 'Noviembre',
  December: 'Diciembre',
  Su: 'Do',
  Mo: 'Lu',
  Tu: 'Ma',
  We: 'Mi',
  Th: 'Ju',
  Fr: 'Vi',
  Sa: 'Sá',
  // Booking flow - Step 2 (time slot loading / full / waitlist states)
  'Could not load available times': 'No se pudieron cargar los horarios disponibles',
  'Please check your connection and try again.':
    'Por favor, verificá tu conexión e intentá de nuevo.',
  Retry: 'Reintentar',
  'Fully booked on this date': 'Completo en esta fecha',
  'Please choose another day or join the waitlist':
    'Por favor, elegí otro día o anotate en la lista de espera',
  'Join Waitlist for': 'Anotarme en la lista de espera para',
  'Which times work for you?': '¿Qué horarios te sirven?',
  'Please select at least one time slot.': 'Por favor, seleccioná al menos un horario.',
  'Notify Me When a Slot Opens': 'Avisame cuando se libere un horario',
  'Joining...': 'Anotando...',
  'Please sign in first to join the waitlist.':
    'Por favor, iniciá sesión primero para anotarte en la lista de espera.',
  'Failed to join waitlist': 'No se pudo completar la inscripción en la lista de espera',
  "You're on the waitlist!": '¡Estás en la lista de espera!',
  "We'll email": 'Te enviaremos un correo a',
  'if a slot opens up on': 'si se libera un horario el',
  // Booking flow - Step 3 (address)
  'Your Address': 'Tu Dirección',
  'Where should we come?': '¿A dónde vamos?',
  'Your mechanic will come to this address': 'Tu mecánico va a llegar a esta dirección',
  "Same-day visits cover everything within about 45 minutes of our Northern Beaches base — Northern Beaches, North Shore, Hornsby, the CBD, Inner West and Eastern Suburbs. Further out, like Western Sydney, the Sutherland Shire or the Blue Mountains, we still come, but by arrangement rather than same-day. Enter your address when you book and we'll tell you which one you are.":
    'Las visitas del día cubren todo lo que esté a unos 45 minutos de nuestra base en Northern Beaches: Northern Beaches, North Shore, Hornsby, el CBD, Inner West y Eastern Suburbs. Más lejos, como Western Sydney, Sutherland Shire o las Blue Mountains, igual vamos, pero con coordinación previa en vez de el mismo día. Poné tu dirección al reservar y te decimos en cuál estás.',
  'Why is the visit & diagnosis fee different for my suburb?':
    '¿Por qué la visita y diagnóstico cambia según mi suburbio?',
  "Because it pays for the trip, and what a trip really costs is time, not kilometres. From our Northern Beaches base the CBD is about 40 minutes across the Spit Bridge, while Hornsby is further away on the map but only 30 minutes up the motorway — so the CBD costs a little more. We work the fee out from real driving time to your address, which is why it's exact rather than a flat rate.":
    'Porque paga el viaje, y lo que un viaje cuesta de verdad es tiempo, no kilómetros. Desde nuestra base en Northern Beaches, el CBD está a unos 40 minutos cruzando el Spit Bridge, mientras que Hornsby queda más lejos en el mapa pero a solo 30 minutos por autopista, así que el CBD cuesta un poco más. Calculamos la tarifa con el tiempo real de manejo hasta tu dirección, por eso es exacta y no una tarifa plana.',
  'We quote that area case by case': 'Esa zona la cotizamos caso por caso',
  'Continue - book at no cost': 'Continuar - reservar sin costo',
  "It's outside our same-day zone, so there's no fixed price to show you - but we do still come. Book as usual and the last step asks for a price instead of a card: no charge, and the mechanic replies to you personally.":
    'Está fuera de nuestra zona de visitas del día, así que no hay un precio fijo para mostrarte, pero igual vamos. Reservá normalmente y el último paso te pide el precio en vez de la tarjeta: sin cargo, y el mecánico te responde personalmente.',
  "We don't reach that address yet": 'Todavía no llegamos a esa dirección',
  'No charge - we check your address and reply personally.':
    'Sin costo - revisamos tu dirección y te respondemos personalmente.',
  'Ask for my price': 'Consultar mi precio',
  'What the visit & diagnosis covers': 'Qué cubre la visita y diagnóstico',
  'A mechanic comes to you, inspects the whole bike and tells you exactly what it needs. If the repair is not possible - a part we do not carry, or a job that needs a machinist or welding - you are told on the spot and the service fee is not charged. The visit & diagnosis covers that inspection and is not refunded.':
    'Un mecánico va hasta vos, revisa la bici entera y te dice exactamente qué necesita. Si la reparación no es posible - un repuesto que no llevamos, o un trabajo que necesita tornero o soldadura - te lo decimos ahí mismo y no se cobra el servicio. La visita y el diagnóstico cubren esa revisión y no se reembolsan.',
  'Waiting for a mechanic': 'Esperando un mecánico',
  'Assigned to your booking': 'Asignado a tu reserva',
  'Send a gift card': 'Regalar una tarjeta',
  'Any cyclist you know, delivered by email': 'Para cualquier ciclista, se entrega por email',
  Buy: 'Comprar',
  Recipient: 'Para',
  Sender: 'De',
  'Another amount': 'Otro monto',
  'Between $20 and $1000.': 'Entre $20 y $1000.',
  'Continue to payment': 'Continuar al pago',
  Optional: 'Opcional',
  'Secured by Stripe - delivered by email': 'Pago seguro con Stripe - se entrega por email',
  'We send the card straight to them.': 'La tarjeta le llega directo a esa persona.',
  'The whole Dr. Bike team wishes you a great one.':
    'Todo el equipo de Dr. Bike te desea un gran día.',
  Saved: 'Guardado',
  'Profile & settings': 'Perfil y ajustes',
  Birthday: 'Cumpleaños',
  "Tell us the day and we'll send you something on it. We don't ask for the year.":
    'Decinos el día y te mandamos algo. No te pedimos el año.',
  Day: 'Día',
  Month: 'Mes',
  'Pick a day and a month': 'Elegí un día y un mes',
  'That day does not exist in that month': 'Ese día no existe en ese mes',
  'Could not save your birthday': 'No pudimos guardar tu cumpleaños',
  'Saved - see you on the day': 'Guardado - nos vemos ese día',
  'Happy birthday, NAME!': '¡Feliz cumpleaños, NAME!',
  'Check your email - there is something from us in there.':
    'Revisá tu email, que te dejamos algo.',
  'We need to price this one by hand': 'Este lo tenemos que cotizar a mano',
  'We sent your enquiry to the mechanic': 'Le enviamos tu consulta al mecánico',
  "We're checking your address and will get back to you shortly.":
    'Estamos revisando tu dirección y te contactamos a la brevedad.',
  'Want an answer faster?': '¿Querés una respuesta más rápida?',
  'Send us the details on WhatsApp - the message is already written.':
    'Mandanos los datos por WhatsApp - el mensaje ya está escrito.',
  'Send on WhatsApp': 'Enviar por WhatsApp',
  'Back to home': 'Volver al inicio',
  "Send us the address on WhatsApp and we'll tell you if we can make it work.":
    'Mandanos la dirección por WhatsApp y te decimos si podemos llegar.',
  '💬 Ask on WhatsApp': '💬 Consultar por WhatsApp',
  'Hi! Do you cover this address?': '¡Hola! ¿Llegan a esta dirección?',
  'Service:': 'Servicio:',
  'Date:': 'Fecha:',
  'Address:': 'Dirección:',
  'Distance from your base:': 'Distancia desde su base:',
  'Continue anyway': 'Continuar igual',
  "The visit & diagnosis fee (from $25, depending on your suburb) covers the mechanic's trip. Most areas in Sydney are covered.":
    'La visita y diagnóstico (desde $25, según tu suburbio) cubre el viaje del mecánico. Cubrimos la mayoría de las áreas de Sydney.',
  'Continue to Summary': 'Continuar al Resumen',
  // Service Summary / Quote
  'Sunday & public holiday rate': 'Tarifa de domingo y feriado',
  'Your Quote': 'Tu Cotización',
  Location: 'Ubicación',
  "What's included": 'Qué incluye',
  'Service fee': 'Costo del servicio',
  'Paid online now via Stripe': 'Se paga ahora en línea con Stripe',
  'Promo discount': 'Descuento promocional',
  'Qualified & background-checked': 'Calificado y con antecedentes verificados',
  ETA: 'Llegada',
  'by road': 'por ruta',
  'straight line': 'en línea recta',
  'Mechanic is right outside!': '¡El mecánico está en la puerta!',
  'Referral credit': 'Crédito por recomendación',
  Total: 'Total',
  'Promo or referral code': 'Código promocional o de referido',
  'Enter code (optional)': 'Ingresá el código (opcional)',
  Apply: 'Aplicar',
  'Checking...': 'Verificando...',
  'How payment works:': 'Cómo funciona el pago:',
  'Please try again.': 'Por favor, intentá de nuevo.',
  // Service inclusions (shown on the Quote screen)
  'Gear adjustment & cable tension': 'Ajuste de cambios y tensión de cables',
  'Brake check & pad inspection': 'Revisión de frenos e inspección de pastillas',
  'Wheel true & tyre pressure': 'Centrado de ruedas y presión de neumáticos',
  'Chain lube & basic clean': 'Lubricación de cadena y limpieza básica',
  'Safety inspection': 'Inspección de seguridad',
  'Everything in Tune-Up': 'Todo lo del Tune-Up',
  'Full drivetrain clean & degrease': 'Limpieza completa y desengrase de la transmisión',
  'Cable check & replace if worn': 'Revisión de cables y reemplazo si están gastados',
  'Bearing check (BB, headset, hubs)': 'Revisión de rodamientos (BB, dirección, bujes)',
  'Everything in Standard Service': 'Todo lo del Standard Service',
  'Bottom bracket service': 'Servicio de caja pedalera',
  'Headset adjustment & grease': 'Ajuste y engrase de dirección',
  'Comprehensive component report': 'Informe completo de componentes',
  'Full bike rebuild': 'Reconstrucción completa de la bici',
  'All bearings serviced or replaced': 'Todos los rodamientos revisados o reemplazados',
  'Before & after photos': 'Fotos de antes y después',
  'Detailed parts condition report': 'Informe detallado del estado de las piezas',
  'Brake pad check': 'Revisión de pastillas de freno',
  'Tyre & wheel inspection': 'Inspección de neumáticos y ruedas',
  'Drivetrain check': 'Revisión de la transmisión',
  'Headset & stem safety check': 'Revisión de seguridad de dirección y potencia',
  'Tube replacement': 'Reemplazo de cámara',
  'Tyre inspection': 'Inspección de neumático',
  'Pressure set to spec': 'Presión ajustada a la especificación',
  'Derailleur alignment': 'Alineación del desviador',
  'Cable tension adjustment': 'Ajuste de tensión de cables',
  'Limit screw set': 'Ajuste de tornillos limitadores',
  'Test ride': 'Prueba de manejo',
  'Pad replacement': 'Reemplazo de pastillas',
  'Cable tension & rotor/rim check': 'Tensión de cable y revisión de rotor/llanta',
  'Bedding in if disc': 'Asentamiento si es a disco',
  'Remove, clean & replace chain': 'Quitar, limpiar y reemplazar cadena',
  'Check cassette wear': 'Revisión de desgaste del cassette',
  'True wheel (spoke tension)': 'Centrado de rueda (tensión de rayos)',
  'Rim or rotor inspection': 'Inspección de llanta o rotor',
  // Payment
  'Confirm Booking': 'Confirmar Reserva',
  'Your selection': 'Tu selección',
  'Contact us': 'Contáctanos',
  'Online payments coming soon': 'Pagos en línea próximamente',
  "We're finalising our business setup. Contact us directly to lock in your slot at the same price.":
    'Estamos terminando de configurar el negocio. Contactanos directamente para reservar tu turno al mismo precio.',
  'Book via WhatsApp': 'Reservar por WhatsApp',
  'Call 0433 963 250': 'Llamar al 0433 963 250',
  'Test booking - no charge (admin only)': 'Reserva de prueba - sin cargo (solo admin)',
  'Confirming...': 'Confirmando...',
  // Tracking status messages
  'Booking received - assigning mechanic...': 'Reserva recibida - asignando mecánico...',
  'Mechanic assigned - preparing to depart': 'Mecánico asignado - preparando salida',
  'Mechanic is on the way!': '¡El mecánico está en camino!',
  'Mechanic has arrived!': '¡El mecánico llegó!',
  'Service completed': 'Servicio completado',
  // Home screen - marketing sections (Services/How it Works/About/
  // Testimonials/Memberships/FAQ/CTA/Footer) - static landing content
  // embedded in index.html, never wired to i18n until now.
  'OUR SERVICES': 'NUESTROS SERVICIOS',
  'Complete Bike Care at Your Location': 'Cuidado completo de tu bici donde estés',
  'We bring a fully equipped mobile workshop to your door — no bike shop queues, no expensive tow-ins.':
    'Llevamos un taller móvil completamente equipado hasta tu puerta - sin filas en la tienda, sin remolques costosos.',
  'Tune-Up': 'Ajuste',
  'Standard Service': 'Servicio Estándar',
  'Standard+ Service': 'Servicio Estándar+',
  Repairs: 'Reparaciones',
  // The static fallbacks the HTML ships with. live-prices.js overwrites both
  // numbers from the services table on load and translates the word on its
  // own through the bare 'From' key below, so these two only ever render if
  // the table cannot be reached. 'From $60' was retired with audit 12.6: it
  // was a floor that matched no service and that Admin could not change.
  'From $17': 'Desde $17',
  'From $80': 'Desde $80',
  From: 'Desde',
  'E-Bike Service': 'Servicio de E-Bike',
  'Bike Assembly': 'Ensamblaje de Bici',
  'Perfect for regular maintenance and safety checks.':
    'Perfecto para mantenimiento regular y controles de seguridad.',
  'Comprehensive service with detailed adjustment.': 'Servicio integral con ajuste detallado.',
  'Complete overhaul and performance optimization.':
    'Revisión completa y optimización de rendimiento.',
  'Fast and reliable repair at your doorstep.': 'Reparación rápida y confiable en tu puerta.',
  'Specialized service for electric bikes.': 'Servicio especializado para bicis eléctricas.',
  'Professional assembly of your new bike.': 'Ensamblaje profesional de tu bici nueva.',
  'View All Services →': 'Ver Todos los Servicios →',
  'HOW IT WORKS': 'CÓMO FUNCIONA',
  'Simple 4-Step Process': 'Proceso Simple de 4 Pasos',
  'Getting your bike serviced has never been easier.':
    'Nunca fue tan fácil hacerle servicio a tu bici.',
  'Book Online': 'Reserva Online',
  'Choose your service and preferred time': 'Elegí tu servicio y horario preferido',
  'We Come to You': 'Vamos a tu ubicación',
  'Our mechanic arrives at your location': 'Nuestro mecánico llega a tu ubicación',
  'Service Your Bike': 'Servicio a tu Bici',
  'Professional service on the spot': 'Servicio profesional en el lugar',
  'Ride Happy': 'A Andar Feliz',
  'Your bike is ready to go!': '¡Tu bici está lista para andar!',
  'OUR STORY': 'NUESTRA HISTORIA',
  'Passion for Bikes, Commitment to Service': 'Pasión por las Bicis, Compromiso con el Servicio',
  'Dr. Bike Sydney was founded with a simple mission: to provide professional, convenient, and reliable bike servicing to cyclists across Sydney.':
    'Dr. Bike Sydney nació con una misión simple: brindar servicio de bicicletas profesional, conveniente y confiable a ciclistas en toda Sydney.',
  'Certified & experienced mechanic': 'Mecánico certificado y con experiencia',
  'Fully equipped mobile workshop': 'Taller móvil completamente equipado',
  'Premium tools and quality parts': 'Herramientas premium y repuestos de calidad',
  'Satisfaction guaranteed': 'Satisfacción garantizada',
  'Founder & Head Mechanic': 'Fundador y Mecánico Principal',
  'Happy Customers': 'Clientes Felices',
  'Bikes Serviced': 'Bicis Reparadas',
  'Avg Rating': 'Calificación Promedio',
  Satisfaction: 'Satisfacción',
  TESTIMONIALS: 'TESTIMONIOS',
  'What Our Customers Say': 'Lo que Dicen Nuestros Clientes',
  "Don't just take our word for it. Here's what Sydney cyclists have to say.":
    'No te quedes solo con nuestra palabra. Esto dicen los ciclistas de Sydney.',
  '"Diego is a true professional! He came to my place, serviced my bike perfectly, and even gave me tips on maintenance. Highly recommend!"':
    '"¡Diego es un verdadero profesional! Vino a mi casa, arregló mi bici perfectamente, y hasta me dio consejos de mantenimiento. ¡Muy recomendable!"',
  '"Amazing service! So convenient and affordable. Dr. Bike Sydney is now my go-to for all bike maintenance."':
    '"¡Servicio increíble! Muy conveniente y accesible. Dr. Bike Sydney ahora es mi opción para todo el mantenimiento de mi bici."',
  '"Fast, reliable, and affordable. Dr. Bike Sydney has transformed my bike. My bike has never ridden better."':
    '"Rápido, confiable y accesible. Dr. Bike Sydney transformó mi bici. Nunca anduvo mejor."',
  'Road Cyclist': 'Ciclista de Ruta',
  Triathlete: 'Triatleta',
  'Mountain Biker': 'Ciclista de Montaña',
  MEMBERSHIPS: 'MEMBRESÍAS',
  'Choose Your Plan': 'Elegí tu Plan',
  'Save more with our membership plans. Designed for regular cyclists.':
    'Ahorrá más con nuestros planes de membresía. Diseñados para ciclistas frecuentes.',
  '/month': '/mes',
  '1 Tune-Up per month': '1 Ajuste por mes',
  '10% off parts': '10% de descuento en repuestos',
  '10% off extra visits beyond your monthly service':
    '10% de descuento en visitas extra más allá de tu servicio mensual',
  'Priority scheduling (48hs)': 'Turnos prioritarios (48hs)',
  'Digital bike history': 'Historial digital de la bici',
  '2 services per month (any type)': '2 servicios por mes (cualquier tipo)',
  '15% off parts': '15% de descuento en repuestos',
  '2 free services per month, visit & diagnosis fee included':
    '2 servicios gratis por mes, visita y diagnóstico incluida',
  '10% off extra visits beyond your monthly services':
    '10% de descuento en visitas extra más allá de tus servicios mensuales',
  'Priority scheduling (24hs)': 'Turnos prioritarios (24hs)',
  '1 emergency callout/month': '1 visita de emergencia/mes',
  'Unlimited services per month': 'Servicios ilimitados por mes',
  '20% off parts': '20% de descuento en repuestos',
  'Unlimited services per month, visit & diagnosis fee always included':
    'Servicios ilimitados por mes, visita y diagnóstico siempre incluida',
  'Same-day priority': 'Prioridad el mismo día',
  'Unlimited emergency callouts': 'Visitas de emergencia ilimitadas',
  'Dedicated mechanic': 'Mecánico dedicado',
  'Most Popular': 'Más Popular',
  'Get Started': 'Comenzar',
  'Learn more': 'Saber más',
  'All plans include mobile service within Sydney metro area · 3-month minimum':
    'Todos los planes incluyen servicio móvil dentro del área metropolitana de Sydney - mínimo 3 meses',
  FAQ: 'PREGUNTAS FRECUENTES',
  'Frequently Asked Questions': 'Preguntas Frecuentes',
  'What areas do you service?': '¿Qué zonas cubren?',
  'We service all suburbs within the Sydney metro area, including the CBD, Inner West, Eastern Suburbs, North Shore, and Western Sydney. Check availability when booking.':
    'Cubrimos todos los suburbios del área metropolitana de Sydney, incluyendo el CBD, Inner West, Eastern Suburbs, North Shore y Western Sydney. Verificá disponibilidad al reservar.',
  'What if I need to reschedule?': '¿Qué pasa si necesito reprogramar?',
  'You can reschedule anytime via your booking confirmation link or by calling us. No cancellation fee if you reschedule more than 2 hours in advance.':
    'Podés reprogramar en cualquier momento con el link de confirmación de tu reserva o llamándonos. Sin cargo por cancelación si reprogramás con más de 2 horas de anticipación.',
  'Do you bring spare parts?': '¿Llevan repuestos?',
  "Yes, our fully-equipped van carries common parts like brake pads, cables, chains, and tubes. For less common parts, we'll source them and return to complete the service.":
    'Sí, nuestra van completamente equipada lleva repuestos comunes como pastillas de freno, cables, cadenas y cámaras. Para repuestos menos comunes, los conseguimos y volvemos para completar el servicio.',
  'How long does a service take?': '¿Cuánto dura un servicio?',
  "A Tune-Up typically takes 45-60 minutes. A Standard Service takes 60-90 minutes. A Standard+ Service can take 2-3 hours. We'll give you an estimated time when you book.":
    'Un Ajuste generalmente toma 45-60 minutos. Un Servicio Estándar toma 60-90 minutos. Un Servicio Estándar+ puede tomar 2-3 horas. Te damos un tiempo estimado al reservar.',
  'What payment methods do you accept?': '¿Qué métodos de pago aceptan?',
  'We accept all major credit and debit cards, Apple Pay, and Google Pay. A call-out deposit (from $25, depending on your suburb) is charged at booking; the remainder is charged on completion.':
    'Aceptamos todas las tarjetas de crédito y débito principales, Apple Pay y Google Pay. Se cobra un depósito por la visita (desde $25, según tu suburbio) al reservar; el resto se cobra al completar el servicio.',
  "Still have questions? We're here to help!": '¿Tenés más preguntas? ¡Estamos para ayudarte!',
  'Contact Us': 'Contactanos',
  'Ready to Experience': 'Listo para Experimentar',
  'Premium Bike Service?': 'un Servicio Premium?',
  'Book your service today and join hundreds of satisfied cyclists across Sydney.':
    'Reservá tu servicio hoy y sumate a cientos de ciclistas satisfechos en toda Sydney.',
  'Book Now': 'Reservar Ahora',
  'Start Your Membership': 'Comenzá tu Membresía',
  'Phone Number (04XX XXX XXX)': 'Número de Teléfono (04XX XXX XXX)',
  'Start Membership': 'Comenzar Membresía',
  "You're all set!": '¡Todo listo!',
  "We'll be in touch shortly to confirm your membership and schedule your first service.":
    'Nos pondremos en contacto pronto para confirmar tu membresía y agendar tu primer servicio.',
  INCLUDES: 'INCLUYE',
  'DOES NOT INCLUDE': 'NO INCLUYE',
  'SAVINGS EXAMPLE': 'EJEMPLO DE AHORRO',
  'Professional bike service at your doorstep. Sydney’s mobile bicycle mechanic.':
    'Servicio profesional de bicicletas en tu puerta. El mecánico móvil de bicicletas de Sydney.',
  Company: 'Empresa',
  Support: 'Soporte',
  'Terms & Conditions': 'Términos y Condiciones',
  'Privacy Policy': 'Política de Privacidad',
  Contact: 'Contacto',
  'About Us': 'Sobre Nosotros',
  'My Account': 'Mi Cuenta',
  'Sydney, NSW': 'Sydney, NSW',
  'Mon – Sun: 8:30AM – 4:00PM': 'Lun - Dom: 8:30AM - 4:00PM',
  'Mon - Sun: 8:30AM - 4:00PM': 'Lun - Dom: 8:30AM - 4:00PM',
  'Healthy bikes, happy riders': 'Bicis sanas, ciclistas felices',

  // ── landing.html (desktop) — Navbar ──────────────────────────────────
  Mechanics: 'Mecánicos',
  Memberships: 'Membresías',
  About: 'Nosotros',
  'Fleet →': 'Flotas →',
  'Sign in to manage bookings': 'Iniciá sesión para gestionar tus reservas',
  'Bookings · Bikes · Membership': 'Reservas · Bicis · Membresía',
  // Trust badges bar
  '100% Satisfaction Guarantee': '100% Satisfacción Garantizada',
  'Verified Mechanic': 'Mecánico Verificado',
  'Background Checked': 'Antecedentes Verificados',
  'Fully Insured': 'Totalmente Asegurado',
  // Hero (landing-specific strings not already in the mobile dict)
  'Mobile Service · Sydney Wide': 'Servicio Móvil · Toda Sydney',
  'Professional Bike Service at Your Doorstep': 'Servicio Profesional de Bicicletas en tu Puerta',
  'Mobile bicycle mechanic in Sydney. We come to you, fully equipped.':
    'Mecánico móvil de bicicletas en Sydney. Vamos hasta vos, totalmente equipados.',
  'Or call': 'O llamá al',
  // GrowthBook A/B experiment "hero-cta-copy" variant copy - the default
  // fallback is 'Book a Service' (already in the mobile dict above). Any
  // NEW variant text added in GrowthBook later needs its own key here too,
  // since experiment copy is server-controlled and can't be hooked into
  // translateScreen() automatically - see final report for this limitation.
  'Book a service': 'Reservar Servicio',
  'Get Your Free Quote': 'Obtené tu Cotización Gratis',
  'Qualified Mechanic': 'Mecánico Calificado',
  'Fully Equipped Van': 'Van Totalmente Equipada',
  '5 Star Rated': 'Calificación 5 Estrellas',
  // Mechanics 3D carousel
  'OUR TEAM': 'NUESTRO EQUIPO',
  'Meet Your Mechanics': 'Conocé a Nuestros Mecánicos',
  'Qualified, background-checked mechanics rated by real Sydney riders.':
    'Mecánicos calificados, con antecedentes verificados, calificados por ciclistas reales de Sydney.',
  'Previous mechanic': 'Mecánico anterior',
  'Next mechanic': 'Siguiente mecánico',
  'Our mechanic profiles are coming soon.':
    'Los perfiles de nuestros mecánicos estarán disponibles pronto.',
  // Memberships section (landing-specific)
  Monthly: 'Mensual',
  Annual: 'Anual',
  'Save 20%': 'Ahorrá 20%',
  '/yr - save': '/año - ahorrás',
  // Plan names on the pricing cards. Safe to translate: plan selection is
  // driven by the data-plan attribute on the buttons, never by this text.
  Basic: 'Básico',
  Standard: 'Estándar',
  VIP: 'VIP',
  Popular: 'Popular',
  '1 Basic Service': '1 Servicio Básico',
  '10% off repairs': '10% de descuento en reparaciones',
  'Priority booking': 'Reserva prioritaria',
  'Email support': 'Soporte por correo',
  '2 Standard Services': '2 Servicios Standard',
  '2 free Standard Services/month, visit & diagnosis fee included':
    '2 Servicios Standard gratis/mes, visita y diagnóstico incluida',
  'Phone support': 'Soporte telefónico',
  'Free safety check': 'Chequeo de seguridad gratis',
  'Unlimited Services': 'Servicios ilimitados',
  '20% off repairs': '20% de descuento en reparaciones',
  'Unlimited Services, visit & diagnosis fee always included':
    'Servicios ilimitados, visita y diagnóstico siempre incluida',
  'Annual tune-up': 'Ajuste anual',
  'All plans include mobile service within Sydney metro area':
    'Todos los planes incluyen servicio móvil dentro del área metropolitana de Sydney',
  'Gift a service': 'Regalá un servicio',
  'Send a Dr. Bike gift card by email - perfect for any cyclist':
    'Enviá una gift card de Dr. Bike por correo - perfecta para cualquier ciclista',
  'Buy a gift card': 'Comprar una gift card',
  // Trust bar (brands not translated - see section below)
  'TRUSTED BY CYCLISTS ACROSS SYDNEY': 'CON LA CONFIANZA DE CICLISTAS DE TODA SYDNEY',
  // Services intro + "All Services" modal
  'Book a Service →': 'Reservar un Servicio →',
  'All Services': 'Todos los Servicios',
  'All prices include a visit & diagnosis fee (from $25, depending on your suburb). We come to you.':
    'Todos los precios incluyen la visita y diagnóstico (desde $25, según tu suburbio). Vamos hasta vos.',
  Essentials: 'Esenciales',
  'Tyres & Wheels': 'Neumáticos y Ruedas',
  'Cables & Accessories': 'Cables y Accesorios',
  'Basic Tune-Up': 'Ajuste Básico',
  'Full tune-up + wheel true + drivetrain clean':
    'Ajuste completo + centrado de rueda + limpieza de transmisión',
  'Ultimate Overhaul': 'Revisión Definitiva',
  'Strip & rebuild, all consumables replaced':
    'Desarme y reconstrucción, todos los consumibles reemplazados',
  'Flat Tyre Repair': 'Reparación de Pinchazo',
  'Tube replace or patch, remount & inflate': 'Reemplazo o parche de cámara, remontaje e inflado',
  'Tyre Replacement': 'Reemplazo de Neumático',
  'New tyre fitted (tyre cost extra)': 'Neumático nuevo instalado (costo del neumático aparte)',
  'Wheel Truing - Minor': 'Centrado de Rueda - Menor',
  'Quick spoke tension touch-up': 'Ajuste rápido de tensión de rayos',
  'Wheel Truing - Major': 'Centrado de Rueda - Mayor',
  'Full spoke tension & rim alignment': 'Tensión completa de rayos y alineación de llanta',
  'Spoke Replacement': 'Reemplazo de Rayo',
  'Per spoke, includes re-true': 'Por rayo, incluye recentrado',
  'Brake Adjustment': 'Ajuste de Frenos',
  'Pad align, cable tension, lever reach':
    'Alineación de pastillas, tensión de cable, alcance de maneta',
  'Brake Pad Replacement': 'Reemplazo de Pastillas de Freno',
  'Both wheels, pads included': 'Ambas ruedas, pastillas incluidas',
  'Hydraulic Bleed': 'Purga Hidráulica',
  'Full bleed with fresh fluid': 'Purga completa con líquido nuevo',
  'Gear Adjustment': 'Ajuste de Cambios',
  'Front & rear derailleur indexed': 'Desviador delantero y trasero indexado',
  'Chain Replacement': 'Reemplazo de Cadena',
  'KMC or SRAM chain fitted': 'Cadena KMC o SRAM instalada',
  'Cassette/Freewheel Swap': 'Cambio de Cassette/Piñón Libre',
  'Remove & fit (part cost extra)': 'Retiro e instalación (costo de la pieza aparte)',
  'Cable & Housing': 'Cables y Fundas',
  'Full replace front & rear': 'Reemplazo completo delantero y trasero',
  'Handlebar Tape': 'Cinta de Manubrio',
  'Cork or EVA wrap, bar ends included': 'Envoltura de corcho o EVA, terminales incluidos',
  'Saddle Fitting': 'Ajuste de Asiento',
  'Height, fore-aft, tilt optimised': 'Altura, posición e inclinación optimizadas',
  'Bottom Bracket Service': 'Servicio de Caja Pedalera',
  'Clean, regrease or replace BB': 'Limpieza, re-engrase o reemplazo de la caja pedalera',
  'Headset Service': 'Servicio de Dirección',
  'Clean, adjust, regrease': 'Limpieza, ajuste, re-engrase',
  'Custom Quote': 'Cotización Personalizada',
  'E-bikes, carbon, vintage, insurance claims': 'E-bikes, carbono, vintage, reclamos de seguro',
  'All prices include a visit & diagnosis fee (from $25, depending on your suburb). Parts charged separately unless stated.':
    'Todos los precios incluyen la visita y diagnóstico (desde $25, según tu suburbio). Los repuestos se cobran aparte salvo que se indique lo contrario.',
  'Sunday & NSW public holiday bookings +20%. Saturday is normal price.':
    'Reservas de domingo y feriados de NSW +20%. El sábado tiene precio normal.',

  // ── Testimonials (landing.html specific reviews) ─────────────────────
  "Real reviews from Sydney cyclists who've used Dr. Bike Sydney.":
    'Reseñas reales de ciclistas de Sydney que usaron Dr. Bike Sydney.',
  'Google Review': 'Reseña de Google',
  '"Diego came to my apartment in Surry Hills and fixed my derailleur in under an hour. Absolutely professional — showed up on time, van was stocked with everything. My bike shifts perfectly now. Will definitely book again."':
    '"Diego vino a mi departamento en Surry Hills y arregló mi desviador en menos de una hora. Totalmente profesional - llegó puntual, la van tenía de todo. Mi bici cambia perfecto ahora. Sin dudas vuelvo a reservar."',
  '2 weeks ago': 'Hace 2 semanas',
  '"Best mobile mechanic in Sydney, no question. I was sceptical about a mobile service but Dr. Bike exceeded every expectation. Arrived at Bondi, full service done in 90 minutes in my parking spot. Pricing is very fair."':
    '"El mejor mecánico móvil de Sydney, sin dudas. Era escéptica sobre un servicio móvil pero Dr. Bike superó todas mis expectativas. Llegó a Bondi, servicio completo hecho en 90 minutos en mi propio estacionamiento. Los precios son muy justos."',
  '1 month ago': 'Hace 1 mes',
  '"Used the VIP membership and it\'s worth every cent. Two services already this year — brake bleed and a full tune-up. The convenience of having a mechanic come to my home in Newtown is unbeatable. Highly recommend."':
    '"Usé la membresía VIP y vale cada centavo. Ya tuve dos servicios este año - purga de frenos y un ajuste completo. La comodidad de tener un mecánico que va a mi casa en Newtown es inigualable. Lo recomiendo totalmente."',
  '3 weeks ago': 'Hace 3 semanas',
  'Leave us a review': 'Dejanos una reseña',
  'See Our Service In Action': 'Mirá Nuestro Servicio en Acción',
  'Watch how we service bikes on location.': 'Mirá cómo reparamos bicis en el lugar.',
  'Watch Video': 'Ver Video',

  // ── Book a Service (dark form section) ────────────────────────────────
  'BOOK A SERVICE': 'RESERVAR UN SERVICIO',
  'Schedule Your Service Today': 'Agendá tu Servicio Hoy',
  "Choose a service, pick a time, and we'll come to you.":
    'Elegí un servicio, elegí un horario, y vamos hasta vos.',
  'Service Type': 'Tipo de Servicio',
  'Preferred date': 'Fecha preferida',
  'Preferred Time': 'Horario Preferido',
  'Morning (8:30am - 12pm)': 'Mañana (8:30am - 12pm)',
  'Afternoon (12pm - 4pm)': 'Tarde (12pm - 4pm)',
  'Evening (4pm - 7pm)': 'Noche (4pm - 7pm)',
  'Enter your address': 'Ingresá tu dirección',
  'Continue Booking': 'Continuar Reserva',
  '✓ Confirmation in minutes': '✓ Confirmación en minutos',
  '✓ Free cancellation': '✓ Cancelación gratuita',
  'Step 1 of 3 – Select Service': 'Paso 1 de 3 – Elegí el Servicio',
  'Step 2 of 3 – Date & Time': 'Paso 2 de 3 – Fecha y Hora',
  'Step 3 of 3 – Summary': 'Paso 3 de 3 – Resumen',

  // ── Auth modal ──────────────────────────────────────────────────────────
  'Sign In': 'Iniciar Sesión',
  'Sign in to your account': 'Iniciá sesión en tu cuenta',
  'Create your account': 'Creá tu cuenta',
  'or continue with': 'o continuá con',
  'Check your email to confirm your account': 'Revisá tu correo para confirmar tu cuenta',
  'Email address': 'Correo electrónico',

  // ── Membership modal ────────────────────────────────────────────────────
  'Monthly Total': 'Total Mensual',
  month: 'mes',
  year: 'año',
  'Email Address': 'Correo Electrónico',
  'Card Details': 'Datos de la Tarjeta',
  'Secured by Stripe · 3-month minimum · Cancel anytime after':
    'Protegido por Stripe · mínimo 3 meses · cancelá cuando quieras después',

  // ── Gift Card modal ──────────────────────────────────────────────────────
  'Send a Dr. Bike gift card by email': 'Enviá una gift card de Dr. Bike por correo',
  Amount: 'Monto',
  'Or enter a custom amount ($20-$1000)': 'O ingresá un monto personalizado ($20-$1000)',
  "Recipient's name": 'Nombre del destinatario',
  "Recipient's email *": 'Correo del destinatario *',
  'Your name': 'Tu nombre',
  'Personal message (optional)': 'Mensaje personal (opcional)',
  'Continue to payment →': 'Continuar al pago →',
  'Secured by Stripe · Delivered instantly by email':
    'Protegido por Stripe · Entrega instantánea por correo',

  // ── Account panel (bookings / bikes / membership tabs) ────────────────
  'No bookings yet': 'Todavía no tenés reservas',
  'Book a service to get started': 'Reservá un servicio para empezar',
  'Message mechanic': 'Mensaje al mecánico',
  'Cancel this booking?': '¿Cancelar esta reserva?',
  'Yes, cancel': 'Sí, cancelar',
  'Sign out of your account?': '¿Cerrar sesión de tu cuenta?',
  'Yes, sign out': 'Sí, cerrar sesión',
  'Check my diagnosis fee': 'Calculá el precio de tu diagnóstico',
  "What's your suburb?": '¿Cuál es tu suburbio?',
  "We'll check your visit & diagnosis fee - takes 2 seconds.":
    'Vamos a chequear tu visita y diagnóstico - toma 2 segundos.',
  'Check My Fee': 'Chequear Mi Tarifa',
  'Checking your area...': 'Chequeando tu zona...',
  'Comparing against our Sydney zones': 'Comparando con nuestras zonas de Sídney',
  "Calculated from the distance to our base on the Northern Beaches - the same fee you'll see when you book.":
    'Calculado según la distancia a nuestra base en Northern Beaches - la misma tarifa que vas a ver al reservar.',
  'Continue to Booking →': 'Continuar a la Reserva →',
  'Check another suburb': 'Chequear otro suburbio',
  "We don't recognise that suburb yet": 'Todavía no reconocemos ese suburbio',
  "Give us a call and we'll confirm if we can reach you:":
    'Llamanos y confirmamos si podemos llegar hasta vos:',
  'Try a different suburb': 'Probar otro suburbio',
  'e.g. Bondi, Parramatta, Cronulla...': 'ej. Bondi, Parramatta, Cronulla...',
  'Enter your suburb first.': 'Primero escribí tu suburbio.',
  'Cancel your membership? It stays active until the end of the billing period.':
    '¿Cancelar tu membresía? Seguirá activa hasta el final del período de facturación.',
  'Could not cancel. Please call us.': 'No se pudo cancelar. Por favor, llamanos.',
  Save: 'Guardar',
  'Could not reschedule. Please call us.': 'No se pudo reprogramar. Por favor, llamanos.',
  'Could not load bookings.': 'No se pudieron cargar las reservas.',
  'No bikes registered': 'No hay bicis registradas',
  'Your bikes appear here after your first service':
    'Tus bicis van a aparecer acá después de tu primer servicio',
  'No active membership': 'Sin membresía activa',
  'Save money with a recurring plan': 'Ahorrá con un plan recurrente',
  'View Plans': 'Ver Planes',
  'Current Plan': 'Plan Actual',
  'Member since': 'Miembro desde',
  Resume: 'Reanudar',
  Pause: 'Pausar',
  'Resuming...': 'Reanudando...',
  'Pausing...': 'Pausando...',
  'Membership resumed!': '¡Membresía reanudada!',
  'Membership paused. No charges until you resume.':
    'Membresía pausada. Sin cargos hasta que la reanudes.',
  'Something went wrong': 'Algo salió mal',
  'Cancel your membership? It will stay active until the end of the billing period.':
    '¿Cancelar tu membresía? Va a seguir activa hasta el fin del período de facturación.',
  'Cancelling...': 'Cancelando...',
  'Membership will cancel at end of current period.':
    'La membresía se va a cancelar al final del período actual.',
  'Sign out': 'Cerrar sesión',
  'Sign out?': '¿Cerrar sesión?',

  // ── Auth modal (submit/tabs handlers) ──────────────────────────────────
  'Please fill in all fields.': 'Por favor, completá todos los campos.',
  'Creating...': 'Creando...',
  'Signing in...': 'Iniciando sesión...',
  'Authentication failed. Please try again.':
    'Falló la autenticación. Por favor, intentá de nuevo.',
  'Google sign-in failed. Please try again.':
    'Falló el inicio de sesión con Google. Por favor, intentá de nuevo.',

  // ── Booking wizard: mock service descriptions ──────────────────────────
  'Gears, brakes, wheels trued + safety check':
    'Cambios, frenos, centrado de ruedas + chequeo de seguridad',
  'Full tune-up + drivetrain clean': 'Ajuste completo + limpieza de transmisión',
  'Comprehensive overhaul + parts check': 'Revisión integral + chequeo de piezas',
  'Complete rebuild, all bearings serviced':
    'Reconstrucción completa, todos los rodamientos revisados',
  '~1 hour': '~1 hora',
  '~1.5 hours': '~1,5 horas',
  '~2.5 hours': '~2,5 horas',
  '~4 hours': '~4 horas',
  // Step 1: AI diagnosis + service selection
  'Upload a photo or describe the problem — our AI will recommend the right service.':
    'Subí una foto o describí el problema - nuestra IA te va a recomendar el servicio correcto.',
  '📷 Upload Photo': '📷 Subir Foto',
  // Booking wizard summary: abbreviated day names (BK_DAY_NAMES - 3-letter
  // format, distinct from the 2-letter DOW keys 'Su'/'Mo'.. used by the
  // calendar grid header)
  Sun: 'Dom',
  Mon: 'Lun',
  Tue: 'Mar',
  Wed: 'Mié',
  Thu: 'Jue',
  Fri: 'Vie',
  Sat: 'Sáb',
  // Booking wizard calendar: abbreviated month names (BK_MONTH_NAMES —
  // distinct from the full 'January'.. keys used by the mobile calendar)
  Jan: 'Ene',
  Feb: 'Feb',
  Mar: 'Mar',
  Apr: 'Abr',
  // 'May' is skipped on purpose: the full-month key `May: 'Mayo'` already
  // exists above (mobile calendar) and the 3-letter abbreviation is the
  // identical string in English, so adding it here would overwrite that
  // translation. The booking-wizard calendar falls back to English "May"
  // for that one month only - documented limitation, see final report.
  Jun: 'Jun',
  Jul: 'Jul',
  Aug: 'Ago',
  Sep: 'Sep',
  Oct: 'Oct',
  Nov: 'Nov',
  Dec: 'Dic',
  'Ask AI →': 'Preguntar a la IA →',
  'Select a Service': 'Elegí un Servicio',
  'Continue to Date & Time →': 'Continuar a Fecha y Hora →',
  // Step 2: date + time
  'Select a Date': 'Elegí una Fecha',
  'Select a Time': 'Elegí un Horario',
  '← Back': '← Atrás',
  'Summary →': 'Resumen →',
  // Step 2: waitlist ("We'll email" / "if a slot opens on" already covered
  // by the mobile dict entries above)
  'Select at least one time.': 'Seleccioná al menos un horario.',
  // Step 3: summary — admin test mode + promo code
  'Create test booking (admin - no charge) →': 'Crear reserva de prueba (admin - sin cargo) →',
  'Admin test mode - this booking is created without payment':
    'Modo de prueba admin - esta reserva se crea sin pago',
  'Code applied! -$': 'Código aplicado! -$',
  off: 'de descuento',
  // Step 3: summary card
  'Est.': 'Aprox.',
  '123 Example St, Suburb NSW 2000': 'Calle Ejemplo 123, Suburbio NSW 2000',
  'We come to you anywhere in the Sydney area': 'Vamos hasta vos en cualquier zona de Sydney',
  'Promo code': 'Código promocional',
  '(optional)': '(opcional)',
  'e.g. WELCOME10': 'ej. WELCOME10',
  "We'll arrange payment on confirmation": 'Coordinamos el pago al confirmar',
  'Confirm Booking →': 'Confirmar Reserva →',
  // bkShowPaymentComingSoon overlay
  "We're finalising our business setup. Contact us now to lock in your":
    'Estamos terminando de configurar el negocio. Contactanos ahora para reservar tu',
  '- same price, same service.': '- mismo precio, mismo servicio.',
  'Go back': 'Volver',
  // bkProceed / bkConfirmedHTML
  'Saving...': 'Guardando...',
  'Confirm & Pay →': 'Confirmar y Pagar →',
  'Please sign in to confirm your booking.': 'Por favor, iniciá sesión para confirmar tu reserva.',
  'Could not save booking. Please try again.':
    'No se pudo guardar la reserva. Por favor, intentá de nuevo.',
  'That time slot was just booked. Please choose another time.':
    'Ese horario se acaba de reservar. Por favor, elegí otro horario.',
  'Booking Received!': '¡Reserva Recibida!',
  'Reference:': 'Referencia:',
  "We'll contact you within 1 hour to confirm your appointment. Payment is arranged separately.":
    'Te vamos a contactar dentro de 1 hora para confirmar tu turno. El pago se coordina por separado.',
  // AI diagnosis (booking wizard variant)
  'Analysing your photo...': 'Analizando tu foto...',
  'Could not analyse photo. Please describe the problem instead.':
    'No se pudo analizar la foto. Por favor, describí el problema en su lugar.',
  'Analysing...': 'Analizando...',
  'Could not process. Please select a service manually.':
    'No se pudo procesar. Por favor, elegí un servicio manualmente.',
  'AI Recommendation': 'Recomendación de la IA',
  'Bike issue detected': 'Problema de bici detectado',
  'Book soon': 'Reservá pronto',

  // ── Plan info modal ("Learn more") ─────────────────────────────────────
  // Plan-info modal price, set by JS from a table in landing.html/index.html.
  '$67/month': '$67/mes',
  '$97/month': '$97/mes',
  '$197/month': '$197/mes',
  'Basic Plan': 'Plan Básico',
  'Standard Plan': 'Plan Estándar',
  'VIP Plan': 'Plan VIP',
  '1 maintenance service per month (Tune-Up)': '1 servicio de mantenimiento por mes (Ajuste)',
  '1 free maintenance service per month (Tune-Up)':
    '1 servicio de mantenimiento gratis por mes (Ajuste)',
  '10% discount on parts': '10% de descuento en repuestos',
  'Digital bike history log': 'Historial digital de la bici',
  'Emergency services, discount on extra services, unlimited visits. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
    'Servicios de emergencia, descuento en servicios extra, visitas ilimitadas. Repuestos o componentes de reemplazo (cadenas, desviadores, mordazas de freno, cables) - se cobran aparte a precio de costo.',
  'A regular Tune-Up costs $109. With Basic you save $52/month.':
    'Un Ajuste normal cuesta $109. Con Basic ahorrás $52/mes.',
  '2 free services per month (any type), visit & diagnosis fee included':
    '2 servicios gratis por mes (cualquier tipo), visita y diagnóstico incluida',
  '15% discount on parts': '15% de descuento en repuestos',
  '1 emergency callout per month': '1 visita de emergencia por mes',
  'Unlimited visits, discount on services beyond monthly limit. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
    'Visitas ilimitadas, descuento en servicios más allá del límite mensual. Repuestos o componentes de reemplazo (cadenas, desviadores, mordazas de freno, cables) - se cobran aparte a precio de costo.',
  'Unlimited visits. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
    'Visitas ilimitadas. Repuestos o componentes de reemplazo (cadenas, desviadores, mordazas de freno, cables) - se cobran aparte a precio de costo.',
  '2 services/month = $218 value. With Standard you save $121/month.':
    '2 servicios/mes = valor de $218. Con Standard ahorrás $121/mes.',
  '20% discount on parts': '20% de descuento en repuestos',
  'High-end parts (charged at cost). Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
    'Repuestos de alta gama (se cobran a precio de costo). Repuestos o componentes de reemplazo (cadenas, desviadores, mordazas de freno, cables) - se cobran aparte a precio de costo.',
  'Unlimited services + emergency = $400+ value. With VIP you save $250+/month.':
    'Servicios ilimitados + emergencias = valor de $400+. Con VIP ahorrás $250+/mes.',
  'Get Started - $97/month': 'Comenzar - $97/mes',
  'Get Started - $67/month': 'Comenzar - $67/mes',
  'Get Started - $197/month': 'Comenzar - $197/mes',
  'Get Started -': 'Comenzar -',

  // ── Membership redesign 2026-07-22 (3 free-quota categories) ─────────
  '1 free minor repair (under $60) + 1 free bike wash per month':
    '1 reparación menor gratis (menos de $60) + 1 lavado gratis por mes',
  '5% off extra services': '5% de descuento en servicios extra',
  '10% off extra services': '10% de descuento en servicios extra',
  'Visit & diagnosis applies (from $25, depending on your suburb)':
    'Se cobra la visita y diagnóstico (desde $25, según tu suburbio)',
  'Priority scheduling (72hs)': 'Turnos prioritarios (72hs)',
  '2 free minor repairs (under $60) + 1 free bike wash + 1 free Tune-Up per month':
    '2 reparaciones menores gratis (menos de $60) + 1 lavado gratis + 1 Ajuste gratis por mes',
  'Visit & diagnosis included': 'Visita y diagnóstico incluida',
  '1 emergency callout per month (visit & diagnosis fee applies)':
    '1 visita de emergencia por mes (se cobra la visita y diagnóstico)',
  '3 free minor repairs (under $60) + 2 free bike washes + 1 free Tune-Up per month':
    '3 reparaciones menores gratis (menos de $60) + 2 lavados gratis + 1 Ajuste gratis por mes',
  '15% off extra services, plus 5% more': '15% de descuento en servicios extra, más 5% adicional',
  '1 emergency callout per month (visit & diagnosis fee waived in your zone)':
    '1 visita de emergencia por mes (visita y diagnóstico gratis dentro de tu zona)',
  '1 free minor repair per month (any repair under $60)':
    '1 reparación menor gratis por mes (cualquier arreglo de menos de $60)',
  '1 free bike wash per month': '1 lavado de bici gratis por mes',
  'Digital service history log is a Standard/VIP perk. Visit & diagnosis is not included - the visit & diagnosis fee (from $25, depending on your suburb) still applies to your covered visits. Full maintenance services (Tune-Up and up) are not part of the free minor-repair quota. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
    'El historial digital de servicios es un beneficio Standard/VIP. La visita y diagnóstico no está incluida - se cobra igual la visita y diagnóstico (desde $25, según tu suburbio) en tus visitas cubiertas. Las mantenciones completas (Ajuste en adelante) no forman parte de la cuota de reparaciones menores gratis. Repuestos o componentes de reemplazo (cadenas, desviadores, mordazas de freno, cables) - se cobran aparte a precio de costo.',
  'A wash plus an average minor repair is worth around $75. With Basic ($67/month) you come out ahead before the 5% discount on anything else.':
    'Un lavado más una reparación menor promedio vale unos $75. Con Basic ($67/mes) ya salís ganando, antes del 5% de descuento en todo lo demás.',
  '2 free minor repairs per month (any repair under $60)':
    '2 reparaciones menores gratis por mes (cualquier arreglo de menos de $60)',
  '1 free Tune-Up per month': '1 Ajuste gratis por mes',
  'Visit & diagnosis included on covered visits':
    'Visita y diagnóstico incluida en las visitas cubiertas',
  '1 emergency callout per month (visit & diagnosis fee applies, from $25 depending on your suburb)':
    '1 visita de emergencia por mes (se cobra la visita y diagnóstico, desde $25 según tu suburbio)',
  'Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
    'Repuestos o componentes de reemplazo (cadenas, desviadores, mordazas de freno, cables) - se cobran aparte a precio de costo.',
  'A Tune-Up ($109) + a wash ($35) + 2 minor repairs (~$80) = about $224 in free work every month, for $97.':
    'Un Ajuste ($109) + un lavado ($35) + 2 reparaciones menores (~$80) = unos $224 en trabajo gratis cada mes, por $97.',
  '3 free minor repairs per month (any repair under $60)':
    '3 reparaciones menores gratis por mes (cualquier arreglo de menos de $60)',
  '2 free bike washes per month': '2 lavados de bici gratis por mes',
  'A Tune-Up ($109) + 2 washes ($70) + 3 minor repairs (~$120) = about $299 in free work every month, for $197.':
    'Un Ajuste ($109) + 2 lavados ($70) + 3 reparaciones menores (~$120) = unos $299 en trabajo gratis cada mes, por $197.',

  // ── Gift card success alert ──────────────────────────────────────────
  '🎁 Gift card purchased! It has been emailed to the recipient with their unique code.':
    '🎁 ¡Gift card comprada! Se envió por correo al destinatario con su código único.',

  // ── Review modal ────────────────────────────────────────────────────────
  Terrible: 'Terrible',
  Poor: 'Malo',
  OK: 'Regular',
  Good: 'Bueno',
  Excellent: 'Excelente',
  'How was your service?': '¿Cómo estuvo tu servicio?',
  'Your feedback helps us improve': 'Tu opinión nos ayuda a mejorar',
  'Your comments': 'Tus comentarios',
  'Tell us what you loved or what we can improve...':
    'Contanos qué te gustó o qué podemos mejorar...',
  'Add a photo': 'Agregar una foto',
  'Tap to add a photo': 'Tocá para agregar una foto',
  'Remove photo': 'Quitar foto',
  'Submit review': 'Enviar reseña',
  'Maybe later': 'Tal vez después',
  'Please select a star rating first': 'Por favor, elegí primero una calificación con estrellas',
  'Submitting...': 'Enviando...',
  'Could not submit review': 'No se pudo enviar la reseña',
  'Thank you!': '¡Gracias!',
  'Your review has been submitted': 'Tu reseña fue enviada',
  'Also leave a Google review?': '¿Querés dejar también una reseña en Google?',
  'Helps cyclists find us': 'Ayuda a otros ciclistas a encontrarnos',
  'Connection error — try again': 'Error de conexión - intentá de nuevo',
  'Uploading photo...': 'Subiendo foto...',
  'Change photo': 'Cambiar foto',

  // ── Client <-> mechanic chat modal (landing.html) ──────────────────────
  'Online now': 'En línea ahora',
  'Message failed to send': 'No se pudo enviar el mensaje',
  'Loading messages...': 'Cargando mensajes...',
  'No messages yet': 'Todavía no hay mensajes',
  'Send a message to your mechanic': 'Enviale un mensaje a tu mecánico',

  // ── Floating FAQ chatbot ────────────────────────────────────────────────
  'Chat with Dr. Bike': 'Chatear con Dr. Bike',
  'Dr. Bike Assistant': 'Asistente de Dr. Bike',
  'Ask me anything': 'Preguntame lo que quieras',
  'Type your question...': 'Escribí tu pregunta...',
  'Type your question': 'Escribí tu pregunta',
  'What does a Tune-Up include?': '¿Qué incluye un Ajuste?',
  'Which areas do you cover?': '¿Qué zonas cubren?',
  'How do memberships work?': '¿Cómo funcionan las membresías?',
  'Do you fix e-bikes?': '¿Reparan e-bikes?',
  "Sorry, I couldn't process that. Call us on 0433 963 250.":
    'Perdón, no pude procesar eso. Llamanos al 0433 963 250.',
  "Sorry, I'm having trouble right now. Call us on 0433 963 250. 🔧":
    'Perdón, estoy teniendo problemas en este momento. Llamanos al 0433 963 250. 🔧',
  "G'day! I'm the Dr. Bike assistant. Ask me about services, prices, coverage areas or memberships. 🚲":
    '¡Hola! Soy el asistente de Dr. Bike. Preguntame sobre servicios, precios, zonas de cobertura o membresías. 🚲',

  // ── FAQ (landing.html specific answers) ───────────────────────────────
  'We service all Sydney metro including Inner West, Eastern Suburbs, CBD, North Shore, Manly, and Northern Beaches.':
    'Cubrimos toda el área metropolitana de Sydney, incluyendo Inner West, Eastern Suburbs, CBD, North Shore, Manly y Northern Beaches.',
  'You can reschedule or cancel up to 2 hours before your appointment at no charge.':
    'Podés reprogramar o cancelar hasta 2 horas antes de tu turno sin cargo.',
  "Yes, we carry common parts in the van, but they are not included in the service price — they're charged separately at cost price with no markup.":
    'Sí, llevamos repuestos comunes en la van, pero no están incluidos en el precio del servicio - se cobran aparte a precio de costo sin recargo.',
  'A basic tune-up takes 45-90 minutes. Full services can take 2-3 hours depending on the work required.':
    'Un ajuste básico toma 45-90 minutos. Los servicios completos pueden tomar 2-3 horas según el trabajo requerido.',
  'We accept all major credit cards, debit cards, Apple Pay, and Google Pay. Payment is taken after service completion.':
    'Aceptamos todas las tarjetas de crédito y débito principales, Apple Pay y Google Pay. El pago se cobra al completar el servicio.',
  'Still have questions?': '¿Tenés más preguntas?',
  "We're here to help! Contact us and we'll get back to you within the hour.":
    '¡Estamos para ayudarte! Contactanos y te respondemos dentro de la hora.',

  // ── Fleet / Corporate (B2B) ────────────────────────────────────────────
  'For businesses': 'Para empresas',
  'Keep your whole fleet rolling': 'Mantené toda tu flota rodando',
  'One mechanic, your entire team. We come to your office or depot and service all bikes in a single visit — no downtime, no logistics hassle.':
    'Un mecánico, todo tu equipo. Vamos a tu oficina o depósito y reparamos todas las bicis en una sola visita - sin tiempos muertos, sin complicaciones logísticas.',
  'On-site service': 'Servicio en el lugar',
  'We come to your office, warehouse or depot. Zero travel time for your team.':
    'Vamos a tu oficina, depósito o almacén. Cero tiempo de viaje para tu equipo.',
  'Volume pricing': 'Precios por volumen',
  'Custom rates for 5+ bikes. The more bikes, the better the deal.':
    'Tarifas personalizadas para 5+ bicis. Cuantas más bicis, mejor el precio.',
  'Priority scheduling': 'Turnos prioritarios',
  'Fleet clients get first access to bookings and a dedicated point of contact.':
    'Los clientes de flota tienen acceso prioritario a turnos y un contacto dedicado.',
  'Service reports': 'Informes de servicio',
  'Full PDF report per bike after every visit. Track the health of your entire fleet.':
    'Informe PDF completo por bici después de cada visita. Seguí el estado de toda tu flota.',
  'bikes serviced': 'bicis reparadas',
  'response time': 'tiempo de respuesta',
  'call-out for fleets': 'de visita para flotas',
  'Get a fleet quote': 'Cotizá tu flota',
  "We'll reply within 2 business hours": 'Te respondemos dentro de 2 horas hábiles',
  'Business name *': 'Nombre de la empresa *',
  'Your name *': 'Tu nombre *',
  'Work email *': 'Correo laboral *',
  Phone: 'Teléfono',
  'Fleet size *': 'Tamaño de la flota *',
  'Fleet size': 'Tamaño de la flota',
  'Service frequency': 'Frecuencia de servicio',
  'Select...': 'Seleccioná...',
  '2-5 bikes': '2-5 bicis',
  '6-15 bikes': '6-15 bicis',
  '16-30 bikes': '16-30 bicis',
  '31-50 bikes': '31-50 bicis',
  '50+ bikes': '50+ bicis',
  'Not sure yet': 'Todavía no sé',
  Quarterly: 'Trimestral',
  'Bi-annually': 'Semestral',
  'One-off': 'Puntual',
  Notes: 'Notas',
  'Types of bikes, location, any specific issues...':
    'Tipos de bicis, ubicación, algún problema específico...',
  'Request Fleet Quote': 'Solicitar Cotización de Flota',
  "No commitment required. We'll build a custom plan for your team.":
    'Sin compromiso. Armamos un plan a medida para tu equipo.',
  "Thanks! We'll be in touch within 2 business hours.":
    '¡Gracias! Te contactamos dentro de 2 horas hábiles.',
  'Check your inbox for a confirmation.': 'Revisá tu correo para la confirmación.',
  'Quote Requested': 'Cotización Solicitada',
  'Something went wrong. Please email us directly.':
    'Algo salió mal. Por favor escribinos directamente.',

  // ── Final CTA ───────────────────────────────────────────────────────────
  'Ready to Experience Premium Bike Service?': '¿Listo para Experimentar un Servicio Premium?',

  // ── Footer ──────────────────────────────────────────────────────────────
  'Professional bike service at your doorstep.': 'Servicio profesional de bicicletas en tu puerta.',
  Facebook: 'Facebook',
  Instagram: 'Instagram',
  YouTube: 'YouTube',
  'Basic Service': 'Servicio Basic',
  'Premium Service': 'Servicio Premium',
  'Our Story': 'Nuestra Historia',
  Reviews: 'Reseñas',
  'Booking Help': 'Ayuda con Reservas',
  'Submit a Claim': 'Enviar un Reclamo',
  '© 2026 Dr. Bike Sydney. All rights reserved.':
    '© 2026 Dr. Bike Sydney. Todos los derechos reservados.',

  // ── Newsletter signup ───────────────────────────────────────────────────
  'STAY IN THE LOOP': 'MANTENETE AL DÍA',
  'Cycling Tips & Offers': 'Tips de Ciclismo y Ofertas',
  Subscribe: 'Suscribirse',
  'Please enter a valid email address.': 'Por favor, ingresá un correo válido.',
  'Please wait a moment for the security check to finish, then try again.':
    'Esperá un momento a que termine la verificación de seguridad e intentá de nuevo.',
  '✅ Subscribed! Check your inbox for a 10% off code.':
    '✅ ¡Suscripto! Revisá tu correo por un código de 10% de descuento.',
  'Could not subscribe. Please try again.': 'No se pudo suscribir. Por favor, intentá de nuevo.',
  'No spam. Unsubscribe anytime.': 'Sin spam. Cancelá cuando quieras.',
  'Monthly bike maintenance tips, seasonal safety advice and exclusive offers for Dr. Bike subscribers. Use code':
    'Tips mensuales de mantenimiento de bici, consejos de seguridad de temporada y ofertas exclusivas para suscriptores de Dr. Bike. Usá el código',
  'for 10% off your first booking.': 'para 10% de descuento en tu primera reserva.',

  // ── Mobile SPA: form placeholders (My Bikes "add a bike" form) ─────────
  Brand: 'Marca',
  Color: 'Color',
  Model: 'Modelo',
  'Name (e.g. Red Trek)*': 'Nombre (ej. Trek Roja)*',
  Year: 'Año',
  'e.g. 14 Smith St, Surry Hills NSW 2010': 'ej. 14 Smith St, Surry Hills NSW 2010',
  'Type a message...': 'Escribí un mensaje...',

  // ── Mobile SPA: toast messages (showToast) ──────────────────────────────
  'Account created! Check your email to verify.':
    '¡Cuenta creada! Revisá tu correo para verificar.',
  'Bike added!': '¡Bici agregada!',
  'Booking cancelled.': 'Reserva cancelada.',
  'Booking rescheduled!': '¡Reserva reprogramada!',
  'Code copied!': '¡Código copiado!',
  'Could not delete bike. Try again.': 'No se pudo eliminar la bici. Intentá de nuevo.',
  'Membership will cancel at period end': 'La membresía se cancelará al final del período',
  'No active booking.': 'No tenés una reserva activa.',
  'Notification permission was not granted': 'No se otorgó permiso de notificaciones',
  'Notifications are not set up yet - try again later':
    'Las notificaciones aún no están configuradas - intentá más tarde',
  'Notifications enabled!': '¡Notificaciones activadas!',
  'Push notifications are not supported on this browser':
    'Este navegador no soporta notificaciones push',
  'Select a date.': 'Elegí una fecha.',
  'Signed out successfully': 'Sesión cerrada con éxito',
  'Thanks for your feedback!': '¡Gracias por tu opinión!',
  'Your review is now on our page. Thank you for taking the time.':
    'Tu reseña ya está en nuestra página. Gracias por tomarte el tiempo.',
  'Would you share it on Google too? It helps other Sydney cyclists find us.':
    '¿La compartirías también en Google? Ayuda a que otros ciclistas de Sídney nos encuentren.',
  'That service is no longer available. Please pick a new one.':
    'Ese servicio ya no está disponible. Por favor, elegí uno nuevo.',
  'Tracking link copied!': '¡Enlace de rastreo copiado!',
  'Welcome back!': '¡Bienvenido de nuevo!',
  // Recuperar contraseña desde la landing (no existia hasta 2026-08-06).
  'If that email has an account, we just sent a reset link.':
    'Si ese email tiene cuenta, acabamos de enviarte un link para restablecerla.',
  'Enter your email first, then tap Forgot Password.':
    'Escribí tu email primero y después tocá "Olvidé mi contraseña".',
  'Could not send the reset link. Please try again.': 'No pudimos enviar el link. Probá de nuevo.',
  // "Olvide con que email me registre" (seccion 15.3). Un email no se
  // resetea, se recuerda: hace falta el telefono de la cuenta.
  'Forgot your email?': '¿Olvidaste tu email?',
  'Enter the mobile number on your account and we will text you the email you signed up with.':
    'Escribí el celular de tu cuenta y te mandamos por SMS el email con el que te registraste.',
  'Send it to me': 'Enviármelo',
  'If that number has an account, we just texted you the email':
    'Si ese número tiene cuenta, acabamos de enviarte el email por SMS',
  // Guest checkout: booking without an account (docs/PENDIENTES.md 14).
  'Where do we send your booking?': '¿A dónde te mandamos la reserva?',
  'No account needed. We only use this to confirm your booking and let the mechanic reach you.':
    'No hace falta cuenta. Solo lo usamos para confirmarte la reserva y que el mecánico te pueda contactar.',
  Mobile: 'Celular',
  'I already have an account': 'Ya tengo cuenta',
  'Please enter your name': 'Escribí tu nombre',
  'Please enter a valid email': 'Escribí un email válido',
  'Please enter a valid mobile number': 'Escribí un celular válido',
  'Jane Smith': 'Juana Pérez',
  'you@email.com': 'tu@email.com',
  // Shown at the summary when someone without an account tries to pay. It
  // used to let them pay first and only then ask, which took $20 off a real
  // customer on 2026-08-05 - and the message she got was hardcoded English.
  'Please create an account or sign in to finish your booking':
    'Creá una cuenta o iniciá sesión para terminar tu reserva',
  'Please sign in to complete your booking.': 'Iniciá sesión para completar tu reserva.',
  'Please sign in to send a message.': 'Iniciá sesión para enviar un mensaje.',
  'Please sign in again.': 'Iniciá sesión de nuevo.',
  'We need an email to send your receipt.': 'Necesitamos un email para enviarte el recibo.',
  "Sorry, we don't currently service that address. Try a different address or contact us.":
    'Lo sentimos, no cubrimos esa dirección por ahora. Probá con otra dirección o contactanos.',

  // ── Mobile SPA: dynamic button/status text ──────────────────────────────
  'Checking address...': 'Verificando dirección...',
  'Processing payment...': 'Procesando pago...',
  'Payment received but the booking could not be saved. Tap Pay again to retry, or contact us.':
    'Recibimos tu pago, pero no pudimos guardar la reserva. Tocá Pagar otra vez para reintentar, o escribinos.',
  'Payment failed. Please check your card details and try again.':
    'El pago no se pudo procesar. Revisá los datos de tu tarjeta e intentá de nuevo.',
  'Nickname is required': 'El apodo es obligatorio',
  'Delete this bike?': '¿Borrar esta bici?',
  'Could not confirm booking. Please try again.':
    'No pudimos confirmar la reserva. Intentá de nuevo.',
  'Could not submit review. Please try again.': 'No pudimos enviar tu reseña. Intentá de nuevo.',
  'Google login failed. Please try again.':
    'No se pudo iniciar sesión con Google. Intentá de nuevo.',
  'Invalid code': 'Código inválido',
  'Payment could not be confirmed. Please contact us if you were charged.':
    'No pudimos confirmar el pago. Escribinos si te hicieron el cargo.',
  'Test booking failed': 'La reserva de prueba falló',
  // Confirm dialog (js/components.js). The one-sentence version of the
  // membership warning was the old confirm() text; it is split now because a
  // dialog has a title and a body.
  Confirm: 'Confirmar',
  Delete: 'Borrar',
  'Keep it': 'Dejarla',
  'This cannot be undone.': 'Esto no se puede deshacer.',
  'Cancel your membership?': '¿Cancelar tu membresía?',
  'Cancel membership': 'Cancelar membresía',
  'It will stay active until the end of the current billing period.':
    'Seguirá activa hasta el final del período de facturación actual.',
  // navigator.share() title - it is what the recipient sees in the share
  // sheet, so it is UI copy. Missed until the check learned to read
  // `title:` properties (2026-08-03).
  'Track my Dr. Bike service': 'Seguimiento de mi servicio Dr. Bike',
  // Set by the inline scripts in landing.html / index.html
  'Processing...': 'Procesando...',
  'Redirecting to payment...': 'Redirigiendo al pago...',
  'Choose an amount between $20 and $1000.': 'Elige un monto entre $20 y $1000.',
  'Creating test booking...': 'Creando reserva de prueba...',
  'Photo selected — tap to change': 'Foto seleccionada — tocá para cambiar',
  'Tap to add a photo (optional)': 'Tocá para agregar una foto (opcional)',
  'Please select a rating.': 'Por favor, elegí una calificación.',
  'Loading...': 'Cargando...',
  'Confirm reschedule': 'Confirmar reprogramación',
  'No service data yet': 'Aún no hay datos de servicio',
  'No checklist data': 'Sin datos de checklist',
  'Could not load health data': 'No se pudieron cargar los datos de salud',

  // ── Full i18n sweep 2026-07-26: strings rendered by js/app.js, index.html
  // and landing.html that had no dictionary entry (found by walking every
  // text node / placeholder / aria-label and testing it against the dict).
  'Included in your membership': 'Incluido en tu membresía',
  'Confirm booking': 'Confirmar reserva',
  'or pay by card': 'o paga con tarjeta',
  'Card details': 'Datos de la tarjeta',
  'Secure payment powered by Stripe. Encrypted and safe.':
    'Pago seguro con Stripe. Cifrado y protegido.',
  'Prefer to book manually?': '¿Prefieres reservar manualmente?',
  'call 0433 963 250': 'llama al 0433 963 250',
  'Select a time.': 'Selecciona un horario.',
  'Sign in to track bookings': 'Inicia sesión para rastrear tus reservas',
  'Your bookings will appear here': 'Tus reservas aparecerán aquí',
  'Book a service to track it here': 'Reserva un servicio para rastrearlo aquí',
  'Could not load bookings. Try again.': 'No se pudieron cargar las reservas. Intenta de nuevo.',
  'Your code:': 'Tu código:',
  '— read this to your mechanic when they arrive': '— dile este código al mecánico cuando llegue',
  'Cancellation reason': 'Motivo de cancelación',
  Photos: 'Fotos',
  Before: 'Antes',
  After: 'Después',
  '⭐ Rate this mechanic': '⭐ Califica al mecánico',
  'Thanks for the 5 stars!': '¡Gracias por las 5 estrellas!',
  'Would you mind leaving a quick Google review? It helps other Sydney cyclists find us.':
    '¿Nos dejas una reseña rápida en Google? Ayuda a que otros ciclistas de Sydney nos encuentren.',
  'Leave a Google Review': 'Dejar una reseña en Google',
  'Share on Facebook': 'Compartir en Facebook',
  'Skip — back to home': 'Omitir — volver al inicio',
  'Rate your experience': 'Califica tu experiencia',
  '📞 Call': '📞 Llamar',
  '1. Share your code with friends': '1. Comparte tu código con amigos',
  Language: 'Idioma',
  'Sign Out': 'Cerrar sesión',
  'Loading bikes...': 'Cargando bicis...',
  'Type (optional)': 'Tipo (opcional)',
  Road: 'Ruta',
  'Mountain Bike': 'Mountain bike',
  Hybrid: 'Híbrida',
  Cargo: 'Carga',
  Folding: 'Plegable',
  'Save Bike': 'Guardar bici',
  'Bike Health Score': 'Puntaje de salud de la bici',
  'Service history': 'Historial de servicios',
  'Delete bike': 'Eliminar bici',
  'Failed to load bikes': 'No se pudieron cargar las bicis',
  'Bike name': 'Nombre de la bici',
  'Bike type': 'Tipo de bici',
  '🔍 Analysing your photo...': '🔍 Analizando tu foto...',
  '🔍 Analysing...': '🔍 Analizando...',
  '🤖 AI Recommendation': '🤖 Recomendación de la IA',
  'Describe the problem': 'Describe el problema',
  'Close chat': 'Cerrar chat',
  'Type a message': 'Escribe un mensaje',
  'Toggle password visibility': 'Mostrar u ocultar la contraseña',
  'Could not enable notifications:': 'No se pudieron activar las notificaciones:',
  '100% Satisfaction': '100% Satisfacción',
  'Trusted by cyclists across Sydney': 'Elegido por ciclistas de todo Sydney',
  'Be the first to leave a review': 'Sé el primero en dejar una reseña',
  'Real reviews from Sydney cyclists will show up here as soon as clients start sharing their experience.':
    'Las reseñas reales de ciclistas de Sydney aparecerán aquí en cuanto los clientes empiecen a compartir su experiencia.',
  'Site navigation': 'Navegación del sitio',
  'Main navigation': 'Navegación principal',
  'Phone Number': 'Número de teléfono',
  'Business name': 'Nombre de la empresa',
  'Work email': 'Correo de trabajo',
  'Custom gift amount': 'Monto personalizado del regalo',
  "Recipient's email": 'Correo del destinatario',
  'Adjust brakes & gears, lube chain, safety check':
    'Ajuste de frenos y cambios, lubricación de cadena y chequeo de seguridad',
  'Complete overhaul: bearings, cables, full clean':
    'Revisión completa: rodamientos, cables y limpieza total',
  '© 2026 Dr. Bike Sydney. All rights reserved. · ABN: 87 654 025 287':
    '© 2026 Dr. Bike Sydney. Todos los derechos reservados. · ABN: 87 654 025 287',

  // Interpolated sentence: the two amounts are substituted after the lookup
  // (a text node containing a number can never match a dictionary key), so
  // the placeholders CALLOUT and SERVICE must survive translation verbatim.
  'The $CALLOUT visit & diagnosis fee is charged now via Stripe. The service fee ($SERVICE) is paid to the mechanic directly by card (EFTPOS) when they arrive.':
    'La visita y diagnóstico de $CALLOUT se cobra ahora con Stripe. El servicio ($SERVICE) se le paga al mecánico con tarjeta (EFTPOS) cuando llega.',

  // The two pay buttons, same placeholder trick. They shipped in English in
  // every language until 2026-07-28 because the amount was baked into the
  // string: "Pay $20.00 Visit & Diagnosis" matches no key, and it is the button
  // the client presses to pay.
  'Confirm & Pay $CALLOUT Visit & Diagnosis':
    'Confirmar y pagar la visita y diagnóstico de $CALLOUT',
  'Pay $CALLOUT Visit & Diagnosis': 'Pagar la visita y diagnóstico de $CALLOUT',

  // ── track.html (public tracking link) — was English-only until 2026-07-26
  'Loading your booking...': 'Cargando tu reserva...',
  'This link is no longer valid.': 'Este enlace ya no es válido.',
  'Look up your booking by email →': 'Busca tu reserva por correo →',
  'Booking not found.': 'No encontramos la reserva.',
  '← Back to Dr. Bike': '← Volver a Dr. Bike',
  // A dead network is not a missing booking - track.html used to say the
  // second thing when the first happened.
  'We could not reach Dr. Bike. Check your connection and try again - your booking is safe.':
    'No pudimos conectar con Dr. Bike. Revisá tu conexión y probá de nuevo: tu reserva está a salvo.',
  'Try again': 'Probar de nuevo',
  'Live updates stopped. Reload to try again.':
    'Las actualizaciones en vivo se detuvieron. Recargá para reintentar.',
  '⏳ Pending confirmation': '⏳ Pendiente de confirmación',
  '✅ Confirmed': '✅ Confirmada',
  '🚐 Mechanic on the way!': '🚐 ¡El mecánico está en camino!',
  '✅ Service completed': '✅ Servicio completado',
  Van: 'Camioneta',
  'Service price': 'Precio del servicio',
  'Locating mechanic...': 'Ubicando al mecánico...',
  Live: 'En vivo',
  'Your mechanic is on the way!': '¡Tu mecánico está en camino!',
  'Your mechanic has arrived!': '¡Tu mecánico llegó!',
  'This page updates automatically': 'Esta página se actualiza automáticamente',
  'Questions? Contact us': '¿Dudas? Contáctanos',
  '📞 Call +61 433 963 250': '📞 Llamar al +61 433 963 250',
  '🔧 Parts:': '🔧 Repuestos:',
  '📅 Next service:': '📅 Próximo servicio:',
  '🕐 Estimated arrival: ~MIN min': '🕐 Llegada estimada: ~MIN min',
  'Track your booking': 'Rastrea tu reserva',
  'Enter the email you used to book': 'Ingresa el correo que usaste para reservar',
  'Find my bookings →': 'Buscar mis reservas →',
  'Enter a valid email': 'Ingresa un correo válido',
  'Searching...': 'Buscando...',
  'If that email has any bookings, we just sent tracking links for all of them.':
    'Si ese correo tiene reservas, acabamos de enviarte los enlaces de seguimiento de todas.',
  'Connection error. Try again.': 'Error de conexión. Intenta de nuevo.',
  'your@email.com': 'tu@correo.com',
  'August 2026': 'Agosto 2026',
  '2 reviews on Google': '2 reseñas en Google',
  // ── Supabase `services` catalog ──────────────────────────────────────────
  // Booking step 1 (js/app.js renderStep1 -> createServiceCard) prints `name`
  // and `description` straight out of the Supabase `services` table. Those are
  // DATA, not markup, so scripts/i18n-check.mjs cannot see them - which is why
  // 32 of the 33 descriptions and 11 of the 33 names rendered in English for
  // every Spanish and Chinese client while the check stayed green.
  //
  // Two rules for this block:
  //  1. A catalog row that also exists under a MARKETING name above must reuse
  //     that exact translation. The table says "Chain Install", the landing
  //     card says "Chain Replacement"; two different Spanish words for them
  //     would put two names for one service in front of the same client.
  //  2. It stays LAST in the dictionary. sourceOf()'s reverse index keeps the
  //     FIRST definition of a translated string, so the marketing name keeps
  //     winning the lookup js/live-prices.js does - the one it needs to match
  //     a card heading back to a priced row.
  //
  // After editing a service in Admin > Services & Prices, run
  // `npm run services:check`: it reads the live table and names every row
  // whose name or description no longer has an entry here. Editing the
  // English text in Admin does not break anything - that row just falls back
  // to English until someone adds the new wording below.
  'Brake Pad Install': 'Reemplazo de Pastillas de Freno',
  'Brake Bleed': 'Purga Hidráulica',
  'Bar Tape Install': 'Cinta de Manubrio',
  'Chain Install': 'Reemplazo de Cadena',
  'Cassette Install': 'Cambio de Cassette/Piñón Libre',
  'Bottom Bracket Install': 'Servicio de Caja Pedalera',
  'E-bike service': 'Servicio de E-Bike',
  'External Cable Install': 'Cables y Fundas',
  'Wheel Truing — Minor': 'Centrado de Rueda - Menor',
  'Wheel Truing — Major': 'Centrado de Rueda - Mayor',
  'Tyre / Tube Install': 'Reparación de Pinchazo',
  'Pad alignment, cable tension, lever reach':
    'Centramos las pastillas, ajustamos el cable y la distancia de la maneta',
  'Full hydraulic brake system installation.':
    'Instalamos el sistema de frenos hidráulicos completo.',
  'Disc brake pad replacement per end.': 'Cambio de pastillas de freno a disco, por rueda.',
  'Full hydraulic bleed per end. Both ends $105.':
    'Purga hidráulica completa, por rueda. Las dos, $105.',
  'Height, fore-aft and tilt optimised': 'Ajustamos altura, retroceso e inclinación del asiento',
  'Professional bar tape wrap on drop bars.': 'Encintado profesional de manubrio de ruta.',
  'Remove and refit handlebars.': 'Sacamos y volvemos a montar el manubrio.',
  'Clean, adjust and regrease headset': 'Limpiamos, engrasamos y ajustamos la dirección',
  'True the hanger derailleur with specifics tools. The setting of the gears are included in the price':
    'Enderezamos la patilla de cambio con herramienta específica. El ajuste de los cambios va incluido en el precio.',
  'Fit and size a new chain.': 'Colocamos una cadena nueva y la dejamos a la medida.',
  'Cassette removal and refitting.': 'Sacamos el cassette viejo y montamos el nuevo.',
  'BB removal and new unit installation.': 'Sacamos la caja pedalera y colocamos una nueva.',
  'Software update for e-bike motor and display.':
    'Actualizamos el software del motor y la pantalla de la e-bike.',
  'Check cables connections and all the bolts and adjustments of brakes and gears':
    'Revisamos cables y conexiones, apretamos toda la tornillería y ajustamos frenos y cambios',
  'Front or rear derailleur installation.': 'Instalamos el cambio delantero o trasero.',
  'Derailleur indexing and cable tension adjustment.':
    'Ajustamos el cambio y la tensión del cable para que entre limpio.',
  'Replace outer and inner cables.': 'Cambiamos los cables y las fundas.',
  'Professional fitting of accessories.': 'Montaje profesional de accesorios.',
  'Full assembly of a new boxed bike. Price change depending on the size and kind of bike.':
    'Armamos tu bici nueva desde la caja. El precio cambia según el tamaño y el tipo de bici.',
  'Urgent same-day help. Contact us directly on 0433 963 250 and we quote your repair.':
    'Ayuda urgente el mismo día. Llamanos al 0433 963 250 y te pasamos el precio de la reparación.',
  'Safety check, gear & brake adjustment, tyre pressure and drivetrain lube.':
    'Revisión de seguridad, ajuste de cambios y frenos, presión de cubiertas y lubricado de la transmisión.',
  'Tune-Up plus drivetrain clean, minor wheel true and inspection report.':
    'Todo el Tune-Up más limpieza de transmisión, centrado suave de ruedas e informe de revisión.',
  'Everything in Standard plus new cables, wheel truing and headset check.':
    'Todo lo del Standard más cables nuevos, centrado de ruedas y revisión de la dirección.',
  'Complete strip-and-rebuild. Every component inspected, adjusted or replaced.':
    'Desarme y armado completo. Revisamos, ajustamos o cambiamos cada componente.',
  'Air spring disassembly and new o-rings.':
    'Desarmamos el resorte neumático y ponemos o-rings nuevos.',
  'Full lower leg strip, clean and oil refresh.':
    'Desarme completo de barras, limpieza y aceite nuevo.',
  'Spoke tension adjustment for small deviations.':
    'Ajustamos la tensión de los rayos para desvíos chicos.',
  'Tyre and tube replacement per wheel.': 'Cambio de cubierta y cámara, por rueda.',
  'Significant spoke tension correction.':
    'Corregimos desvíos grandes ajustando la tensión de los rayos.',
  'Tubeless conversion per wheel.': 'Conversión a tubeless, por rueda.',
  'Per spoke, includes wheel re-true': 'Por rayo, con centrado de la rueda incluido',
  'New tyre fitted, tyre cost extra': 'Colocamos la cubierta nueva; la cubierta se cobra aparte',
  // La pantalla de error que reemplaza la pagina en blanco (PENDIENTES 81).
  'This screen did not load': 'Esta pantalla no cargo',
  'Nothing you entered has been lost. Try again, or go back and come in from the home screen.':
    'No se perdio nada de lo que cargaste. Proba de nuevo, o volve y entra desde la pantalla de inicio.',
  'Something on this screen did not load': 'Algo de esta pantalla no cargo',
};
