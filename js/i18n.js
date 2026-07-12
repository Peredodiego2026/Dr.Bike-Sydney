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
