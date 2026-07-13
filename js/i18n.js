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
    Date: 'Fecha',
    Time: 'Hora',
    Address: 'Dirección',
    'Call-out fee': 'Tarifa de visita',
    'Book Again': 'Reservar de nuevo',
    'Track Live': 'Rastrear en vivo',
    'Share tracking link': 'Compartir enlace de rastreo',
    Reschedule: 'Reprogramar',
    'Cancel booking': 'Cancelar reserva',
    Close: 'Cerrar',
    'Your mechanic': 'Tu mecánico',
    'Rate this mechanic': 'Calificar a este mecánico',
    'Your review': 'Tu reseña',
    'Client reviews': 'Reseñas de clientes',
    'Jobs done': 'Trabajos hechos',
    Rating: 'Calificación',
    // My Bikes
    'My Bikes': 'Mis Bicis',
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
    "The $20 call-out fee covers the mechanic's trip. Most areas in Sydney are covered.":
      'La tarifa de visita de $20 cubre el viaje del mecánico. Cubrimos la mayoría de las áreas de Sydney.',
    'Continue to Summary': 'Continuar al Resumen',
    // Service Summary / Quote
    'Sunday & public holiday rate': 'Tarifa de domingo y feriado',
    'Your Quote': 'Tu Cotización',
    Location: 'Ubicación',
    "What's included": 'Qué incluye',
    'Service fee': 'Costo del servicio',
    'Mobile call-out fee': 'Tarifa de visita móvil',
    'Paid online now via Stripe': 'Se paga ahora en línea con Stripe',
    'Promo discount': 'Descuento promocional',
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
    'From $60': 'Desde $60',
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
    'Priority scheduling (48hs)': 'Turnos prioritarios (48hs)',
    'Digital bike history': 'Historial digital de la bici',
    '2 services per month (any type)': '2 servicios por mes (cualquier tipo)',
    '15% off parts': '15% de descuento en repuestos',
    'Priority scheduling (24hs)': 'Turnos prioritarios (24hs)',
    '1 emergency callout/month': '1 visita de emergencia/mes',
    'Unlimited services per month': 'Servicios ilimitados por mes',
    '20% off parts': '20% de descuento en repuestos',
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
    'We accept all major credit and debit cards, Apple Pay, and Google Pay. A $20 call-out deposit is charged at booking; the remainder is charged on completion.':
      'Aceptamos todas las tarjetas de crédito y débito principales, Apple Pay y Google Pay. Se cobra un depósito de $20 al reservar; el resto se cobra al completar el servicio.',
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
    'Secured by Stripe · 3-month minimum · Cancel anytime after':
      'Protegido por Stripe - mínimo 3 meses - cancelá cuando quieras después',
    "You're all set!": '¡Todo listo!',
    "We'll be in touch shortly to confirm your membership and schedule your first service.":
      'Nos pondremos en contacto pronto para confirmar tu membresía y agendar tu primer servicio.',
    Done: 'Listo',
    INCLUDES: 'INCLUYE',
    'DOES NOT INCLUDE': 'NO INCLUYE',
    'SAVINGS EXAMPLE': 'EJEMPLO DE AHORRO',
    'Professional bike service at your doorstep. Sydney’s mobile bicycle mechanic.':
      'Servicio profesional de bicicletas en tu puerta. El mecánico móvil de bicicletas de Sydney.',
    Company: 'Empresa',
    Contact: 'Contacto',
    'About Us': 'Sobre Nosotros',
    'My Account': 'Mi Cuenta',
    'Sydney, NSW': 'Sydney, NSW',
    'Mon – Sun: 8:30AM – 4:00PM': 'Lun - Dom: 8:30AM - 4:00PM',
  },
  zh: {
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
    Date: '日期',
    Time: '时间',
    Address: '地址',
    'Call-out fee': '上门费',
    'Book Again': '再次预订',
    'Track Live': '实时追踪',
    'Share tracking link': '分享追踪链接',
    Reschedule: '改期',
    'Cancel booking': '取消预订',
    Close: '关闭',
    'Your mechanic': '您的技工',
    'Rate this mechanic': '给这位技工评分',
    'Your review': '您的评价',
    'Client reviews': '客户评价',
    'Jobs done': '已完成工作',
    Rating: '评分',
    // My Bikes
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
    "The $20 call-out fee covers the mechanic's trip. Most areas in Sydney are covered.":
      '20美元的上门费包含技工的车费。悉尼大部分地区均可提供服务。',
    'Continue to Summary': '继续查看摘要',
    // Service Summary / Quote
    'Sunday & public holiday rate': '周日及公共假期费率',
    'Your Quote': '您的报价',
    Location: '位置',
    "What's included": '服务内容',
    'Service fee': '服务费',
    'Mobile call-out fee': '上门服务费',
    'Paid online now via Stripe': '通过 Stripe 在线支付',
    'Promo discount': '优惠折扣',
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
    'From $60': '起价 $60',
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
    'Priority scheduling (48hs)': '优先预约（48小时）',
    'Digital bike history': '数字化车辆记录',
    '2 services per month (any type)': '每月2次服务（任意类型）',
    '15% off parts': '零件享85折',
    'Priority scheduling (24hs)': '优先预约（24小时）',
    '1 emergency callout/month': '每月1次紧急上门',
    'Unlimited services per month': '每月无限次服务',
    '20% off parts': '零件享8折',
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
    'We accept all major credit and debit cards, Apple Pay, and Google Pay. A $20 call-out deposit is charged at booking; the remainder is charged on completion.':
      '我们接受所有主流信用卡和借记卡、Apple Pay和Google Pay。预订时收取$20上门押金，其余金额在服务完成后收取。',
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
    'Secured by Stripe · 3-month minimum · Cancel anytime after':
      'Stripe安全保障 - 最低3个月 - 之后可随时取消',
    "You're all set!": '一切就绪！',
    "We'll be in touch shortly to confirm your membership and schedule your first service.":
      '我们会尽快与您联系，确认会员资格并安排首次服务。',
    Done: '完成',
    INCLUDES: '包含',
    'DOES NOT INCLUDE': '不包含',
    'SAVINGS EXAMPLE': '节省示例',
    'Professional bike service at your doorstep. Sydney’s mobile bicycle mechanic.':
      '上门专业自行车服务，悉尼的移动自行车技工。',
    Company: '公司',
    Contact: '联系方式',
    'About Us': '关于我们',
    'My Account': '我的账户',
    'Sydney, NSW': '悉尼, NSW',
    'Mon – Sun: 8:30AM – 4:00PM': '周一至周日：8:30 - 16:00',
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

export function setLang(lang) {
  if (lang !== 'en' && !dict[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// Original (English) text is cached per node/element so switching languages
// back and forth always translates FROM the source, not from whatever is
// currently displayed - otherwise going back to English couldn't restore it.
const originalText = new WeakMap(); // TextNode -> original nodeValue
const originalAttrs = new WeakMap(); // Element -> { placeholder?, ariaLabel? }

function translateValue(original) {
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
