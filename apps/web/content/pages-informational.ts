import { buildPage } from './build-page';
import type { MarketingPage } from './types';

/**
 * Explanatory, commercial and legal pages.
 *
 * The legal pages are deliberately short here and link to the full documents:
 * a privacy policy and terms of service must be reviewed by counsel for each
 * jurisdiction, and machine-translating legal language is a bad idea, so the
 * canonical text lives in `docs/` as a reviewable template rather than being
 * generated into seven languages.
 */

const howItWorks = buildPage({
  path: 'how-it-works',
  kind: 'informational',
  ctaPath: 'listen',
  rows: {
    en: [
      'How LingoLive works | LingoLive',
      'Speech is transcribed once, translated once per language, and shown to everyone who reads that language. Here is the whole path, end to end.',
      'How it works',
      'There is not much to it, and that is the point. Three actions, one path through the system, and no configuration before you can start.',
      'From speech to text',
      'When a session starts, the app asks for a short-lived credential, opens a connection and begins capturing. Words appear as they are recognised; a sentence settles into final text about a second after you stop speaking.',
      'From text to your language',
      'The transcription is the source of truth and is never replaced. Translations are added beside it — once per language, then shared with everyone reading that language. Two people reading Spanish cost one translation, not two.',
      'Start listening',
    ],
    fr: [
      'Comment fonctionne LingoLive | LingoLive',
      'La parole est transcrite une fois, traduite une fois par langue, et affichée à tous ceux qui lisent cette langue. Voici tout le chemin, de bout en bout.',
      'Comment ça marche',
      "Il n'y a pas grand-chose, et c'est voulu. Trois actions, un seul chemin dans le système, et aucune configuration avant de commencer.",
      'De la parole au texte',
      "Au démarrage d'une session, l'application demande une autorisation temporaire, ouvre une connexion et commence la capture. Les mots apparaissent au fur et à mesure ; une phrase se fige environ une seconde après la fin de la parole.",
      'Du texte à votre langue',
      "La transcription est la source de vérité et n'est jamais remplacée. Les traductions viennent à côté — une fois par langue, puis partagées avec tous ceux qui lisent cette langue. Deux personnes qui lisent l'espagnol coûtent une traduction, pas deux.",
      'Commencer à écouter',
    ],
    ar: [
      'كيف يعمل LingoLive | LingoLive',
      'يُفرَّغ الكلام مرة واحدة، ويُترجَم مرة واحدة لكل لغة، ويُعرَض لكل من يقرأ تلك اللغة. هذا هو المسار كاملًا.',
      'كيف يعمل',
      'ليس هناك الكثير، وهذا هو المقصود. ثلاثة إجراءات، ومسار واحد داخل النظام، ولا إعدادات قبل البدء.',
      'من الكلام إلى النص',
      'عند بدء الجلسة يطلب التطبيق تصريحًا قصير الأجل، ويفتح اتصالًا، ويبدأ الالتقاط. تظهر الكلمات فور التعرّف عليها، وتستقر الجملة بعد نحو ثانية من انتهاء الكلام.',
      'من النص إلى لغتك',
      'التفريغ هو مصدر الحقيقة ولا يُستبدل أبدًا. تُضاف الترجمات إلى جانبه — مرة لكل لغة، ثم تُشارَك مع كل من يقرأ تلك اللغة. شخصان يقرآن الإسبانية يكلّفان ترجمة واحدة لا اثنتين.',
      'ابدأ الاستماع',
    ],
    es: [
      'Cómo funciona LingoLive | LingoLive',
      'El habla se transcribe una vez, se traduce una vez por idioma y se muestra a todos los que leen ese idioma. Este es el recorrido completo.',
      'Cómo funciona',
      'No hay mucho más, y esa es la idea. Tres acciones, un único recorrido por el sistema y ninguna configuración antes de empezar.',
      'Del habla al texto',
      'Al iniciar una sesión, la app pide una credencial de corta duración, abre una conexión y empieza a capturar. Las palabras aparecen según se reconocen; una frase se fija como definitiva alrededor de un segundo después de dejar de hablar.',
      'Del texto a tu idioma',
      'La transcripción es la fuente de verdad y nunca se sustituye. Las traducciones se añaden al lado: una por idioma, y luego se comparten con todos los que leen ese idioma. Dos personas leyendo español cuestan una traducción, no dos.',
      'Empezar a escuchar',
    ],
    'pt-BR': [
      'Como o LingoLive funciona | LingoLive',
      'A fala é transcrita uma vez, traduzida uma vez por idioma e mostrada a todos que leem aquele idioma. Este é o caminho completo.',
      'Como funciona',
      'Não há muito, e é essa a ideia. Três ações, um único caminho pelo sistema e nenhuma configuração antes de começar.',
      'Da fala ao texto',
      'Ao iniciar uma sessão, o app pede uma credencial de curta duração, abre uma conexão e começa a capturar. As palavras aparecem conforme são reconhecidas; a frase se fixa como final cerca de um segundo depois que você para de falar.',
      'Do texto para o seu idioma',
      'A transcrição é a fonte da verdade e nunca é substituída. As traduções são acrescentadas ao lado — uma por idioma, depois compartilhadas com todos que leem aquele idioma. Duas pessoas lendo espanhol custam uma tradução, não duas.',
      'Começar a ouvir',
    ],
    it: [
      'Come funziona LingoLive | LingoLive',
      'Il parlato viene trascritto una volta, tradotto una volta per lingua e mostrato a chiunque legga quella lingua. Ecco tutto il percorso.',
      'Come funziona',
      'Non c’è molto altro, ed è voluto. Tre azioni, un solo percorso nel sistema e nessuna configurazione prima di iniziare.',
      'Dal parlato al testo',
      'All’avvio di una sessione l’app richiede una credenziale a breve scadenza, apre una connessione e inizia la cattura. Le parole compaiono man mano che vengono riconosciute; la frase diventa definitiva circa un secondo dopo che smetti di parlare.',
      'Dal testo alla tua lingua',
      'La trascrizione è la fonte di verità e non viene mai sostituita. Le traduzioni si aggiungono accanto: una per lingua, poi condivise con chiunque legga quella lingua. Due persone che leggono spagnolo costano una traduzione, non due.',
      'Inizia ad ascoltare',
    ],
    de: [
      'Wie LingoLive funktioniert | LingoLive',
      'Sprache wird einmal transkribiert, einmal pro Sprache übersetzt und allen gezeigt, die diese Sprache lesen. Hier ist der ganze Weg.',
      'So funktioniert es',
      'Viel mehr ist es nicht, und das ist Absicht. Drei Aktionen, ein Weg durch das System und keine Konfiguration, bevor du loslegen kannst.',
      'Von Sprache zu Text',
      'Beim Start einer Sitzung holt die App eine kurzlebige Berechtigung, öffnet eine Verbindung und beginnt aufzunehmen. Wörter erscheinen, sobald sie erkannt sind; ein Satz wird etwa eine Sekunde nach dem Sprechen endgültig.',
      'Von Text in deine Sprache',
      'Die Transkription ist die Quelle der Wahrheit und wird nie ersetzt. Übersetzungen kommen daneben — einmal pro Sprache, dann geteilt mit allen, die diese Sprache lesen. Zwei Personen, die Spanisch lesen, kosten eine Übersetzung, nicht zwei.',
      'Jetzt zuhören',
    ],
  },
  faq: {
    en: [
      {
        question: 'Do I need an account?',
        answer:
          'No. Listening, discussing and joining a session all work without one. An account only adds saved history across devices and a larger allowance.',
      },
      {
        question: 'Is my audio recorded?',
        answer:
          'No. Audio is never stored — not on the device, not on the server, not in a log. Only text you explicitly save is kept.',
      },
      {
        question: 'Does it work offline?',
        answer:
          'No. Live transcription needs an internet connection, and LingoLive says so clearly rather than failing silently.',
      },
    ],
    fr: [
      {
        question: "Ai-je besoin d'un compte ?",
        answer:
          "Non. Écouter, discuter et rejoindre une session fonctionnent sans compte. Un compte ajoute seulement l'historique sauvegardé entre appareils et un quota plus large.",
      },
      {
        question: 'Mon audio est-il enregistré ?',
        answer:
          "Non. L'audio n'est jamais conservé — ni sur l'appareil, ni sur le serveur, ni dans un journal. Seul le texte que vous sauvegardez explicitement est gardé.",
      },
      {
        question: 'Est-ce que ça fonctionne hors ligne ?',
        answer:
          "Non. La transcription en direct nécessite Internet, et LingoLive le dit clairement plutôt que d'échouer en silence.",
      },
    ],
    ar: [
      {
        question: 'هل أحتاج إلى حساب؟',
        answer:
          'لا. الاستماع والتحدث والانضمام إلى جلسة تعمل جميعها بدون حساب. الحساب يضيف فقط سجلًا محفوظًا عبر الأجهزة وحصة أكبر.',
      },
      {
        question: 'هل يُسجَّل صوتي؟',
        answer:
          'لا. لا يُخزَّن الصوت أبدًا — لا على الجهاز ولا على الخادم ولا في السجلات. يُحفَظ فقط النص الذي تحفظه صراحةً.',
      },
      {
        question: 'هل يعمل دون اتصال؟',
        answer:
          'لا. يحتاج التفريغ المباشر إلى الإنترنت، ويقول LingoLive ذلك بوضوح بدل أن يفشل بصمت.',
      },
    ],
    es: [
      {
        question: '¿Necesito una cuenta?',
        answer:
          'No. Escuchar, conversar y unirse a una sesión funcionan sin cuenta. Una cuenta solo añade historial guardado entre dispositivos y un límite mayor.',
      },
      {
        question: '¿Se graba mi audio?',
        answer:
          'No. El audio nunca se almacena: ni en el dispositivo, ni en el servidor, ni en un registro. Solo se conserva el texto que guardas explícitamente.',
      },
      {
        question: '¿Funciona sin conexión?',
        answer:
          'No. La transcripción en directo necesita internet, y LingoLive lo dice con claridad en lugar de fallar en silencio.',
      },
    ],
    'pt-BR': [
      {
        question: 'Preciso de uma conta?',
        answer:
          'Não. Ouvir, conversar e entrar em uma sessão funcionam sem conta. A conta só acrescenta histórico salvo entre dispositivos e um limite maior.',
      },
      {
        question: 'Meu áudio é gravado?',
        answer:
          'Não. O áudio nunca é armazenado — nem no aparelho, nem no servidor, nem em registros. Só fica guardado o texto que você salva explicitamente.',
      },
      {
        question: 'Funciona offline?',
        answer:
          'Não. A transcrição ao vivo precisa de internet, e o LingoLive avisa claramente em vez de falhar em silêncio.',
      },
    ],
    it: [
      {
        question: 'Serve un account?',
        answer:
          'No. Ascoltare, parlare ed entrare in una sessione funzionano senza account. Un account aggiunge solo la cronologia salvata tra dispositivi e un limite più ampio.',
      },
      {
        question: 'Il mio audio viene registrato?',
        answer:
          'No. L’audio non viene mai conservato: né sul dispositivo, né sul server, né nei log. Resta solo il testo che salvi esplicitamente.',
      },
      {
        question: 'Funziona offline?',
        answer:
          'No. La trascrizione in diretta richiede Internet, e LingoLive lo dice chiaramente invece di fallire in silenzio.',
      },
    ],
    de: [
      {
        question: 'Brauche ich ein Konto?',
        answer:
          'Nein. Zuhören, Sprechen und einer Sitzung beitreten funktionieren ohne Konto. Ein Konto bringt nur gespeicherten Verlauf über Geräte hinweg und ein größeres Kontingent.',
      },
      {
        question: 'Wird mein Audio aufgezeichnet?',
        answer:
          'Nein. Audio wird nie gespeichert — nicht auf dem Gerät, nicht auf dem Server, nicht im Log. Erhalten bleibt nur Text, den du ausdrücklich speicherst.',
      },
      {
        question: 'Funktioniert es offline?',
        answer:
          'Nein. Live-Transkription braucht Internet, und LingoLive sagt das klar, statt still zu scheitern.',
      },
    ],
  },
});

