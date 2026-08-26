// js/i18n.js — lightweight, dependency-free i18n for the vanilla mobile app.
// No build step, so translation is a post-render pass: after a screen's
// innerHTML is set, translateScreen() walks its text nodes and swaps any
// exact match found in the dictionary. Dynamic content (names, prices,
// dates) is untouched since it never matches a dictionary key verbatim.

const STORAGE_KEY = 'drbike-lang';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
];

const dict = {
  es: {
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
    'Could not send reset link. Please try again.':
      'No pudimos enviar el enlace. Intenta de nuevo.',
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
    "Why is the visit & diagnosis fee different for my suburb?":
      '¿Por qué la visita y diagnóstico cambia según mi suburbio?',
    "Because it pays for the trip, and what a trip really costs is time, not kilometres. From our Northern Beaches base the CBD is about 40 minutes across the Spit Bridge, while Hornsby is further away on the map but only 30 minutes up the motorway — so the CBD costs a little more. We work the fee out from real driving time to your address, which is why it's exact rather than a flat rate.":
      'Porque paga el viaje, y lo que un viaje cuesta de verdad es tiempo, no kilómetros. Desde nuestra base en Northern Beaches, el CBD está a unos 40 minutos cruzando el Spit Bridge, mientras que Hornsby queda más lejos en el mapa pero a solo 30 minutos por autopista, así que el CBD cuesta un poco más. Calculamos la tarifa con el tiempo real de manejo hasta tu dirección, por eso es exacta y no una tarifa plana.',
    "We quote that area case by case":
      'Esa zona la cotizamos caso por caso',
    "Continue - book at no cost":
      'Continuar - reservar sin costo',
    "It's outside our same-day zone, so there's no fixed price to show you - but we do still come. Book as usual and the last step asks for a price instead of a card: no charge, and the mechanic replies to you personally.":
      'Está fuera de nuestra zona de visitas del día, así que no hay un precio fijo para mostrarte, pero igual vamos. Reservá normalmente y el último paso te pide el precio en vez de la tarjeta: sin cargo, y el mecánico te responde personalmente.',
    "We don't reach that address yet": 'Todavía no llegamos a esa dirección',
    'No charge - we check your address and reply personally.':
      'Sin costo - revisamos tu dirección y te respondemos personalmente.',
    'Ask for my price': 'Consultar mi precio',
    'What the visit & diagnosis covers': 'Qué cubre la visita y diagnóstico',
    'A mechanic comes to you, inspects the whole bike and tells you exactly what it needs. If the repair is not possible - a part we do not carry, or a job that needs a machinist or welding - you are told on the spot and the service fee is not charged. The visit & diagnosis covers that inspection and is not refunded.': 'Un mecánico va hasta vos, revisa la bici entera y te dice exactamente qué necesita. Si la reparación no es posible - un repuesto que no llevamos, o un trabajo que necesita tornero o soldadura - te lo decimos ahí mismo y no se cobra el servicio. La visita y el diagnóstico cubren esa revisión y no se reembolsan.',
    'Waiting for a mechanic': 'Esperando un mecánico',
    'Assigned to your booking': 'Asignado a tu reserva',
    'Send a gift card': 'Regalar una tarjeta',
    'Any cyclist you know, delivered by email': 'Para cualquier ciclista, se entrega por email',
    'Buy': 'Comprar',
    'Recipient': 'Para',
    'Sender': 'De',
    'Another amount': 'Otro monto',
    'Between $20 and $1000.': 'Entre $20 y $1000.',
    'Continue to payment': 'Continuar al pago',
    'Optional': 'Opcional',
    'Secured by Stripe - delivered by email': 'Pago seguro con Stripe - se entrega por email',
    'We send the card straight to them.': 'La tarjeta le llega directo a esa persona.',
    'The whole Dr. Bike team wishes you a great one.': 'Todo el equipo de Dr. Bike te desea un gran día.',
    'Saved': 'Guardado',
    'Profile & settings': 'Perfil y ajustes',
    'Birthday': 'Cumpleaños',
    'Tell us the day and we\'ll send you something on it. We don\'t ask for the year.': 'Decinos el día y te mandamos algo. No te pedimos el año.',
    'Day': 'Día',
    'Month': 'Mes',
    'Pick a day and a month': 'Elegí un día y un mes',
    'That day does not exist in that month': 'Ese día no existe en ese mes',
    'Could not save your birthday': 'No pudimos guardar tu cumpleaños',
    'Saved - see you on the day': 'Guardado - nos vemos ese día',
    'Happy birthday, NAME!': '¡Feliz cumpleaños, NAME!',
    'Check your email - there is something from us in there.': 'Revisá tu email, que te dejamos algo.',
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
    'ETA': 'Llegada',
    'by road': 'por ruta',
    'straight line': 'en línea recta',
    'Mechanic is right outside!': '¡El mecánico está en la puerta!',
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
    "What does a visit cost?": '¿Cuánto Me Cuesta?',
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
    'Please sign in to confirm your booking.':
      'Por favor, iniciá sesión para confirmar tu reserva.',
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
    'Visit & diagnosis included on covered visits': 'Visita y diagnóstico incluida en las visitas cubiertas',
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
    'Professional bike service at your doorstep.':
      'Servicio profesional de bicicletas en tu puerta.',
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
    'Your review is now on our page. Thank you for taking the time.': 'Tu reseña ya está en nuestra página. Gracias por tomarte el tiempo.',
    'Would you share it on Google too? It helps other Sydney cyclists find us.': '¿La compartirías también en Google? Ayuda a que otros ciclistas de Sídney nos encuentren.',
    'That service is no longer available. Please pick a new one.':
      'Ese servicio ya no está disponible. Por favor, elegí uno nuevo.',
    'Tracking link copied!': '¡Enlace de rastreo copiado!',
    'Welcome back!': '¡Bienvenido de nuevo!',
    // Recuperar contraseña desde la landing (no existia hasta 2026-08-06).
    'If that email has an account, we just sent a reset link.':
      'Si ese email tiene cuenta, acabamos de enviarte un link para restablecerla.',
    'Enter your email first, then tap Forgot Password.':
      'Escribí tu email primero y después tocá "Olvidé mi contraseña".',
    'Could not send the reset link. Please try again.':
      'No pudimos enviar el link. Probá de nuevo.',
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
    'Confirm & Pay $CALLOUT Visit & Diagnosis': 'Confirmar y pagar la visita y diagnóstico de $CALLOUT',
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
  },
  zh: {
    // Catalogue services added 2026-08-02 - see the note in the es block.
    'E-bike Diagnostic': '电动车诊断',
    'Full system scan, firmware check and error code review.':
      '全面系统扫描、固件检查及错误代码排查。',
    'Full system scan, firmware check and error code review':
      '全面系统扫描、固件检查及错误代码排查',
    'Firmware Update': '固件更新',
    'Software update for e-bike motor and display': '电动车马达与显示器软件更新',
    'Cable connections, bolts, and a full brake and gear adjustment':
      '线缆接头、螺栓检查，以及刹车与变速的完整调校',
    'Bike Build — New Bike': '新车组装',
    'Full assembly of a new boxed bike.': '全新盒装自行车的完整组装。',
    'Full assembly of a new boxed bike': '全新盒装自行车的完整组装',
    'Tubeless Tyre Install': '无内胎轮胎安装',
    'Tubeless conversion per wheel': '每个车轮的无内胎改装',
    'Hydro Brake Install': '油压刹车安装',
    'Full hydraulic brake system installation': '完整油压刹车系统安装',
    'Derailleur Install': '变速器安装',
    'Front or rear derailleur installation': '前或后变速器安装',
    'True Hanger Derailleur': '变速勾爪校正',
    'Hanger straightened, gear setup included': '勾爪校直，含变速调校',
    'Handlebar Install': '车把安装',
    'Remove and refit handlebars': '拆卸并重新安装车把',
    'Accessory / Part Install': '配件／零件安装',
    'Professional fitting of accessories': '专业配件安装',
    'E-Bike & Electronics': '电动车与电子系统',
    Assembly: '组装',
    'Lower Leg Service': '前叉下管保养',
    'Full lower leg strip, clean and oil refresh': '前叉下管完整拆解、清洁与换油',
    'Air Can Service': '气室保养',
    'Air spring disassembly and new o-rings': '气压弹簧拆解与更换O型圈',
    'Urgent same-day help. Call us and we quote your repair on the spot.':
      '紧急同日服务。致电我们，我们当场为您的维修报价。',
    // Bottom nav
    Home: '主页',
    Bookings: '预订',
    Track: '追踪',
    'My Bikes': '我的自行车',
    Profile: '个人资料',
    // Home screen
    'Book a Service': '预约服务',
    'View Services': '查看服务',
    'View All': '查看全部',
    Services: '服务',
    // Login / Signup
    'Welcome Back!': '欢迎回来！',
    'Login to your account': '登录您的账户',
    'Continue with Google': '使用谷歌继续',
    or: '或',
    Email: '电子邮件',
    Password: '密码',
    'Forgot Password?': '忘记密码？',
    'Reset Password': '重置密码',
    "Enter your email and we'll send you a reset link": '输入您的邮箱，我们将发送重置链接',
    'Send reset link': '发送重置链接',
    'Back to sign in': '返回登录',
    "Don't remember your email either?": '也不记得您的邮箱了？',
    'WhatsApp us': '通过WhatsApp联系我们',
    'Please enter your email.': '请输入您的邮箱。',
    'Sending...': '发送中...',
    'Could not send reset link. Please try again.': '无法发送重置链接，请重试。',
    'Check your email': '请查看您的邮箱',
    'We sent a password reset link to': '我们已将密码重置链接发送至',
    'It can take a minute to arrive.': '可能需要几分钟才能收到。',
    'Resend email': '重新发送邮件',
    'Link sent': '链接已发送',
    'Set a new password': '设置新密码',
    'Choose a new password for your account.': '为您的账户选择一个新密码。',
    'New password': '新密码',
    'Update password': '更新密码',
    'Password must be at least 6 characters.': '密码至少需要6个字符。',
    'Updating...': '更新中...',
    'Could not update password. Please try again.': '无法更新密码，请重试。',
    'Password updated - you are signed in.': '密码已更新，您已登录。',
    Login: '登录',
    "Don't have an account?": '还没有账户？',
    'Sign up': '注册',
    'Create Account': '创建账户',
    'Full Name': '全名',
    'Already have an account?': '已经有账户了？',
    'Sign in': '登录',
    // My Bookings
    'My Bookings': '我的预订',
    Upcoming: '即将到来',
    History: '历史记录',
    'No upcoming bookings': '暂无即将到来的预订',
    'Book your first service today!': '今天就预约您的第一次服务吧！',
    'No booking history': '暂无预订记录',
    'Completed services will appear here.': '已完成的服务将显示在这里。',
    'Showing your most recent bookings': '显示您最近的预订',
    Date: '日期',
    Time: '时间',
    Address: '地址',
    'Visit & diagnosis': '上门检查费',
    'Book Again': '再次预订',
    'Track Live': '实时追踪',
    'Share tracking link': '分享追踪链接',
    Reschedule: '改期',
    'New date': '新日期',
    'New time': '新时间',
    'Loading available times...': '正在加载可用时间...',
    'No times available': '没有可用时间',
    Back: '返回',
    '- unavailable': '- 不可用',
    'No times available that day - try another date.': '当天没有可用时间 - 请尝试其他日期。',
    'Could not load times': '无法加载时间',
    'Could not check availability. Try again.': '无法查看可用性，请重试。',
    'Cancel booking': '取消预订',
    Close: '关闭',
    'Your mechanic': '您的技工',
    'Rate this mechanic': '给这位技工评分',
    'Your review': '您的评价',
    'Client reviews': '客户评价',
    'Jobs done': '已完成工作',
    Rating: '评分',
    'Prefer a specific mechanic? (optional)': '想指定技工吗？（可选）',
    "We'll try to send your job to them first.": '我们会优先尝试把订单分配给该技工。',
    jobs: '单',
    // Payment method (card on file, 2026-07-22)
    'Payment Method': '支付方式',
    '💳 Card on file': '💳 已保存的银行卡',
    'Auto-charged when your mechanic completes a job': '技工完成服务后会自动扣款',
    Remove: '移除',
    'No card saved': '尚未保存银行卡',
    'Save a card so your mechanic can charge you automatically instead of using EFTPOS':
      '保存一张银行卡，技工完成服务后可直接自动扣款，无需使用POS机',
    'Add card': '添加银行卡',
    'Save card': '保存银行卡',
    'Removing...': '移除中...',
    'Card saved': '银行卡已保存',
    'Card removed': '银行卡已移除',
    'Could not save card. Please try again.': '无法保存银行卡，请重试。',
    'Could not remove card': '无法移除银行卡',
    // My Bikes
    'Service history is a Standard/VIP perk': '服务记录是Standard/VIP会员专享',
    'Upgrade your membership to see every past service for this bike.':
      '升级会员即可查看这辆车的所有历史服务记录。',
    'No bikes added yet': '尚未添加自行车',
    'Add your first bike below': '在下方添加您的第一辆自行车',
    '+ Add a Bike': '+ 添加自行车',
    'New Bike': '新自行车',
    'Predicted next service': '预计下次服务',
    "You're likely due for a service": '您的自行车可能需要保养了',
    'We recommend a service roughly every 3 months.': '我们建议大约每3个月进行一次服务。',
    'You were due around': '预计到期时间为',
    'Your next one is around': '下次预计时间为',
    // Live Tracking
    'Live Tracking': '实时追踪',
    'Change booking': '更改预订',
    'Loading booking...': '正在加载预订...',
    'On the way to you': '正在前往您的位置',
    Confirmed: '已确认',
    'En Route': '途中',
    Pending: '待确认',
    'In Progress': '进行中',
    Completed: '已完成',
    Cancelled: '已取消',
    'Booking Confirmed!': '预订已确认！',
    'Something went wrong. Please call us at 0433 963 250.': '出了点问题。请致电 0433 963 250。',
    'You have a booking in progress': '您有一个未完成的预订',
    'Could not load services': '无法加载服务',
    'Could not load your bookings': '无法加载您的预订',
    "You're offline": '您已离线',
    'Sign in to see your bookings': '登录后查看您的预订',
    Arrived: '已到达',
    Done: '完成',
    Message: '消息',
    'Share link': '分享链接',
    'Mechanic profile': '技工资料',
    'Dr. Bike Mobile Mechanic': 'Dr. Bike 移动技工',
    Call: '呼叫',
    WhatsApp: 'WhatsApp',
    'Services completed': '已完成服务',
    // Review
    'Review Service': '评价服务',
    'How was your experience?': '您的体验如何？',
    "We'd love to hear your feedback.": '我们很想听听您的反馈。',
    'Tell us about your experience...': '告诉我们您的体验...',
    'Submit Review': '提交评价',
    'Maybe Later': '稍后再说',
    // Profile
    'Your referral code': '您的推荐码',
    'You and your friend each get $15 off': '您和您的朋友各获得 $15 优惠',
    'Copy code': '复制代码',
    Share: '分享',
    'Friends referred': '已推荐朋友',
    'Credits earned': '已获得积分',
    'How it works': '使用方法',
    // Profile - rider tier card
    'New Rider': '新骑手',
    'Bronze Rider': '青铜骑手',
    'Silver Rider': '白银骑手',
    'Gold Rider': '黄金骑手',
    'Diamond Rider': '钻石骑手',
    'service completed': '项服务已完成',
    'services completed': '项服务已完成',
    'more service to reach': '项服务即可达到',
    'more services to reach': '项服务即可达到',
    "You've reached our highest tier - thank you for riding with us!":
      '您已达到最高等级 - 感谢您选择我们！',
    // Profile - membership card
    Membership: '会员',
    Plan: '计划',
    Active: '生效中',
    Paused: '已暂停',
    'Resume membership': '恢复会员',
    'Pause membership': '暂停会员',
    Cancel: '取消',
    // Profile - push notifications
    Notifications: '通知',
    'Mechanic messages': '技工消息',
    'Get a phone alert when your mechanic messages you': '技工给您发消息时，手机会收到提醒',
    Enable: '开启',
    'Enabling...': '正在开启...',
    Enabled: '已开启',
    // Home nav greeting
    'Hi,': '你好，',
    // Booking flow - Step 1 (select service)
    'Not sure what your bike needs?': '不确定您的自行车需要什么服务？',
    'Take a photo or describe the problem — our AI will recommend the right service.':
      '拍张照片或描述问题，我们的AI会为您推荐合适的服务。',
    Photo: '照片',
    'Describe the problem...': '描述问题...',
    'Ask AI': '询问AI',
    'Select Service': '选择服务',
    'Emergency Service': '紧急服务',
    'Price and availability confirmed by phone or WhatsApp - tap to contact us directly.':
      '价格和可预约时间通过电话或WhatsApp确认 - 点击直接联系我们。',
    "Emergency visits depend on where our mechanic already is, so we confirm these directly - call or WhatsApp us and we'll tell you right away if we can help and what it'll cost.":
      '紧急上门服务取决于我们技工当时所在的位置，因此需要直接确认 - 请致电或通过WhatsApp联系我们，我们会立即告诉您能否提供服务以及费用。',
    'Back to services': '返回服务列表',
    'Which bike?': '哪辆自行车？',
    Skip: '跳过',
    Continue: '继续',
    // Service categories (full + short chip labels)
    'Scheduled services': '定期保养服务',
    Scheduled: '定期保养',
    Brakes: '刹车',
    'Cockpit & levers': '车把与刹把',
    Cockpit: '车把',
    Drivetrain: '传动系统',
    'Gears & cables': '变速与线管',
    Gears: '变速器',
    'Wheels & tyres': '车轮与轮胎',
    Wheels: '车轮',
    'Electronic & e-bike': '电子与电动自行车',
    'E-Bike': '电动自行车',
    Suspension: '避震器',
    'General & assembly': '通用与组装',
    General: '通用',
    // Booking flow - Step 2 (calendar)
    'Choose Date & Time': '选择日期和时间',
    'Select Date': '选择日期',
    'Select Time': '选择时间',
    January: '一月',
    February: '二月',
    March: '三月',
    April: '四月',
    May: '五月',
    June: '六月',
    July: '七月',
    August: '八月',
    September: '九月',
    October: '十月',
    November: '十一月',
    December: '十二月',
    Su: '日',
    Mo: '一',
    Tu: '二',
    We: '三',
    Th: '四',
    Fr: '五',
    Sa: '六',
    // Booking flow - Step 2 (time slot loading / full / waitlist states)
    'Could not load available times': '无法加载可用时间',
    'Please check your connection and try again.': '请检查您的网络连接并重试。',
    Retry: '重试',
    'Fully booked on this date': '该日期已订满',
    'Please choose another day or join the waitlist': '请选择其他日期或加入等候名单',
    'Join Waitlist for': '加入等候名单：',
    'Which times work for you?': '您方便的时间是？',
    'Please select at least one time slot.': '请至少选择一个时间段。',
    'Notify Me When a Slot Opens': '有空位时通知我',
    'Joining...': '正在加入...',
    'Please sign in first to join the waitlist.': '请先登录以加入等候名单。',
    'Failed to join waitlist': '加入等候名单失败',
    "You're on the waitlist!": '您已加入等候名单！',
    "We'll email": '我们会发邮件到',
    'if a slot opens up on': '如果空位出现在',
    // Booking flow - Step 3 (address)
    'Your Address': '您的地址',
    'Where should we come?': '我们应该前往哪里？',
    'Your mechanic will come to this address': '您的技工将前往此地址',
    "Same-day visits cover everything within about 45 minutes of our Northern Beaches base — Northern Beaches, North Shore, Hornsby, the CBD, Inner West and Eastern Suburbs. Further out, like Western Sydney, the Sutherland Shire or the Blue Mountains, we still come, but by arrangement rather than same-day. Enter your address when you book and we'll tell you which one you are.":
      '当日上门服务覆盖距离我们 Northern Beaches 基地约 45 分钟车程内的所有地区：Northern Beaches、North Shore、Hornsby、CBD、Inner West 和 Eastern Suburbs。更远的地区，如 Western Sydney、Sutherland Shire 或 Blue Mountains，我们仍会前往，但需另行安排，非当日服务。预订时输入您的地址，我们会告知您属于哪一种。',
    "Why is the visit & diagnosis fee different for my suburb?":
      '为什么不同区域的上门检查费不一样？',
    "Because it pays for the trip, and what a trip really costs is time, not kilometres. From our Northern Beaches base the CBD is about 40 minutes across the Spit Bridge, while Hornsby is further away on the map but only 30 minutes up the motorway — so the CBD costs a little more. We work the fee out from real driving time to your address, which is why it's exact rather than a flat rate.":
      '因为它支付的是行程，而行程的真正成本是时间，不是公里数。从我们 Northern Beaches 的基地出发，CBD 需要约 40 分钟穿过 Spit Bridge，而 Hornsby 在地图上更远，走高速却只需 30 分钟——所以 CBD 稍贵一些。我们根据到您地址的实际驾驶时间计算费用，因此是精确的，而非统一定价。',
    "We quote that area case by case":
      '该地区我们逐例报价',
    "Continue - book at no cost":
      '继续 — 免费预订',
    "It's outside our same-day zone, so there's no fixed price to show you - but we do still come. Book as usual and the last step asks for a price instead of a card: no charge, and the mechanic replies to you personally.":
      '该地址不在我们的当日服务范围内，因此没有固定价格可以展示，但我们仍会前往。照常预订即可，最后一步会请您咨询价格而不是付款：不收费用，技工会亲自回复您。',
    "We don't reach that address yet": '我们暂时无法到达该地址',
    'No charge - we check your address and reply personally.':
      '不收费 - 我们会核实您的地址并亲自回复。',
    'Ask for my price': '咨询我的价格',
    'What the visit & diagnosis covers': '上门检查费包含什么',
    'A mechanic comes to you, inspects the whole bike and tells you exactly what it needs. If the repair is not possible - a part we do not carry, or a job that needs a machinist or welding - you are told on the spot and the service fee is not charged. The visit & diagnosis covers that inspection and is not refunded.': '技师上门，全面检查你的自行车，并告诉你它需要什么。如果无法维修——缺少配件，或需要车工或焊接——我们会当场告知，不收取服务费。上门检查费涵盖这次检查本身，不予退款。',
    'Waiting for a mechanic': '等待技师',
    'Assigned to your booking': '已分配给你的预约',
    'Send a gift card': '送一张礼品卡',
    'Any cyclist you know, delivered by email': '送给任何骑行者，通过邮件送达',
    'Buy': '购买',
    'Recipient': '致',
    'Sender': '来自',
    'Another amount': '其他金额',
    'Between $20 and $1000.': '介于 $20 至 $1000。',
    'Continue to payment': '继续付款',
    'Optional': '可选',
    'Secured by Stripe - delivered by email': '由 Stripe 保障 - 通过邮件送达',
    'We send the card straight to them.': '我们会直接将卡发送给对方。',
    'The whole Dr. Bike team wishes you a great one.': '整个 Dr. Bike 团队祝你度过美好的一天。',
    'Saved': '已保存',
    'Profile & settings': '个人资料与设置',
    'Birthday': '生日',
    'Tell us the day and we\'ll send you something on it. We don\'t ask for the year.': '告诉我们日期，那天我们会送你一份礼物。我们不需要年份。',
    'Day': '日',
    'Month': '月',
    'Pick a day and a month': '请选择日期和月份',
    'That day does not exist in that month': '该月没有这一天',
    'Could not save your birthday': '无法保存你的生日',
    'Saved - see you on the day': '已保存，那天见',
    'Happy birthday, NAME!': '生日快乐，NAME！',
    'Check your email - there is something from us in there.': '查收邮件，我们给你留了东西。',
    'We need to price this one by hand': '这个需要我们人工报价',
    'We sent your enquiry to the mechanic': '您的咨询已发送给技工',
    "We're checking your address and will get back to you shortly.":
      '我们正在核实您的地址，会尽快与您联系。',
    'Want an answer faster?': '想更快得到答复？',
    'Send us the details on WhatsApp - the message is already written.':
      '通过 WhatsApp 把详情发给我们 - 消息已经写好了。',
    'Send on WhatsApp': '通过 WhatsApp 发送',
    'Back to home': '返回首页',
    "Send us the address on WhatsApp and we'll tell you if we can make it work.":
      '请通过 WhatsApp 把地址发给我们，我们会告诉您能否安排。',
    '💬 Ask on WhatsApp': '💬 通过 WhatsApp 咨询',
    'Hi! Do you cover this address?': '您好！请问这个地址你们能上门吗？',
    'Service:': '服务：',
    'Date:': '日期：',
    'Address:': '地址：',
    'Distance from your base:': '距离你们基地：',
    'Continue anyway': '仍然继续',
    "The visit & diagnosis fee (from $25, depending on your suburb) covers the mechanic's trip. Most areas in Sydney are covered.":
      '上门检查费（从$25起，视郊区而定）包含技工的车费。悉尼大部分地区均可提供服务。',
    'Continue to Summary': '继续查看摘要',
    // Service Summary / Quote
    'Sunday & public holiday rate': '周日及公共假期费率',
    'Your Quote': '您的报价',
    Location: '位置',
    "What's included": '服务内容',
    'Service fee': '服务费',
    'Paid online now via Stripe': '通过 Stripe 在线支付',
    'Promo discount': '优惠折扣',
    'ETA': '预计到达',
    'by road': '实际路线',
    'straight line': '直线距离',
    'Mechanic is right outside!': '技师已到门口！',
    Total: '总计',
    'Promo or referral code': '优惠码或推荐码',
    'Enter code (optional)': '输入代码（可选）',
    Apply: '应用',
    'Checking...': '正在验证...',
    'How payment works:': '支付方式说明：',
    'Please try again.': '请重试。',
    // Service inclusions (shown on the Quote screen)
    'Gear adjustment & cable tension': '变速调整与线管张力',
    'Brake check & pad inspection': '刹车检查与刹车片检验',
    'Wheel true & tyre pressure': '车轮校正与胎压检查',
    'Chain lube & basic clean': '链条润滑与基础清洁',
    'Safety inspection': '安全检查',
    'Everything in Tune-Up': '包含基础保养的所有项目',
    'Full drivetrain clean & degrease': '传动系统全面清洁与除油',
    'Cable check & replace if worn': '线管检查，磨损时更换',
    'Bearing check (BB, headset, hubs)': '轴承检查（五通、头碗、花鼓）',
    'Everything in Standard Service': '包含标准保养的所有项目',
    'Bottom bracket service': '五通保养',
    'Headset adjustment & grease': '头碗调整与润滑',
    'Comprehensive component report': '全面零件状况报告',
    'Full bike rebuild': '整车翻新',
    'All bearings serviced or replaced': '所有轴承保养或更换',
    'Before & after photos': '服务前后对比照片',
    'Detailed parts condition report': '详细零件状况报告',
    'Brake pad check': '刹车片检查',
    'Tyre & wheel inspection': '轮胎与车轮检查',
    'Drivetrain check': '传动系统检查',
    'Headset & stem safety check': '头碗与龙头安全检查',
    'Tube replacement': '内胎更换',
    'Tyre inspection': '轮胎检查',
    'Pressure set to spec': '胎压调至标准值',
    'Derailleur alignment': '变速器校正',
    'Cable tension adjustment': '线管张力调整',
    'Limit screw set': '限位螺丝调整',
    'Test ride': '试骑',
    'Pad replacement': '刹车片更换',
    'Cable tension & rotor/rim check': '线管张力与刹车盘/轮圈检查',
    'Bedding in if disc': '碟刹磨合（如适用）',
    'Remove, clean & replace chain': '拆卸、清洁并更换链条',
    'Check cassette wear': '检查飞轮磨损',
    'True wheel (spoke tension)': '车轮校正（辐条张力）',
    'Rim or rotor inspection': '轮圈或刹车盘检查',
    // Payment
    'Confirm Booking': '确认预订',
    'Your selection': '您的选择',
    'Contact us': '联系我们',
    'Online payments coming soon': '在线支付即将上线',
    "We're finalising our business setup. Contact us directly to lock in your slot at the same price.":
      '我们正在完成业务筹备。请直接联系我们以相同价格锁定您的预约时段。',
    'Book via WhatsApp': '通过WhatsApp预订',
    'Call 0433 963 250': '致电 0433 963 250',
    'Test booking - no charge (admin only)': '测试预订 - 免费（仅限管理员）',
    'Confirming...': '正在确认...',
    // Tracking status messages
    'Booking received - assigning mechanic...': '已收到预订，正在分配技工...',
    'Mechanic assigned - preparing to depart': '技工已分配，准备出发',
    'Mechanic is on the way!': '技工正在路上！',
    'Mechanic has arrived!': '技工已到达！',
    'Service completed': '服务已完成',
    // Home screen - marketing sections (see matching ES block for context)
    'OUR SERVICES': '我们的服务',
    'Complete Bike Care at Your Location': '在您所在地享受全面的自行车服务',
    'We bring a fully equipped mobile workshop to your door — no bike shop queues, no expensive tow-ins.':
      '我们将配备齐全的移动车间开到您家门口 - 无需排队，也不用支付昂贵的拖车费。',
    'Tune-Up': '基础调校',
    'Standard Service': '标准服务',
    'Standard+ Service': '标准+服务',
    Repairs: '维修',
    'From $17': '起价 $17',
    'From $80': '起价 $80',
    From: '起价',
    'E-Bike Service': '电动车服务',
    'Bike Assembly': '自行车组装',
    'Perfect for regular maintenance and safety checks.': '适合日常保养和安全检查。',
    'Comprehensive service with detailed adjustment.': '全面服务，包含详细调校。',
    'Complete overhaul and performance optimization.': '全面检修，优化性能。',
    'Fast and reliable repair at your doorstep.': '快速可靠，上门维修。',
    'Specialized service for electric bikes.': '电动自行车专项服务。',
    'Professional assembly of your new bike.': '专业组装您的新自行车。',
    'View All Services →': '查看所有服务 →',
    'HOW IT WORKS': '使用方法',
    'Simple 4-Step Process': '简单四步流程',
    'Getting your bike serviced has never been easier.': '为自行车做保养从未如此简单。',
    'Book Online': '在线预订',
    'Choose your service and preferred time': '选择服务和预约时间',
    'We Come to You': '我们上门服务',
    'Our mechanic arrives at your location': '技工到达您所在的地点',
    'Service Your Bike': '为您的车服务',
    'Professional service on the spot': '现场专业服务',
    'Ride Happy': '尽情骑行',
    'Your bike is ready to go!': '您的自行车已准备就绪！',
    'OUR STORY': '我们的故事',
    'Passion for Bikes, Commitment to Service': '热爱自行车，专注服务',
    'Dr. Bike Sydney was founded with a simple mission: to provide professional, convenient, and reliable bike servicing to cyclists across Sydney.':
      'Dr. Bike Sydney 的创立使命很简单：为悉尼各地的骑行者提供专业、便捷、可靠的自行车服务。',
    'Certified & experienced mechanic': '持证且经验丰富的技工',
    'Fully equipped mobile workshop': '配备齐全的移动车间',
    'Premium tools and quality parts': '优质工具和高品质零件',
    'Satisfaction guaranteed': '满意保证',
    'Founder & Head Mechanic': '创始人兼首席技工',
    'Happy Customers': '满意客户',
    'Bikes Serviced': '服务车辆',
    'Avg Rating': '平均评分',
    Satisfaction: '满意度',
    TESTIMONIALS: '客户评价',
    'What Our Customers Say': '客户怎么说',
    "Don't just take our word for it. Here's what Sydney cyclists have to say.":
      '不只是我们说 - 来看看悉尼骑行者怎么说。',
    '"Diego is a true professional! He came to my place, serviced my bike perfectly, and even gave me tips on maintenance. Highly recommend!"':
      '"Diego 真的很专业！他上门为我的车做了完美的服务，还给了我保养建议。强烈推荐！"',
    '"Amazing service! So convenient and affordable. Dr. Bike Sydney is now my go-to for all bike maintenance."':
      '"服务太棒了！方便又实惠。Dr. Bike Sydney 现在是我所有自行车保养的首选。"',
    '"Fast, reliable, and affordable. Dr. Bike Sydney has transformed my bike. My bike has never ridden better."':
      '"快速、可靠、实惠。Dr. Bike Sydney 让我的车焕然一新，骑行体验从未如此顺畅。"',
    'Road Cyclist': '公路骑行者',
    Triathlete: '铁人三项选手',
    'Mountain Biker': '山地车骑手',
    MEMBERSHIPS: '会员计划',
    'Choose Your Plan': '选择您的计划',
    'Save more with our membership plans. Designed for regular cyclists.':
      '通过会员计划省更多钱，专为常规骑行者设计。',
    '/month': '/月',
    '1 Tune-Up per month': '每月1次基础调校',
    '10% off parts': '零件享9折',
    '10% off extra visits beyond your monthly service': '超出每月服务后，额外上门享9折',
    'Priority scheduling (48hs)': '优先预约（48小时）',
    'Digital bike history': '数字化车辆记录',
    '2 services per month (any type)': '每月2次服务（任意类型）',
    '15% off parts': '零件享85折',
    '2 free services per month, visit & diagnosis fee included': '每月2次免费服务，含上门检查费',
    '10% off extra visits beyond your monthly services': '超出每月服务后，额外上门享9折',
    'Priority scheduling (24hs)': '优先预约（24小时）',
    '1 emergency callout/month': '每月1次紧急上门',
    'Unlimited services per month': '每月无限次服务',
    '20% off parts': '零件享8折',
    'Unlimited services per month, visit & diagnosis fee always included': '每月无限次服务，上门检查费全免',
    'Same-day priority': '当天优先服务',
    'Unlimited emergency callouts': '无限次紧急上门',
    'Dedicated mechanic': '专属技工',
    'Most Popular': '最受欢迎',
    'Get Started': '立即开始',
    'Learn more': '了解更多',
    'All plans include mobile service within Sydney metro area · 3-month minimum':
      '所有计划均包含悉尼都会区上门服务 - 最低3个月起',
    FAQ: '常见问题',
    'Frequently Asked Questions': '常见问题',
    'What areas do you service?': '你们服务哪些区域？',
    'We service all suburbs within the Sydney metro area, including the CBD, Inner West, Eastern Suburbs, North Shore, and Western Sydney. Check availability when booking.':
      '我们覆盖悉尼都会区所有郊区，包括CBD、Inner West、East悉尼东部、North Shore和西悉尼。预订时请查看是否可预约。',
    'What if I need to reschedule?': '如果我需要改期怎么办？',
    'You can reschedule anytime via your booking confirmation link or by calling us. No cancellation fee if you reschedule more than 2 hours in advance.':
      '您可以随时通过预订确认链接或致电我们改期。提前2小时以上改期不收取取消费用。',
    'Do you bring spare parts?': '你们会带备用零件吗？',
    "Yes, our fully-equipped van carries common parts like brake pads, cables, chains, and tubes. For less common parts, we'll source them and return to complete the service.":
      '是的，我们配备齐全的服务车携带刹车片、线缆、链条、内胎等常用零件。较少见的零件我们会另行采购后返回完成服务。',
    'How long does a service take?': '一次服务需要多长时间？',
    "A Tune-Up typically takes 45-60 minutes. A Standard Service takes 60-90 minutes. A Standard+ Service can take 2-3 hours. We'll give you an estimated time when you book.":
      '基础调校通常需要45-60分钟。标准服务需要60-90分钟。标准+服务可能需要2-3小时。预订时我们会告知预计时长。',
    'What payment methods do you accept?': '你们接受哪些支付方式？',
    'We accept all major credit and debit cards, Apple Pay, and Google Pay. A call-out deposit (from $25, depending on your suburb) is charged at booking; the remainder is charged on completion.':
      '我们接受所有主流信用卡和借记卡、Apple Pay和Google Pay。预订时收取上门检查费押金（从$25起，视郊区而定），其余金额在服务完成后收取。',
    "Still have questions? We're here to help!": '还有疑问？我们随时为您解答！',
    'Contact Us': '联系我们',
    'Ready to Experience': '准备好体验',
    'Premium Bike Service?': '高端自行车服务了吗？',
    'Book your service today and join hundreds of satisfied cyclists across Sydney.':
      '立即预订，加入悉尼数百位满意骑行者的行列。',
    'Book Now': '立即预订',
    'Start Your Membership': '开始您的会员',
    'Phone Number (04XX XXX XXX)': '电话号码 (04XX XXX XXX)',
    'Start Membership': '开始会员',
    "You're all set!": '一切就绪！',
    "We'll be in touch shortly to confirm your membership and schedule your first service.":
      '我们会尽快与您联系，确认会员资格并安排首次服务。',
    INCLUDES: '包含',
    'DOES NOT INCLUDE': '不包含',
    'SAVINGS EXAMPLE': '节省示例',
    'Professional bike service at your doorstep. Sydney’s mobile bicycle mechanic.':
      '上门专业自行车服务，悉尼的移动自行车技工。',
    Company: '公司',
    Support: '支持',
    'Terms & Conditions': '条款与条件',
    'Privacy Policy': '隐私政策',
    Contact: '联系方式',
    'About Us': '关于我们',
    'My Account': '我的账户',
    'Sydney, NSW': '悉尼, NSW',
    'Mon – Sun: 8:30AM – 4:00PM': '周一至周日：8:30 - 16:00',
    'Mon - Sun: 8:30AM - 4:00PM': '周一至周日：8:30 - 16:00',
    'Healthy bikes, happy riders': '健康的自行车，快乐的骑行者',

    // ── landing.html (desktop) — Navbar ──────────────────────────────────
    Mechanics: '技工',
    Memberships: '会员',
    About: '关于我们',
    'Fleet →': '车队 →',
    'Sign in to manage bookings': '登录以管理您的预订',
    'Bookings · Bikes · Membership': '预订 · 自行车 · 会员',
    // Trust badges bar
    '100% Satisfaction Guarantee': '100%满意保证',
    'Verified Mechanic': '认证技工',
    'Background Checked': '背景审查',
    'Fully Insured': '全额保险',
    // Hero (landing-specific strings not already in the mobile dict)
    'Mobile Service · Sydney Wide': '上门服务 · 覆盖全悉尼',
    'Professional Bike Service at Your Doorstep': '专业自行车服务，直达家门口',
    'Mobile bicycle mechanic in Sydney. We come to you, fully equipped.':
      '悉尼的移动自行车技工，装备齐全，随叫随到。',
    'Or call': '或致电',
    // GrowthBook A/B experiment "hero-cta-copy" variant copy (see ES block
    // comment for context)
    'Book a service': '预约服务',
    'Get Your Free Quote': '获取免费报价',
    'Qualified Mechanic': '专业技工',
    'Fully Equipped Van': '装备齐全的服务车',
    '5 Star Rated': '五星好评',
    // Mechanics 3D carousel
    'OUR TEAM': '我们的团队',
    'Meet Your Mechanics': '认识我们的技工',
    'Qualified, background-checked mechanics rated by real Sydney riders.':
      '经过认证和背景审查的技工，由悉尼真实骑行者评分。',
    'Previous mechanic': '上一位技工',
    'Next mechanic': '下一位技工',
    'Our mechanic profiles are coming soon.': '技工资料即将上线。',
    // Memberships section (landing-specific)
    Monthly: '按月',
    Annual: '按年',
    'Save 20%': '省20%',
    '/yr - save': '/年 - 节省',
    // Same wording terms.html already uses for the plans.
    Basic: '基础版',
    Standard: '标准版',
    VIP: 'VIP版',
    Popular: '最受欢迎',
    '1 Basic Service': '1次Basic服务',
    '10% off repairs': '维修享9折',
    'Priority booking': '优先预约',
    'Email support': '邮件支持',
    '2 Standard Services': '2次Standard服务',
    '2 free Standard Services/month, visit & diagnosis fee included': '每月2次免费Standard服务，含上门检查费',
    'Phone support': '电话支持',
    'Free safety check': '免费安全检查',
    'Unlimited Services': '无限次服务',
    '20% off repairs': '维修享8折',
    'Unlimited Services, visit & diagnosis fee always included': '无限次服务，上门检查费全免',
    'Annual tune-up': '年度调校',
    'All plans include mobile service within Sydney metro area': '所有计划均包含悉尼都会区上门服务',
    'Gift a service': '赠送一次服务',
    'Send a Dr. Bike gift card by email - perfect for any cyclist':
      '通过邮件发送Dr. Bike礼品卡 - 适合任何骑行者',
    'Buy a gift card': '购买礼品卡',
    // Trust bar (brands not translated - see section below)
    'TRUSTED BY CYCLISTS ACROSS SYDNEY': '深受悉尼骑行者信赖',
    // Services intro + "All Services" modal
    'Book a Service →': '预约服务 →',
    'All Services': '所有服务',
    'All prices include a visit & diagnosis fee (from $25, depending on your suburb). We come to you.':
      '所有价格均含上门检查费（从$25起，视郊区而定），我们会上门为您服务。',
    Essentials: '基础服务',
    'Tyres & Wheels': '轮胎与车轮',
    'Cables & Accessories': '线缆与配件',
    'Basic Tune-Up': '基础调校',
    'Full tune-up + wheel true + drivetrain clean': '全面调校 + 车轮校正 + 传动系统清洁',
    'Ultimate Overhaul': '终极大修',
    'Strip & rebuild, all consumables replaced': '拆解重装，更换所有易损件',
    'Flat Tyre Repair': '爆胎修理',
    'Tube replace or patch, remount & inflate': '更换或修补内胎，重新安装并充气',
    'Tyre Replacement': '轮胎更换',
    'New tyre fitted (tyre cost extra)': '安装新轮胎（轮胎费用另计）',
    'Wheel Truing - Minor': '车轮校正 - 轻度',
    'Quick spoke tension touch-up': '快速调整辐条张力',
    'Wheel Truing - Major': '车轮校正 - 重度',
    'Full spoke tension & rim alignment': '全面调整辐条张力与轮圈校准',
    'Spoke Replacement': '辐条更换',
    'Per spoke, includes re-true': '按根计费，含重新校正',
    'Brake Adjustment': '刹车调整',
    'Pad align, cable tension, lever reach': '刹车片对齐、线管张力、刹把行程调整',
    'Brake Pad Replacement': '刹车片更换',
    'Both wheels, pads included': '前后轮，含刹车片',
    'Hydraulic Bleed': '油压刹车排气',
    'Full bleed with fresh fluid': '全面排气并更换新油',
    'Gear Adjustment': '变速调整',
    'Front & rear derailleur indexed': '前后变速器索引调整',
    'Chain Replacement': '链条更换',
    'KMC or SRAM chain fitted': '安装KMC或SRAM链条',
    'Cassette/Freewheel Swap': '飞轮/棘轮更换',
    'Remove & fit (part cost extra)': '拆卸并安装（零件费用另计）',
    'Cable & Housing': '线管与线壳',
    'Full replace front & rear': '前后全部更换',
    'Handlebar Tape': '车把带',
    'Cork or EVA wrap, bar ends included': '软木或EVA材质，含车把塞',
    'Saddle Fitting': '坐垫调校',
    'Height, fore-aft, tilt optimised': '优化高度、前后位置与倾角',
    'Bottom Bracket Service': '五通保养',
    'Clean, regrease or replace BB': '清洁、重新润滑或更换五通',
    'Headset Service': '头碗保养',
    'Clean, adjust, regrease': '清洁、调整、重新润滑',
    'Custom Quote': '定制报价',
    'E-bikes, carbon, vintage, insurance claims': '电动自行车、碳纤维车架、老式车、保险理赔',
    'All prices include a visit & diagnosis fee (from $25, depending on your suburb). Parts charged separately unless stated.':
      '所有价格均含上门检查费（从$25起，视郊区而定）。除另有说明外，零件费用另计。',
    'Sunday & NSW public holiday bookings +20%. Saturday is normal price.':
      '周日及新南威尔士州公共假日预订加收20%。周六按正常价格计算。',

    // ── Testimonials (landing.html specific reviews) ─────────────────────
    "Real reviews from Sydney cyclists who've used Dr. Bike Sydney.":
      '来自使用过Dr. Bike Sydney的悉尼骑行者的真实评价。',
    'Google Review': '谷歌评价',
    '"Diego came to my apartment in Surry Hills and fixed my derailleur in under an hour. Absolutely professional — showed up on time, van was stocked with everything. My bike shifts perfectly now. Will definitely book again."':
      '"Diego上门到我在Surry Hills的公寓，不到一小时就修好了我的变速器。非常专业 - 准时到达，车上备件齐全。我的车现在换挡完美。一定会再次预订。"',
    '2 weeks ago': '2周前',
    '"Best mobile mechanic in Sydney, no question. I was sceptical about a mobile service but Dr. Bike exceeded every expectation. Arrived at Bondi, full service done in 90 minutes in my parking spot. Pricing is very fair."':
      '"毫无疑问是悉尼最好的移动技工。我原本对上门服务有些怀疑，但Dr. Bike超出了我的所有期待。技工到达Bondi后，在我的停车位上90分钟内完成了全套服务。价格非常公道。"',
    '1 month ago': '1个月前',
    '"Used the VIP membership and it\'s worth every cent. Two services already this year — brake bleed and a full tune-up. The convenience of having a mechanic come to my home in Newtown is unbeatable. Highly recommend."':
      '"用了VIP会员，物超所值。今年已经做了两次服务 - 刹车排气和全面调校。技工直接上门到我在Newtown的家，太方便了。强烈推荐。"',
    '3 weeks ago': '3周前',
    'Leave us a review': '给我们留个评价',
    'See Our Service In Action': '看看我们的服务实况',
    'Watch how we service bikes on location.': '看看我们如何上门为自行车服务。',
    'Watch Video': '观看视频',

    // ── Book a Service (dark form section) ────────────────────────────────
    'BOOK A SERVICE': '预约服务',
    'Schedule Your Service Today': '立即安排您的服务',
    "Choose a service, pick a time, and we'll come to you.":
      '选择服务，选择时间，我们上门为您服务。',
    'Service Type': '服务类型',
    'Preferred date': '首选日期',
    'Preferred Time': '首选时间',
    'Morning (8:30am - 12pm)': '上午 (8:30 - 12:00)',
    'Afternoon (12pm - 4pm)': '下午 (12:00 - 16:00)',
    'Evening (4pm - 7pm)': '傍晚 (16:00 - 19:00)',
    'Enter your address': '输入您的地址',
    'Continue Booking': '继续预订',
    '✓ Confirmation in minutes': '✓ 几分钟内确认',
    '✓ Free cancellation': '✓ 免费取消',
    'Step 1 of 3 – Select Service': '第1步，共3步 – 选择服务',
    'Step 2 of 3 – Date & Time': '第2步，共3步 – 日期和时间',
    'Step 3 of 3 – Summary': '第3步，共3步 – 摘要',

    // ── Auth modal ──────────────────────────────────────────────────────────
    'Sign In': '登录',
    'Sign in to your account': '登录您的账户',
    'Create your account': '创建您的账户',
    'or continue with': '或使用以下方式继续',
    'Check your email to confirm your account': '请查收邮箱以确认您的账户',
    'Email address': '电子邮箱',

    // ── Membership modal ────────────────────────────────────────────────────
    'Monthly Total': '每月总计',
    month: '月',
    year: '年',
    'Email Address': '电子邮箱',
    'Card Details': '卡片信息',
    'Secured by Stripe · 3-month minimum · Cancel anytime after':
      'Stripe安全保障 · 最低3个月 · 之后可随时取消',

    // ── Gift Card modal ──────────────────────────────────────────────────────
    'Send a Dr. Bike gift card by email': '通过邮件发送Dr. Bike礼品卡',
    Amount: '金额',
    'Or enter a custom amount ($20-$1000)': '或输入自定义金额（$20-$1000）',
    "Recipient's name": '收件人姓名',
    "Recipient's email *": '收件人邮箱 *',
    'Your name': '您的姓名',
    'Personal message (optional)': '个性化留言（可选）',
    'Continue to payment →': '继续付款 →',
    'Secured by Stripe · Delivered instantly by email': 'Stripe安全保障 · 邮件即时送达',

    // ── Account panel (bookings / bikes / membership tabs) ────────────────
    'No bookings yet': '暂无预订',
    'Book a service to get started': '预订服务以开始使用',
    'Message mechanic': '给技工发消息',
    'Cancel this booking?': '取消此预订吗？',
    'Yes, cancel': '是的，取消',
    'Sign out of your account?': '确定要退出登录吗？',
    'Yes, sign out': '是的，退出登录',
    "What does a visit cost?": '我的费用是多少？',
    "What's your suburb?": '您在哪个区？',
    "We'll check your visit & diagnosis fee - takes 2 seconds.": '我们来查一下您的上门检查费——只需2秒。',
    'Check My Fee': '查询我的费用',
    'Checking your area...': '正在查询您的区域...',
    'Comparing against our Sydney zones': '正在与我们的悉尼分区进行比对',
    "Calculated from the distance to our base on the Northern Beaches - the same fee you'll see when you book.":
      '根据到我们北部海滩基地的距离计算——与您预订时看到的费用一致。',
    'Continue to Booking →': '继续预订 →',
    'Check another suburb': '查询其他区域',
    "We don't recognise that suburb yet": '我们暂时无法识别该区域',
    "Give us a call and we'll confirm if we can reach you:":
      '请致电我们确认是否可以为您提供上门服务：',
    'Try a different suburb': '尝试其他区域',
    'e.g. Bondi, Parramatta, Cronulla...': '例如：Bondi、Parramatta、Cronulla...',
    'Enter your suburb first.': '请先输入您的区域。',
    'Cancel your membership? It stays active until the end of the billing period.':
      '取消您的会员资格？会员资格将保持有效，直到本计费周期结束。',
    'Could not cancel. Please call us.': '无法取消，请致电我们。',
    Save: '保存',
    'Could not reschedule. Please call us.': '无法改期，请致电我们。',
    'Could not load bookings.': '无法加载预订。',
    'No bikes registered': '暂无已注册自行车',
    'Your bikes appear here after your first service': '您的第一次服务后，自行车会显示在这里',
    'No active membership': '暂无生效会员',
    'Save money with a recurring plan': '订阅计划更省钱',
    'View Plans': '查看计划',
    'Current Plan': '当前计划',
    'Member since': '会员起始于',
    Resume: '恢复',
    Pause: '暂停',
    'Resuming...': '恢复中...',
    'Pausing...': '暂停中...',
    'Membership resumed!': '会员已恢复！',
    'Membership paused. No charges until you resume.': '会员已暂停，恢复前不会扣费。',
    'Something went wrong': '出现问题',
    'Cancel your membership? It will stay active until the end of the billing period.':
      '取消会员资格吗？将保持生效至本计费周期结束。',
    'Cancelling...': '取消中...',
    'Membership will cancel at end of current period.': '会员将在本周期结束时取消。',
    'Sign out': '退出登录',
    'Sign out?': '退出登录吗？',

    // ── Auth modal (submit/tabs handlers) ──────────────────────────────────
    'Please fill in all fields.': '请填写所有字段。',
    'Creating...': '创建中...',
    'Signing in...': '登录中...',
    'Authentication failed. Please try again.': '身份验证失败，请重试。',
    'Google sign-in failed. Please try again.': 'Google登录失败，请重试。',

    // ── Booking wizard: mock service descriptions ──────────────────────────
    'Gears, brakes, wheels trued + safety check': '变速、刹车、车轮校正 + 安全检查',
    'Full tune-up + drivetrain clean': '全面调校 + 传动系统清洁',
    'Comprehensive overhaul + parts check': '全面检修 + 零件检查',
    'Complete rebuild, all bearings serviced': '完全翻新，所有轴承保养',
    '~1 hour': '约1小时',
    '~1.5 hours': '约1.5小时',
    '~2.5 hours': '约2.5小时',
    '~4 hours': '约4小时',
    // Step 1: AI diagnosis + service selection
    'Upload a photo or describe the problem — our AI will recommend the right service.':
      '上传照片或描述问题，我们的AI会为您推荐合适的服务。',
    '📷 Upload Photo': '📷 上传照片',
    // Booking wizard summary: abbreviated day names (see ES block comment)
    Sun: '周日',
    Mon: '周一',
    Tue: '周二',
    Wed: '周三',
    Thu: '周四',
    Fri: '周五',
    Sat: '周六',
    // Booking wizard calendar: abbreviated month names (see ES block comment
    // for the 'May' collision note - same limitation applies here)
    Jan: '1月',
    Feb: '2月',
    Mar: '3月',
    Apr: '4月',
    Jun: '6月',
    Jul: '7月',
    Aug: '8月',
    Sep: '9月',
    Oct: '10月',
    Nov: '11月',
    Dec: '12月',
    'Ask AI →': '询问AI →',
    'Select a Service': '选择服务',
    'Continue to Date & Time →': '继续选择日期和时间 →',
    // Step 2: date + time
    'Select a Date': '选择日期',
    'Select a Time': '选择时间',
    '← Back': '← 返回',
    'Summary →': '摘要 →',
    // Step 2: waitlist ("We'll email" / "if a slot opens on" already covered
    // by the mobile dict entries above)
    'Select at least one time.': '请至少选择一个时间段。',
    // Step 3: summary — admin test mode + promo code
    'Create test booking (admin - no charge) →': '创建测试预订（管理员 - 免费）→',
    'Admin test mode - this booking is created without payment':
      '管理员测试模式 - 此预订创建时不收取费用',
    'Code applied! -$': '优惠码已应用！-$',
    off: '折扣',
    // Step 3: summary card
    'Est.': '预计',
    '123 Example St, Suburb NSW 2000': '示例街123号, 郊区 NSW 2000',
    'We come to you anywhere in the Sydney area': '悉尼地区任何地方我们都会上门',
    'Promo code': '优惠码',
    '(optional)': '（可选）',
    'e.g. WELCOME10': '例如 WELCOME10',
    "We'll arrange payment on confirmation": '确认后我们会安排付款',
    'Confirm Booking →': '确认预订 →',
    // bkShowPaymentComingSoon overlay
    "We're finalising our business setup. Contact us now to lock in your":
      '我们正在完成业务筹备。请立即联系我们以锁定您的',
    '- same price, same service.': '- 价格和服务不变。',
    'Go back': '返回',
    // bkProceed / bkConfirmedHTML
    'Saving...': '保存中...',
    'Confirm & Pay →': '确认并支付 →',
    'Please sign in to confirm your booking.': '请登录以确认您的预订。',
    'Could not save booking. Please try again.': '无法保存预订，请重试。',
    'That time slot was just booked. Please choose another time.':
      '该时间段刚被预订，请选择其他时间。',
    'Booking Received!': '预订已收到！',
    'Reference:': '参考编号：',
    "We'll contact you within 1 hour to confirm your appointment. Payment is arranged separately.":
      '我们会在1小时内联系您确认预约，付款将另行安排。',
    // AI diagnosis (booking wizard variant)
    'Analysing your photo...': '正在分析您的照片...',
    'Could not analyse photo. Please describe the problem instead.':
      '无法分析照片，请改为描述问题。',
    'Analysing...': '正在分析...',
    'Could not process. Please select a service manually.': '无法处理，请手动选择服务。',
    'AI Recommendation': 'AI推荐',
    'Bike issue detected': '检测到自行车问题',
    'Book soon': '尽快预订',

    // ── Plan info modal ("Learn more") ─────────────────────────────────────
    '$67/month': '$67/月',
    '$97/month': '$97/月',
    '$197/month': '$197/月',
    'Basic Plan': '基础版会员',
    'Standard Plan': '标准版会员',
    'VIP Plan': 'VIP版会员',
    '1 maintenance service per month (Tune-Up)': '每月1次保养服务（基础调校）',
    '1 free maintenance service per month (Tune-Up)': '每月1次免费保养服务（基础调校）',
    '10% discount on parts': '零件享9折',
    'Digital bike history log': '数字化车辆记录',
    'Emergency services, discount on extra services, unlimited visits. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
      '紧急服务、额外服务折扣、无限次上门不含在内。备件或更换零件（如链条、变速器、刹车卡钳、线缆）按成本价另行收费。',
    'A regular Tune-Up costs $109. With Basic you save $52/month.':
      '普通基础调校售价$109。使用Basic每月可节省$52。',
    '2 free services per month (any type), visit & diagnosis fee included':
      '每月2次免费服务（任意类型），含上门检查费',
    '15% discount on parts': '零件享85折',
    '1 emergency callout per month': '每月1次紧急上门',
    'Unlimited visits, discount on services beyond monthly limit. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
      '无限次上门、超出每月限额的服务折扣不含在内。备件或更换零件（如链条、变速器、刹车卡钳、线缆）按成本价另行收费。',
    'Unlimited visits. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
      '无限次上门。备件或更换零件（如链条、变速器、刹车卡钳、线缆）按成本价另行收费。',
    '2 services/month = $218 value. With Standard you save $121/month.':
      '每月2次服务价值$218。使用Standard每月可节省$121。',
    '20% discount on parts': '零件享8折',
    'High-end parts (charged at cost). Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
      '高端零件按成本价收费。备件或更换零件（如链条、变速器、刹车卡钳、线缆）按成本价另行收费。',
    'Unlimited services + emergency = $400+ value. With VIP you save $250+/month.':
      '无限次服务+紧急上门 = 价值$400以上。使用VIP每月可节省$250以上。',
    'Get Started - $97/month': '立即开始 - $97/月',
    'Get Started - $67/month': '立即开始 - $67/月',
    'Get Started - $197/month': '立即开始 - $197/月',
    'Get Started -': '立即开始 -',

    // ── Membership redesign 2026-07-22 (3 free-quota categories) ─────────
    '1 free minor repair (under $60) + 1 free bike wash per month':
      '每月1次免费小额维修（低于$60）+ 1次免费洗车',
    '5% off extra services': '额外服务享95折',
    '10% off extra services': '额外服务享9折',
    'Visit & diagnosis applies (from $25, depending on your suburb)':
      '需支付上门检查费（从$25起，视郊区而定）',
    'Priority scheduling (72hs)': '优先预约（72小时）',
    '2 free minor repairs (under $60) + 1 free bike wash + 1 free Tune-Up per month':
      '每月2次免费小额维修（低于$60）+ 1次免费洗车 + 1次免费基础调校',
    'Visit & diagnosis included': '含上门检查费',
    '1 emergency callout per month (visit & diagnosis fee applies)': '每月1次紧急上门（需付上门检查费）',
    '3 free minor repairs (under $60) + 2 free bike washes + 1 free Tune-Up per month':
      '每月3次免费小额维修（低于$60）+ 2次免费洗车 + 1次免费基础调校',
    '15% off extra services, plus 5% more': '额外服务享85折，再多减5%',
    '1 emergency callout per month (visit & diagnosis fee waived in your zone)':
      '每月1次紧急上门（在您所在区域内免上门检查费）',
    '1 free minor repair per month (any repair under $60)':
      '每月1次免费小额维修（任何低于$60的维修）',
    '1 free bike wash per month': '每月1次免费洗车',
    'Digital service history log is a Standard/VIP perk. Visit & diagnosis is not included - the visit & diagnosis fee (from $25, depending on your suburb) still applies to your covered visits. Full maintenance services (Tune-Up and up) are not part of the free minor-repair quota. Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
      '数字化服务记录是Standard/VIP会员专享。不含上门检查费 - 您的覆盖服务仍需支付上门检查费（从$25起，视郊区而定）。完整保养服务（基础调校及以上）不计入免费小额维修额度。备件或更换零件（如链条、变速器、刹车卡钳、线缆）按成本价另行收费。',
    'A wash plus an average minor repair is worth around $75. With Basic ($67/month) you come out ahead before the 5% discount on anything else.':
      '一次洗车加一次平均小额维修价值约$75。使用Basic（$67/月）在享受其他服务5%折扣之前就已经划算了。',
    '2 free minor repairs per month (any repair under $60)':
      '每月2次免费小额维修（任何低于$60的维修）',
    '1 free Tune-Up per month': '每月1次免费基础调校',
    'Visit & diagnosis included on covered visits': '覆盖服务含上门检查费',
    '1 emergency callout per month (visit & diagnosis fee applies, from $25 depending on your suburb)':
      '每月1次紧急上门（需付上门检查费，从$25起视郊区而定）',
    'Spare parts or replacement components (e.g. chains, derailleurs, brake calipers, cables) - charged separately at cost.':
      '备件或更换零件（如链条、变速器、刹车卡钳、线缆）按成本价另行收费。',
    'A Tune-Up ($109) + a wash ($35) + 2 minor repairs (~$80) = about $224 in free work every month, for $97.':
      '1次基础调校（$109）+ 1次洗车（$35）+ 2次小额维修（约$80）= 每月约$224的免费服务，只需$97。',
    '3 free minor repairs per month (any repair under $60)':
      '每月3次免费小额维修（任何低于$60的维修）',
    '2 free bike washes per month': '每月2次免费洗车',
    'A Tune-Up ($109) + 2 washes ($70) + 3 minor repairs (~$120) = about $299 in free work every month, for $197.':
      '1次基础调校（$109）+ 2次洗车（$70）+ 3次小额维修（约$120）= 每月约$299的免费服务，只需$197。',

    // ── Gift card success alert ──────────────────────────────────────────
    '🎁 Gift card purchased! It has been emailed to the recipient with their unique code.':
      '🎁 礼品卡购买成功！已通过邮件将专属兑换码发送给收件人。',

    // ── Review modal ────────────────────────────────────────────────────────
    Terrible: '很差',
    Poor: '较差',
    OK: '一般',
    Good: '不错',
    Excellent: '很棒',
    'How was your service?': '您的服务体验如何？',
    'Your feedback helps us improve': '您的反馈有助于我们改进',
    'Your comments': '您的评论',
    'Tell us what you loved or what we can improve...':
      '告诉我们您喜欢的地方或我们可以改进的地方...',
    'Add a photo': '添加照片',
    'Tap to add a photo': '点击添加照片',
    'Remove photo': '移除照片',
    'Submit review': '提交评价',
    'Maybe later': '稍后再说',
    'Please select a star rating first': '请先选择星级评分',
    'Submitting...': '提交中...',
    'Could not submit review': '无法提交评价',
    'Thank you!': '谢谢！',
    'Your review has been submitted': '您的评价已提交',
    'Also leave a Google review?': '要顺便留一个谷歌评价吗？',
    'Helps cyclists find us': '帮助更多骑行者找到我们',
    'Connection error — try again': '连接错误 - 请重试',
    'Uploading photo...': '正在上传照片...',
    'Change photo': '更换照片',

    // ── Client <-> mechanic chat modal (landing.html) ──────────────────────
    'Online now': '当前在线',
    'Message failed to send': '消息发送失败',
    'Loading messages...': '正在加载消息...',
    'No messages yet': '暂无消息',
    'Send a message to your mechanic': '给您的技工发送消息',

    // ── Floating FAQ chatbot ────────────────────────────────────────────────
    'Chat with Dr. Bike': '与Dr. Bike聊天',
    'Dr. Bike Assistant': 'Dr. Bike助手',
    'Ask me anything': '有问必答',
    'Type your question...': '输入您的问题...',
    'Type your question': '输入您的问题',
    'What does a Tune-Up include?': '基础调校包含什么？',
    'Which areas do you cover?': '你们覆盖哪些区域？',
    'How do memberships work?': '会员计划如何运作？',
    'Do you fix e-bikes?': '你们维修电动自行车吗？',
    "Sorry, I couldn't process that. Call us on 0433 963 250.":
      '抱歉，我无法处理该请求。请致电 0433 963 250。',
    "Sorry, I'm having trouble right now. Call us on 0433 963 250. 🔧":
      '抱歉，我现在遇到了一些问题。请致电 0433 963 250。🔧',
    "G'day! I'm the Dr. Bike assistant. Ask me about services, prices, coverage areas or memberships. 🚲":
      '您好！我是Dr. Bike助手。欢迎咨询服务、价格、覆盖区域或会员计划。🚲',

    // ── FAQ (landing.html specific answers) ───────────────────────────────
    'We service all Sydney metro including Inner West, Eastern Suburbs, CBD, North Shore, Manly, and Northern Beaches.':
      '我们覆盖悉尼都会区所有区域，包括Inner West、Eastern Suburbs、CBD、North Shore、Manly和Northern Beaches。',
    'You can reschedule or cancel up to 2 hours before your appointment at no charge.':
      '您可以在预约前2小时内免费改期或取消。',
    "Yes, we carry common parts in the van, but they are not included in the service price — they're charged separately at cost price with no markup.":
      '是的，我们车上备有常用零件，但不包含在服务价格内 - 按成本价另行收费，不加价。',
    'A basic tune-up takes 45-90 minutes. Full services can take 2-3 hours depending on the work required.':
      '基础调校需要45-90分钟。完整服务根据所需工作可能需要2-3小时。',
    'We accept all major credit cards, debit cards, Apple Pay, and Google Pay. Payment is taken after service completion.':
      '我们接受所有主流信用卡、借记卡、Apple Pay和Google Pay。服务完成后收取费用。',
    'Still have questions?': '还有疑问？',
    "We're here to help! Contact us and we'll get back to you within the hour.":
      '我们随时为您解答！联系我们，一小时内回复您。',

    // ── Fleet / Corporate (B2B) ────────────────────────────────────────────
    'For businesses': '企业服务',
    'Keep your whole fleet rolling': '让您的整个车队保持运转',
    'One mechanic, your entire team. We come to your office or depot and service all bikes in a single visit — no downtime, no logistics hassle.':
      '一位技工，服务您的整个团队。我们上门到您的办公室或仓库，一次上门为所有自行车提供服务 - 没有停工，没有物流麻烦。',
    'On-site service': '现场服务',
    'We come to your office, warehouse or depot. Zero travel time for your team.':
      '我们上门到您的办公室、仓库或车队基地，为您的团队节省全部往返时间。',
    'Volume pricing': '批量优惠',
    'Custom rates for 5+ bikes. The more bikes, the better the deal.':
      '5辆以上自行车享定制价格，车辆越多优惠越大。',
    'Priority scheduling': '优先排期',
    'Fleet clients get first access to bookings and a dedicated point of contact.':
      '车队客户享有优先预约权和专属联系人。',
    'Service reports': '服务报告',
    'Full PDF report per bike after every visit. Track the health of your entire fleet.':
      '每次上门后为每辆车提供完整PDF报告，追踪整个车队的健康状况。',
    'bikes serviced': '辆车已服务',
    'response time': '响应时间',
    'call-out for fleets': '车队上门检查费',
    'Get a fleet quote': '获取车队报价',
    "We'll reply within 2 business hours": '我们会在2个工作小时内回复',
    'Business name *': '企业名称 *',
    'Your name *': '您的姓名 *',
    'Work email *': '工作邮箱 *',
    Phone: '电话',
    'Fleet size *': '车队规模 *',
    'Fleet size': '车队规模',
    'Service frequency': '服务频率',
    'Select...': '请选择...',
    '2-5 bikes': '2-5辆',
    '6-15 bikes': '6-15辆',
    '16-30 bikes': '16-30辆',
    '31-50 bikes': '31-50辆',
    '50+ bikes': '50辆以上',
    'Not sure yet': '还不确定',
    Quarterly: '每季度',
    'Bi-annually': '每半年',
    'One-off': '单次',
    Notes: '备注',
    'Types of bikes, location, any specific issues...': '自行车类型、地点、具体问题...',
    'Request Fleet Quote': '申请车队报价',
    "No commitment required. We'll build a custom plan for your team.":
      '无需承诺，我们会为您的团队制定专属方案。',
    "Thanks! We'll be in touch within 2 business hours.": '谢谢！我们会在2个工作小时内联系您。',
    'Check your inbox for a confirmation.': '请查收邮箱中的确认信息。',
    'Quote Requested': '已申请报价',
    'Something went wrong. Please email us directly.': '出现问题，请直接给我们发邮件。',

    // ── Final CTA ───────────────────────────────────────────────────────────
    'Ready to Experience Premium Bike Service?': '准备好体验高端自行车服务了吗？',

    // ── Footer ──────────────────────────────────────────────────────────────
    'Professional bike service at your doorstep.': '上门专业自行车服务。',
    Facebook: 'Facebook',
    Instagram: 'Instagram',
    YouTube: 'YouTube',
    'Basic Service': 'Basic服务',
    'Premium Service': '高级服务',
    'Our Story': '我们的故事',
    Reviews: '客户评价',
    'Booking Help': '预订帮助',
    'Submit a Claim': '提交理赔',
    '© 2026 Dr. Bike Sydney. All rights reserved.': '© 2026 Dr. Bike Sydney. 保留所有权利。',

    // ── Newsletter signup ───────────────────────────────────────────────────
    'STAY IN THE LOOP': '随时了解最新资讯',
    'Cycling Tips & Offers': '骑行贴士与优惠',
    Subscribe: '订阅',
    'Please enter a valid email address.': '请输入有效的邮箱地址。',
    'Please wait a moment for the security check to finish, then try again.':
      '请稍等安全验证完成后再试一次。',
    '✅ Subscribed! Check your inbox for a 10% off code.': '✅ 订阅成功！请查收邮箱中的9折优惠码。',
    'Could not subscribe. Please try again.': '订阅失败，请重试。',
    'No spam. Unsubscribe anytime.': '不会发送垃圾邮件，随时可取消订阅。',
    'Monthly bike maintenance tips, seasonal safety advice and exclusive offers for Dr. Bike subscribers. Use code':
      '每月自行车保养贴士、季节性安全建议及Dr. Bike订阅者专属优惠。使用代码',
    'for 10% off your first booking.': '即可享首次预订9折优惠。',

    // ── Mobile SPA: form placeholders (My Bikes "add a bike" form) ─────────
    Brand: '品牌',
    Color: '颜色',
    Model: '型号',
    'Name (e.g. Red Trek)*': '名称（例如：红色Trek）*',
    Year: '年份',
    'e.g. 14 Smith St, Surry Hills NSW 2010': '例如：14 Smith St, Surry Hills NSW 2010',
    'Type a message...': '输入消息...',

    // ── Mobile SPA: toast messages (showToast) ──────────────────────────────
    'Account created! Check your email to verify.': '账户已创建！请查收邮箱进行验证。',
    'Bike added!': '自行车已添加！',
    'Booking cancelled.': '预订已取消。',
    'Booking rescheduled!': '预订已重新安排！',
    'Code copied!': '代码已复制！',
    'Could not delete bike. Try again.': '无法删除自行车，请重试。',
    'Membership will cancel at period end': '会员资格将在本期结束时取消',
    'No active booking.': '没有进行中的预订。',
    'Notification permission was not granted': '未授予通知权限',
    'Notifications are not set up yet - try again later': '通知尚未设置 - 请稍后再试',
    'Notifications enabled!': '通知已启用！',
    'Push notifications are not supported on this browser': '此浏览器不支持推送通知',
    'Select a date.': '请选择日期。',
    'Signed out successfully': '已成功退出登录',
    'Thanks for your feedback!': '感谢您的反馈！',
    'Your review is now on our page. Thank you for taking the time.': '您的评价已发布在我们的页面上。感谢您抽出时间。',
    'Would you share it on Google too? It helps other Sydney cyclists find us.': '也愿意在 Google 上分享吗？这能帮助更多悉尼骑行者找到我们。',
    'That service is no longer available. Please pick a new one.':
      '该服务已不可用，请选择新的服务。',
    'Tracking link copied!': '追踪链接已复制！',
    'Welcome back!': '欢迎回来！',
    'If that email has an account, we just sent a reset link.':
      '如果该邮箱已注册，我们刚刚发送了重置链接。',
    'Enter your email first, then tap Forgot Password.': '请先输入邮箱，然后点击"忘记密码"。',
    'Could not send the reset link. Please try again.': '无法发送重置链接，请重试。',
    'Forgot your email?': '忘记邮箱了？',
    'Enter the mobile number on your account and we will text you the email you signed up with.':
      '请输入您账户的手机号，我们会以短信发送您注册时使用的邮箱。',
    'Send it to me': '发送给我',
    'If that number has an account, we just texted you the email':
      '如果该号码已注册，我们刚刚以短信发送了邮箱地址',
    'Where do we send your booking?': '预订确认发送到哪里？',
    'No account needed. We only use this to confirm your booking and let the mechanic reach you.':
      '无需账户。我们仅用它来确认您的预订，并让技师能联系到您。',
    Mobile: '手机号',
    'I already have an account': '我已有账户',
    'Please enter your name': '请输入您的姓名',
    'Please enter a valid email': '请输入有效的邮箱',
    'Please enter a valid mobile number': '请输入有效的手机号',
    'Jane Smith': '张三',
    'you@email.com': 'you@email.com',
    'Please create an account or sign in to finish your booking': '请创建账户或登录以完成预订',
    'Please sign in to complete your booking.': '请登录以完成您的预订。',
    'Please sign in to send a message.': '请登录以发送消息。',
    'Please sign in again.': '请重新登录。',
    'We need an email to send your receipt.': '我们需要一个邮箱来发送收据。',
    "Sorry, we don't currently service that address. Try a different address or contact us.":
      '抱歉，我们目前不提供该地址的服务。请尝试其他地址或联系我们。',

    // ── Mobile SPA: dynamic button/status text ──────────────────────────────
    'Checking address...': '正在核实地址...',
    'Processing payment...': '正在处理付款...',
    'Payment received but the booking could not be saved. Tap Pay again to retry, or contact us.':
      '已收到付款，但预订未能保存。请再次点击"付款"重试，或与我们联系。',
    'Payment failed. Please check your card details and try again.':
      '付款失败。请检查您的银行卡信息后重试。',
    'Nickname is required': '请填写昵称',
    'Delete this bike?': '要删除这辆自行车吗？',
    'Could not confirm booking. Please try again.': '无法确认预订，请重试。',
    'Could not submit review. Please try again.': '无法提交评价，请重试。',
    'Google login failed. Please try again.': 'Google 登录失败，请重试。',
    'Invalid code': '代码无效',
    'Payment could not be confirmed. Please contact us if you were charged.':
      '无法确认付款。如果已扣款，请联系我们。',
    'Test booking failed': '测试预订失败',
    // Confirm dialog (js/components.js)
    Confirm: '确认',
    Delete: '删除',
    'Keep it': '保留',
    'This cannot be undone.': '此操作无法撤销。',
    'Cancel your membership?': '要取消会员资格吗？',
    'Cancel membership': '取消会员资格',
    'It will stay active until the end of the current billing period.':
      '在当前计费周期结束前仍然有效。',
    'Track my Dr. Bike service': '追踪我的 Dr. Bike 服务',
    'Processing...': '处理中...',
    'Redirecting to payment...': '正在跳转到支付页面...',
    'Choose an amount between $20 and $1000.': '请选择 $20 至 $1000 之间的金额。',
    'Creating test booking...': '正在创建测试预订...',
    'Photo selected — tap to change': '已选择照片 — 点击更改',
    'Tap to add a photo (optional)': '点击添加照片（可选）',
    'Please select a rating.': '请选择评分。',
    'Loading...': '加载中...',
    'Confirm reschedule': '确认重新安排',
    'No service data yet': '暂无服务数据',
    'No checklist data': '暂无检查清单数据',
    'Could not load health data': '无法加载健康数据',

    // ── Full i18n sweep 2026-07-26 (same set as the Spanish block above) ────
    'Included in your membership': '已包含在您的会员权益内',
    'Confirm booking': '确认预订',
    'or pay by card': '或使用银行卡支付',
    'Card details': '银行卡信息',
    'Secure payment powered by Stripe. Encrypted and safe.':
      '由 Stripe 提供安全支付，全程加密，安全可靠。',
    'Prefer to book manually?': '想通过人工预订？',
    'call 0433 963 250': '致电 0433 963 250',
    'Select a time.': '请选择时间。',
    'Sign in to track bookings': '登录以追踪预订',
    'Your bookings will appear here': '您的预订将显示在这里',
    'Book a service to track it here': '预订服务后即可在此追踪',
    'Could not load bookings. Try again.': '无法加载预订，请重试。',
    'Your code:': '您的验证码：',
    '— read this to your mechanic when they arrive': '— 技师到达时请把此码告诉他',
    'Cancellation reason': '取消原因',
    Photos: '照片',
    Before: '维修前',
    After: '维修后',
    '⭐ Rate this mechanic': '⭐ 为技师评分',
    'Thanks for the 5 stars!': '感谢您的五星好评！',
    'Would you mind leaving a quick Google review? It helps other Sydney cyclists find us.':
      '方便在 Google 上留个简短评价吗？这能帮助更多悉尼骑行者找到我们。',
    'Leave a Google Review': '去 Google 留下评价',
    'Share on Facebook': '分享到 Facebook',
    'Skip — back to home': '跳过 — 返回主页',
    'Rate your experience': '为您的体验评分',
    '📞 Call': '📞 致电',
    '1. Share your code with friends': '1. 把您的邀请码分享给朋友',
    Language: '语言',
    'Sign Out': '退出登录',
    'Loading bikes...': '正在加载自行车...',
    'Type (optional)': '类型（可选）',
    Road: '公路车',
    'Mountain Bike': '山地车',
    Hybrid: '混合车',
    Cargo: '载货车',
    Folding: '折叠车',
    'Save Bike': '保存自行车',
    'Bike Health Score': '自行车健康评分',
    'Service history': '服务记录',
    'Delete bike': '删除自行车',
    'Failed to load bikes': '无法加载自行车',
    'Bike name': '自行车名称',
    'Bike type': '自行车类型',
    '🔍 Analysing your photo...': '🔍 正在分析您的照片...',
    '🔍 Analysing...': '🔍 正在分析...',
    '🤖 AI Recommendation': '🤖 AI 建议',
    'Describe the problem': '描述问题',
    'Close chat': '关闭聊天',
    'Type a message': '输入消息',
    'Toggle password visibility': '显示或隐藏密码',
    'Could not enable notifications:': '无法开启通知：',
    '100% Satisfaction': '100% 满意',
    'Trusted by cyclists across Sydney': '深受悉尼各地骑行者信赖',
    'Be the first to leave a review': '成为第一个留下评价的人',
    'Real reviews from Sydney cyclists will show up here as soon as clients start sharing their experience.':
      '悉尼骑行者的真实评价会在客户开始分享体验后显示在这里。',
    'Site navigation': '网站导航',
    'Main navigation': '主导航',
    'Phone Number': '电话号码',
    'Business name': '公司名称',
    'Work email': '工作邮箱',
    'Custom gift amount': '自定义礼品金额',
    "Recipient's email": '收件人邮箱',
    'Adjust brakes & gears, lube chain, safety check': '调整刹车与变速、润滑链条、安全检查',
    'Complete overhaul: bearings, cables, full clean': '全面大修：轴承、线缆、彻底清洁',
    '© 2026 Dr. Bike Sydney. All rights reserved. · ABN: 87 654 025 287':
      '© 2026 Dr. Bike Sydney. 版权所有。· ABN: 87 654 025 287',

    'The $CALLOUT visit & diagnosis fee is charged now via Stripe. The service fee ($SERVICE) is paid to the mechanic directly by card (EFTPOS) when they arrive.':
      '$CALLOUT 的上门检查费现在通过 Stripe 收取。服务费（$SERVICE）在技师到达时用银行卡（EFTPOS）直接支付给技师。',

    'Confirm & Pay $CALLOUT Visit & Diagnosis': '确认并支付 $CALLOUT 上门检查费',
    'Pay $CALLOUT Visit & Diagnosis': '支付 $CALLOUT 上门检查费',

    // ── track.html (public tracking link) ───────────────────────────────────
    'Loading your booking...': '正在加载您的预订...',
    'This link is no longer valid.': '此链接已失效。',
    'Look up your booking by email →': '用邮箱查找您的预订 →',
    'Booking not found.': '未找到预订。',
    '← Back to Dr. Bike': '← 返回 Dr. Bike',
    'We could not reach Dr. Bike. Check your connection and try again - your booking is safe.':
      '无法连接 Dr. Bike。请检查网络后重试，您的预订不会丢失。',
    'Try again': '重试',
    'Live updates stopped. Reload to try again.': '实时更新已停止。请重新加载后重试。',
    '⏳ Pending confirmation': '⏳ 等待确认',
    '✅ Confirmed': '✅ 已确认',
    '🚐 Mechanic on the way!': '🚐 技师正在路上！',
    '✅ Service completed': '✅ 服务已完成',
    Van: '服务车',
    'Service price': '服务价格',
    'Locating mechanic...': '正在定位技师...',
    Live: '实时',
    'Your mechanic is on the way!': '您的技师正在路上！',
    'Your mechanic has arrived!': '您的技师已到达！',
    'This page updates automatically': '此页面会自动更新',
    'Questions? Contact us': '有疑问？联系我们',
    '📞 Call +61 433 963 250': '📞 致电 +61 433 963 250',
    '🔧 Parts:': '🔧 零件：',
    '📅 Next service:': '📅 下次服务：',
    '🕐 Estimated arrival: ~MIN min': '🕐 预计到达：约 MIN 分钟',
    'Track your booking': '追踪您的预订',
    'Enter the email you used to book': '请输入您预订时使用的邮箱',
    'Find my bookings →': '查找我的预订 →',
    'Enter a valid email': '请输入有效的邮箱',
    'Searching...': '正在搜索...',
    'If that email has any bookings, we just sent tracking links for all of them.':
      '如果该邮箱有任何预订，我们已将全部追踪链接发送至该邮箱。',
    'Connection error. Try again.': '连接错误，请重试。',
    'your@email.com': 'your@email.com',
  },
};