const pricing = buildPage({
  path: 'pricing',
  kind: 'informational',
  ctaPath: 'listen',
  rows: {
    en: [
      'Pricing | LingoLive',
      'Start free with no account. Upgrade when you need more minutes. Joining a session someone invited you to is always free.',
      'Pricing',
      'Everything below is measured in minutes of live audio. Reading a session someone else is running never uses your allowance.',
      'Free, and free to join',
      'You can use LingoLive without an account at all. Creating one raises your monthly allowance and syncs saved transcripts across devices. Joining a LingoBusiness session is always free and never requires an account.',
      'Pro, when you need more',
      'Pro raises the monthly allowance substantially and lifts the per-session length limit. There is no advertising in LingoLive at any tier, and no plan gives anyone access to your transcripts.',
      'Start listening',
    ],
    fr: [
      'Tarifs | LingoLive',
      "Commencez gratuitement, sans compte. Passez à l'offre supérieure quand vous avez besoin de plus de minutes. Rejoindre une session à laquelle on vous a invité est toujours gratuit.",
      'Tarifs',
      "Tout se compte en minutes d'audio en direct. Lire une session animée par quelqu'un d'autre ne consomme jamais votre quota.",
      'Gratuit, et gratuit à rejoindre',
      'Vous pouvez utiliser LingoLive sans aucun compte. En créer un augmente votre quota mensuel et synchronise vos transcriptions sauvegardées entre appareils. Rejoindre une session LingoBusiness est toujours gratuit et ne demande jamais de compte.',
      'Pro, quand il vous en faut plus',
      'Pro augmente nettement le quota mensuel et lève la limite de durée par session. LingoLive ne contient aucune publicité, à aucun niveau, et aucune formule ne donne à quiconque accès à vos transcriptions.',
      'Commencer à écouter',
    ],
    ar: [
      'الأسعار | LingoLive',
      'ابدأ مجانًا دون حساب. ارتقِ بالخطة عندما تحتاج إلى دقائق أكثر. الانضمام إلى جلسة دُعيت إليها مجاني دائمًا.',
      'الأسعار',
      'كل شيء يُحسب بدقائق الصوت المباشر. قراءة جلسة يديرها شخص آخر لا تستهلك حصتك أبدًا.',
      'مجاني، ومجاني للانضمام',
      'يمكنك استخدام LingoLive دون أي حساب. إنشاء حساب يرفع حصتك الشهرية ويزامن نصوصك المحفوظة بين الأجهزة. الانضمام إلى جلسة LingoBusiness مجاني دائمًا ولا يتطلب حسابًا أبدًا.',
      'برو، عندما تحتاج المزيد',
      'ترفع خطة برو الحصة الشهرية بشكل كبير وتزيل حد المدة لكل جلسة. لا يوجد أي إعلان في LingoLive على أي مستوى، ولا تمنح أي خطة لأحد الوصول إلى نصوصك.',
      'ابدأ الاستماع',
    ],
    es: [
      'Precios | LingoLive',
      'Empieza gratis y sin cuenta. Mejora tu plan cuando necesites más minutos. Unirse a una sesión a la que te han invitado siempre es gratis.',
      'Precios',
      'Todo se mide en minutos de audio en directo. Leer una sesión que dirige otra persona nunca consume tu límite.',
      'Gratis, y gratis para unirse',
      'Puedes usar LingoLive sin ninguna cuenta. Crear una aumenta tu límite mensual y sincroniza las transcripciones guardadas entre dispositivos. Unirse a una sesión de LingoBusiness siempre es gratis y nunca requiere cuenta.',
      'Pro, cuando necesitas más',
      'Pro aumenta notablemente el límite mensual y elimina el tope de duración por sesión. LingoLive no tiene publicidad en ningún nivel, y ningún plan da a nadie acceso a tus transcripciones.',
      'Empezar a escuchar',
    ],
    'pt-BR': [
      'Preços | LingoLive',
      'Comece grátis e sem conta. Faça upgrade quando precisar de mais minutos. Entrar em uma sessão para a qual você foi convidado é sempre grátis.',
      'Preços',
      'Tudo é medido em minutos de áudio ao vivo. Ler uma sessão conduzida por outra pessoa nunca consome o seu limite.',
      'Grátis, e grátis para entrar',
      'Você pode usar o LingoLive sem conta nenhuma. Criar uma aumenta seu limite mensal e sincroniza as transcrições salvas entre aparelhos. Entrar em uma sessão do LingoBusiness é sempre grátis e nunca exige conta.',
      'Pro, quando você precisa de mais',
      'O Pro aumenta bastante o limite mensal e remove o teto de duração por sessão. O LingoLive não tem publicidade em nenhum nível, e nenhum plano dá a ninguém acesso às suas transcrições.',
      'Começar a ouvir',
    ],
    it: [
      'Prezzi | LingoLive',
      'Inizia gratis e senza account. Passa a un piano superiore quando ti servono più minuti. Entrare in una sessione a cui ti hanno invitato è sempre gratuito.',
      'Prezzi',
      'Tutto si misura in minuti di audio in diretta. Leggere una sessione condotta da qualcun altro non consuma mai il tuo limite.',
      'Gratis, e gratis per entrare',
      'Puoi usare LingoLive senza alcun account. Crearne uno aumenta il limite mensile e sincronizza le trascrizioni salvate tra dispositivi. Entrare in una sessione LingoBusiness è sempre gratuito e non richiede mai un account.',
      'Pro, quando ti serve di più',
      'Pro aumenta sensibilmente il limite mensile e rimuove il tetto di durata per sessione. LingoLive non contiene pubblicità a nessun livello, e nessun piano dà a chiunque accesso alle tue trascrizioni.',
      'Inizia ad ascoltare',
    ],
    de: [
      'Preise | LingoLive',
      'Kostenlos starten, ohne Konto. Upgraden, wenn du mehr Minuten brauchst. Einer Sitzung beizutreten, zu der du eingeladen wurdest, ist immer kostenlos.',
      'Preise',
      'Alles wird in Minuten Live-Audio gemessen. Eine Sitzung mitzulesen, die jemand anders führt, verbraucht nie dein Kontingent.',
      'Kostenlos — und kostenlos beitreten',
      'Du kannst LingoLive ganz ohne Konto nutzen. Ein Konto erhöht dein Monatskontingent und synchronisiert gespeicherte Transkripte über Geräte. Einer LingoBusiness-Sitzung beizutreten ist immer kostenlos und verlangt nie ein Konto.',
      'Pro, wenn du mehr brauchst',
      'Pro erhöht das Monatskontingent deutlich und hebt die Längenbegrenzung pro Sitzung auf. LingoLive enthält auf keiner Stufe Werbung, und kein Tarif gibt irgendjemandem Zugriff auf deine Transkripte.',
      'Jetzt zuhören',
    ],
  },
});