function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // 'en' is a valid saved choice with no dict entry (it IS the source
    // language) - without this check an explicit English pick gets overridden
    // by the device locale on every reload.
    if (saved === 'en' || (saved && dict[saved])) return saved;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return dict[nav] ? nav : 'en';
}

let currentLang = detectLang();

export function getLang() {
  return currentLang;
}

// Dates and times were formatted with a hardcoded 'en-AU' everywhere, so a
// client reading the app in Spanish or Chinese still got "Monday, 27 July".
// Use this for any client-facing toLocaleDateString/toLocaleTimeString call
// (the admin and mechanic apps are English-only by design and keep en-AU).
const DATE_LOCALES = { en: 'en-AU', es: 'es-ES', zh: 'zh-CN' };

export function dateLocale() {
  return DATE_LOCALES[currentLang] || 'en-AU';
}

export function setLang(lang) {
  if (lang !== 'en' && !dict[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// Reverse lookup (translated text -> original English). Needed by code that
// reads rendered text back out of the DOM and matches it against English data:
// js/live-prices.js compares service-card headings with the Supabase `services`
// table, and after a translation pass those headings are no longer English, so
// every card silently fell back to its static price in Spanish and Chinese.
const reverseIndex = {};

export function sourceOf(text) {
  const trimmed = (text || '').trim();
  if (currentLang === 'en') return trimmed;
  if (!reverseIndex[currentLang]) {
    const index = {};
    for (const [source, translated] of Object.entries(dict[currentLang] || {})) {
      // first definition wins, so an English word that is its own translation
      // never gets shadowed by a later entry
      if (!(translated in index)) index[translated] = source;
    }
    reverseIndex[currentLang] = index;
  }
  return reverseIndex[currentLang][trimmed] || trimmed;
}

// Original (English) text is cached per node/element so switching languages
// back and forth always translates FROM the source, not from whatever is
// currently displayed - otherwise going back to English couldn't restore it.
const originalText = new WeakMap(); // TextNode -> original nodeValue
const originalAttrs = new WeakMap(); // Element -> { placeholder?, ariaLabel? }

export function translateValue(original) {
  const trimmed = original.trim();
  if (!trimmed) return original;
  if (currentLang === 'en') return original;
  const translated = dict[currentLang]?.[trimmed];
  return translated ? original.replace(trimmed, translated) : original;
}

// Walk a rendered screen's text nodes and swap any exact match found in the
// current language's dictionary. Re-running with lang='en' restores the
// original text; unmatched strings always fall back to English.
export function translateScreen(root) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  nodes.forEach((n) => {
    if (!originalText.has(n)) originalText.set(n, n.nodeValue);
    n.nodeValue = translateValue(originalText.get(n));
  });

  root.querySelectorAll('[placeholder], [aria-label]').forEach((el) => {
    if (!originalAttrs.has(el)) {
      originalAttrs.set(el, {
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
      });
    }
    const orig = originalAttrs.get(el);
    if (orig.placeholder !== null) el.setAttribute('placeholder', translateValue(orig.placeholder));
    if (orig.ariaLabel !== null) el.setAttribute('aria-label', translateValue(orig.ariaLabel));
  });
}