const security = buildPage({
  path: 'security',
  kind: 'informational',
  ctaPath: 'privacy',
  rows: {
    en: [
      'Security | LingoLive',
      'How LingoLive handles audio, transcripts, credentials and operator access — stated as design properties, not promises.',
      'Security',
      'The claims below describe how the system is built. Where a claim is enforced by code rather than by policy, that is stated, because those are the ones you can actually rely on.',
      'Audio and transcripts',
      'Audio is never written to durable storage anywhere. Saved transcripts and translations are encrypted with AES-256-GCM before they reach the database, under a versioned key so it can be rotated. Transcript text can never reach a log: the logger drops it structurally, and tests assert that.',
      'Credentials and access',
      'Provider API keys exist only on the server; clients receive short-lived, single-purpose credentials. Operators can inspect the running system in full, but reading the content of someone’s transcript requires a separate permission, a written reason, and an audit entry that cannot be deleted.',
      'Read the privacy policy',
    ],
    fr: [
      'Sécurité | LingoLive',
      "Comment LingoLive traite l'audio, les transcriptions, les identifiants et l'accès des opérateurs — énoncé comme des propriétés de conception, pas des promesses.",
      'Sécurité',
      "Les affirmations ci-dessous décrivent la construction du système. Quand une affirmation est garantie par le code plutôt que par une politique, c'est précisé, parce que ce sont celles sur lesquelles on peut réellement compter.",
      'Audio et transcriptions',
      "L'audio n'est jamais écrit dans un stockage durable, nulle part. Les transcriptions et traductions sauvegardées sont chiffrées en AES-256-GCM avant d'atteindre la base, avec une clé versionnée pour permettre la rotation. Le texte d'une transcription ne peut pas atteindre un journal : le logger l'écarte structurellement, et les tests le vérifient.",
      'Identifiants et accès',
      "Les clés d'API des fournisseurs n'existent que sur le serveur ; les clients reçoivent des identifiants temporaires à usage unique. Les opérateurs peuvent inspecter tout le système en fonctionnement, mais lire le contenu de la transcription de quelqu'un exige une permission distincte, un motif écrit, et une entrée d'audit non supprimable.",
      'Lire la politique de confidentialité',
    ],
    ar: [
      'الأمان | LingoLive',
      'كيف يتعامل LingoLive مع الصوت والنصوص وبيانات الاعتماد ووصول المشغّلين — بوصفها خصائص تصميم لا وعودًا.',
      'الأمان',
      'تصف العبارات التالية كيفية بناء النظام. وحين تكون العبارة مضمونة بالشيفرة لا بالسياسة يُذكَر ذلك، لأنها ما يمكن الاعتماد عليه فعلًا.',
      'الصوت والنصوص',
      'لا يُكتب الصوت في أي تخزين دائم في أي مكان. النصوص والترجمات المحفوظة مشفَّرة بـ AES-256-GCM قبل وصولها إلى قاعدة البيانات، بمفتاح مُصدَّر لإتاحة التدوير. ولا يمكن لنص التفريغ أن يصل إلى السجلات: يستبعده نظام التسجيل بنيويًا، والاختبارات تتحقق من ذلك.',
      'بيانات الاعتماد والوصول',
      'مفاتيح واجهات المزوّدين موجودة على الخادم فقط، ويتلقى العملاء بيانات اعتماد قصيرة الأجل ولغرض واحد. يستطيع المشغّلون فحص النظام العامل بالكامل، لكن قراءة محتوى نص أحدهم تتطلب صلاحية منفصلة وسببًا مكتوبًا وسجلّ تدقيق لا يمكن حذفه.',
      'اقرأ سياسة الخصوصية',
    ],
    es: [
      'Seguridad | LingoLive',
      'Cómo trata LingoLive el audio, las transcripciones, las credenciales y el acceso de los operadores: como propiedades de diseño, no como promesas.',
      'Seguridad',
      'Lo siguiente describe cómo está construido el sistema. Cuando una afirmación la garantiza el código y no una política, se indica, porque son esas en las que realmente se puede confiar.',
      'Audio y transcripciones',
      'El audio nunca se escribe en almacenamiento duradero, en ningún sitio. Las transcripciones y traducciones guardadas se cifran con AES-256-GCM antes de llegar a la base de datos, con una clave versionada para poder rotarla. El texto de una transcripción no puede llegar a un registro: el logger lo descarta estructuralmente y los tests lo comprueban.',
      'Credenciales y acceso',
      'Las claves de API de los proveedores existen solo en el servidor; los clientes reciben credenciales de corta duración y un solo propósito. Los operadores pueden inspeccionar todo el sistema en marcha, pero leer el contenido de la transcripción de alguien exige un permiso aparte, un motivo escrito y una entrada de auditoría que no se puede borrar.',
      'Leer la política de privacidad',
    ],
    'pt-BR': [
      'Segurança | LingoLive',
      'Como o LingoLive trata áudio, transcrições, credenciais e acesso de operadores — como propriedades de projeto, não promessas.',
      'Segurança',
      'O que segue descreve como o sistema é construído. Quando uma afirmação é garantida por código e não por política, isso é dito, porque são essas em que realmente dá para confiar.',
      'Áudio e transcrições',
      'O áudio nunca é gravado em armazenamento durável, em lugar nenhum. Transcrições e traduções salvas são cifradas com AES-256-GCM antes de chegarem ao banco, com chave versionada para permitir rotação. O texto de uma transcrição não pode chegar a um log: o logger o descarta estruturalmente, e os testes verificam isso.',
      'Credenciais e acesso',
      'As chaves de API dos provedores existem só no servidor; os clientes recebem credenciais de curta duração e propósito único. Operadores podem inspecionar todo o sistema em execução, mas ler o conteúdo da transcrição de alguém exige uma permissão separada, um motivo escrito e um registro de auditoria que não pode ser apagado.',
      'Ler a política de privacidade',
    ],
    it: [
      'Sicurezza | LingoLive',
      'Come LingoLive tratta audio, trascrizioni, credenziali e accesso degli operatori: come proprietà di progetto, non come promesse.',
      'Sicurezza',
      'Quanto segue descrive come è costruito il sistema. Dove un’affermazione è garantita dal codice e non da una policy, viene indicato, perché sono quelle su cui si può davvero contare.',
      'Audio e trascrizioni',
      'L’audio non viene mai scritto su archiviazione durevole, da nessuna parte. Le trascrizioni e le traduzioni salvate sono cifrate con AES-256-GCM prima di arrivare al database, con una chiave versionata per consentirne la rotazione. Il testo di una trascrizione non può raggiungere un log: il logger lo scarta strutturalmente e i test lo verificano.',
      'Credenziali e accessi',
      'Le chiavi API dei provider esistono solo sul server; i client ricevono credenziali a breve scadenza e a scopo unico. Gli operatori possono ispezionare l’intero sistema in funzione, ma leggere il contenuto della trascrizione di qualcuno richiede un permesso separato, una motivazione scritta e una voce di audit non cancellabile.',
      'Leggi l’informativa sulla privacy',
    ],
    de: [
      'Sicherheit | LingoLive',
      'Wie LingoLive mit Audio, Transkripten, Zugangsdaten und Operator-Zugriff umgeht — als Konstruktionseigenschaften, nicht als Versprechen.',
      'Sicherheit',
      'Das Folgende beschreibt, wie das System gebaut ist. Wo eine Aussage durch Code statt durch Richtlinie durchgesetzt wird, steht das dabei — denn darauf kann man sich tatsächlich verlassen.',
      'Audio und Transkripte',
      'Audio wird nirgendwo in dauerhaften Speicher geschrieben. Gespeicherte Transkripte und Übersetzungen werden mit AES-256-GCM verschlüsselt, bevor sie die Datenbank erreichen, mit versioniertem Schlüssel für Rotation. Transkripttext kann kein Log erreichen: Der Logger verwirft ihn strukturell, und Tests prüfen das.',
      'Zugangsdaten und Zugriff',
      'API-Schlüssel der Anbieter existieren nur auf dem Server; Clients erhalten kurzlebige Berechtigungen für genau einen Zweck. Operatoren können das laufende System vollständig einsehen, aber den Inhalt eines fremden Transkripts zu lesen erfordert eine eigene Berechtigung, eine schriftliche Begründung und einen nicht löschbaren Audit-Eintrag.',
      'Datenschutzerklärung lesen',
    ],
  },
});

const help = buildPage({
  path: 'help',
  kind: 'informational',
  ctaPath: 'listen',
  rows: {
    en: [
      'Help and troubleshooting | LingoLive',
      'What to do when the microphone will not start, the text stops updating, or a session code is refused.',
      'Help',
      'Most problems come down to three things: a permission, a connection, or a session that has already ended. Here is how to tell them apart.',
      'The microphone will not start',
      'Check that the browser has microphone permission for this site, that no other application is holding the microphone, and that the page is served over HTTPS — browsers refuse microphone access on an insecure connection.',
      'The text stopped updating',
      'A weak connection shows "Reconnecting" and resumes from the last line you saw, with nothing missing in between. If it says the session has ended, the organizer closed it or it reached its maximum length.',
      'Contact us',
    ],
    fr: [
      'Aide et dépannage | LingoLive',
      "Que faire quand le micro ne démarre pas, que le texte cesse de se mettre à jour, ou qu'un code de session est refusé.",
      'Aide',
      'La plupart des problèmes se ramènent à trois choses : une permission, une connexion, ou une session déjà terminée. Voici comment les distinguer.',
      'Le microphone ne démarre pas',
      "Vérifiez que le navigateur a l'autorisation du micro pour ce site, qu'aucune autre application ne le retient, et que la page est servie en HTTPS — les navigateurs refusent l'accès au micro sur une connexion non sécurisée.",
      'Le texte ne se met plus à jour',
      "Une connexion faible affiche « Reconnexion » puis reprend à la dernière ligne vue, sans rien perdre entre les deux. Si le message indique que la session est terminée, l'organisateur l'a close ou elle a atteint sa durée maximale.",
      'Nous contacter',
    ],
    ar: [
      'المساعدة وحل المشكلات | LingoLive',
      'ماذا تفعل عندما لا يبدأ الميكروفون، أو يتوقف النص عن التحديث، أو يُرفَض رمز الجلسة.',
      'المساعدة',
      'أغلب المشكلات تعود إلى ثلاثة أمور: إذن، أو اتصال، أو جلسة انتهت بالفعل. وإليك كيف تميّز بينها.',
      'الميكروفون لا يبدأ',
      'تأكد أن المتصفح يملك إذن الميكروفون لهذا الموقع، وأن لا تطبيق آخر يحتجزه، وأن الصفحة تُقدَّم عبر HTTPS — فالمتصفحات ترفض الوصول إلى الميكروفون على اتصال غير آمن.',
      'النص توقف عن التحديث',
      'الاتصال الضعيف يعرض «جارٍ إعادة الاتصال» ثم يستأنف من آخر سطر رأيته دون ضياع شيء بينهما. وإذا ظهر أن الجلسة انتهت فقد أغلقها المنظّم أو بلغت مدتها القصوى.',
      'تواصل معنا',
    ],
    es: [
      'Ayuda y solución de problemas | LingoLive',
      'Qué hacer cuando el micrófono no arranca, el texto deja de actualizarse o se rechaza un código de sesión.',
      'Ayuda',
      'Casi todos los problemas se reducen a tres cosas: un permiso, una conexión o una sesión que ya terminó. Así se distinguen.',
      'El micrófono no arranca',
      'Comprueba que el navegador tenga permiso de micrófono para este sitio, que ninguna otra aplicación lo esté ocupando y que la página se sirva por HTTPS: los navegadores rechazan el acceso al micrófono en una conexión no segura.',
      'El texto dejó de actualizarse',
      'Una conexión débil muestra «Reconectando» y retoma desde la última línea que viste, sin perder nada por el camino. Si dice que la sesión ha terminado, la cerró la organización o alcanzó su duración máxima.',
      'Contactar',
    ],
    'pt-BR': [
      'Ajuda e solução de problemas | LingoLive',
      'O que fazer quando o microfone não inicia, o texto para de atualizar ou um código de sessão é recusado.',
      'Ajuda',
      'A maioria dos problemas se resume a três coisas: uma permissão, uma conexão ou uma sessão que já terminou. Veja como diferenciar.',
      'O microfone não inicia',
      'Verifique se o navegador tem permissão de microfone para este site, se nenhum outro aplicativo está segurando o microfone e se a página é servida por HTTPS — navegadores recusam acesso ao microfone em conexão insegura.',
      'O texto parou de atualizar',
      'Uma conexão fraca mostra “Reconectando” e retoma da última linha que você viu, sem perder nada no meio. Se disser que a sessão terminou, a organização encerrou ou ela atingiu a duração máxima.',
      'Fale conosco',
    ],
    it: [
      'Aiuto e risoluzione dei problemi | LingoLive',
      'Cosa fare quando il microfono non parte, il testo smette di aggiornarsi o un codice di sessione viene rifiutato.',
      'Aiuto',
      'Quasi tutti i problemi si riducono a tre cose: un permesso, una connessione o una sessione già terminata. Ecco come distinguerle.',
      'Il microfono non parte',
      'Controlla che il browser abbia il permesso del microfono per questo sito, che nessun’altra applicazione lo stia occupando e che la pagina sia servita in HTTPS: i browser rifiutano l’accesso al microfono su una connessione non sicura.',
      'Il testo ha smesso di aggiornarsi',
      'Una connessione debole mostra «Riconnessione» e riparte dall’ultima riga che hai visto, senza perdere nulla in mezzo. Se dice che la sessione è terminata, l’organizzatore l’ha chiusa oppure ha raggiunto la durata massima.',
      'Contattaci',
    ],
    de: [
      'Hilfe und Fehlerbehebung | LingoLive',
      'Was tun, wenn das Mikrofon nicht startet, der Text nicht mehr aktualisiert oder ein Sitzungscode abgelehnt wird.',
      'Hilfe',
      'Die meisten Probleme laufen auf drei Dinge hinaus: eine Berechtigung, eine Verbindung oder eine bereits beendete Sitzung. So unterscheidest du sie.',
      'Das Mikrofon startet nicht',
      'Prüfe, ob der Browser Mikrofonzugriff für diese Seite hat, ob eine andere Anwendung das Mikrofon belegt, und ob die Seite über HTTPS ausgeliefert wird — Browser verweigern Mikrofonzugriff auf unsicherer Verbindung.',
      'Der Text aktualisiert nicht mehr',
      'Eine schwache Verbindung zeigt „Neu verbinden“ und setzt bei der letzten gesehenen Zeile fort, ohne dass dazwischen etwas fehlt. Steht dort, die Sitzung sei beendet, hat die Veranstaltung sie geschlossen oder sie hat ihre Höchstdauer erreicht.',
      'Kontakt',
    ],
  },
});

export const INFORMATIONAL_PAGES: readonly MarketingPage[] = [howItWorks, pricing, security, help];
