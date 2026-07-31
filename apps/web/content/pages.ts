import type { MarketingPage } from './types';

/**
 * The public marketing corpus.
 *
 * Rules applied to every entry:
 *  - one unique title and description per page *and* per locale;
 *  - no invented statistics, no testimonials, no partner logos;
 *  - never described as a substitute for a certified human interpreter;
 *  - FAQ structured data is emitted only where a FAQ is actually rendered.
 */

export const MARKETING_PAGES: readonly MarketingPage[] = [
  // -------------------------------------------------------------------------
  {
    path: '',
    kind: 'home',
    ctaPath: 'listen',
    copy: {
      en: {
        title: 'LingoLive — Live Translation and Captions',
        description:
          'Turn speech into readable text and translate it instantly. Works in a meeting, a lecture hall, a taxi or a waiting room — in your browser, with no installation.',
        h1: 'Understand every conversation, live.',
        intro:
          'LingoLive listens to what is being said around you, writes it out as it happens, and can translate it into the language you read. Three things to choose from, and nothing else to configure.',
        sections: [
          {
            heading: 'Listen',
            body: 'Put your phone on the table and read along. A conference talk, a lecture, a team meeting, a conversation in a noisy bar — one mode covers all of it, with no template to pick first.',
          },
          {
            heading: 'Discuss',
            body: 'Two to four people, one device. Each person gets a panel turned toward them, in their own language, with their own microphone button. Speak once; everyone reads it in their language.',
          },
          {
            heading: 'Join',
            body: 'Scan a code, choose a language, start reading. No account, no download — the link opens straight in the browser if the app is not installed.',
          },
        ],
        ctaLabel: 'Start listening',
      },
      fr: {
        title: 'LingoLive — Traduction et sous-titres en direct',
        description:
          "Transformez la parole en texte lisible et traduisez-la instantanément. En réunion, en amphi, en taxi ou en salle d'attente — dans votre navigateur, sans installation.",
        h1: 'Comprenez toutes les conversations, en direct.',
        intro:
          "LingoLive écoute ce qui se dit autour de vous, l'écrit au fur et à mesure, et peut le traduire dans la langue que vous lisez. Trois choix, et rien d'autre à configurer.",
        sections: [
          {
            heading: 'Écouter',
            body: "Posez votre téléphone sur la table et lisez. Une conférence, un cours, une réunion d'équipe, une conversation dans un bar bruyant — un seul mode couvre tout, sans template à choisir avant de commencer.",
          },
          {
            heading: 'Discuter',
            body: 'De deux à quatre personnes, un seul appareil. Chacun a sa case orientée vers lui, dans sa langue, avec son propre bouton micro. On parle une fois ; chacun lit dans sa langue.',
          },
          {
            heading: 'Rejoindre',
            body: "Scannez un code, choisissez une langue, lisez. Sans compte, sans téléchargement — le lien s'ouvre directement dans le navigateur si l'application n'est pas installée.",
          },
        ],
        ctaLabel: 'Commencer à écouter',
      },
      ar: {
        title: 'LingoLive — ترجمة ونصوص مباشرة',
        description:
          'حوّل الكلام إلى نص مقروء وترجمه فورًا. في اجتماع أو قاعة محاضرات أو سيارة أجرة أو غرفة انتظار — في متصفحك ودون تثبيت.',
        h1: 'افهم كل المحادثات، مباشرةً.',
        intro:
          'يستمع LingoLive إلى ما يُقال حولك، ويكتبه لحظة بلحظة، ويمكنه ترجمته إلى اللغة التي تقرأ بها. ثلاثة خيارات فقط، ولا شيء آخر لضبطه.',
        sections: [
          {
            heading: 'استمع',
            body: 'ضع هاتفك على الطاولة واقرأ. محاضرة أو درس أو اجتماع فريق أو حديث في مكان صاخب — وضع واحد يغطي ذلك كله، دون قوالب تختارها أولًا.',
          },
          {
            heading: 'تحدّث',
            body: 'من شخصين إلى أربعة، وجهاز واحد. لكل شخص بطاقة موجّهة نحوه بلغته وبزر ميكروفون خاص به. تتحدث مرة واحدة، ويقرأ الجميع بلغتهم.',
          },
          {
            heading: 'انضم',
            body: 'امسح رمزًا، اختر لغة، وابدأ القراءة. دون حساب ودون تنزيل — يفتح الرابط في المتصفح مباشرة إن لم يكن التطبيق مثبتًا.',
          },
        ],
        ctaLabel: 'ابدأ الاستماع',
      },
      es: {
        title: 'LingoLive — Traducción y subtítulos en directo',
        description:
          'Convierte el habla en texto legible y tradúcelo al instante. En una reunión, un aula, un taxi o una sala de espera: en tu navegador y sin instalar nada.',
        h1: 'Entiende todas las conversaciones, en directo.',
        intro:
          'LingoLive escucha lo que se dice a tu alrededor, lo escribe a medida que ocurre y puede traducirlo al idioma en el que lees. Tres opciones y nada más que configurar.',
        sections: [
          {
            heading: 'Escuchar',
            body: 'Deja el móvil sobre la mesa y lee. Una ponencia, una clase, una reunión de equipo, una conversación en un bar con ruido: un solo modo lo cubre todo, sin plantillas que elegir antes.',
          },
          {
            heading: 'Conversar',
            body: 'De dos a cuatro personas y un solo dispositivo. Cada una tiene su panel orientado hacia ella, en su idioma y con su propio botón de micrófono. Hablas una vez; cada cual lo lee en su idioma.',
          },
          {
            heading: 'Unirse',
            body: 'Escanea un código, elige idioma y empieza a leer. Sin cuenta y sin descargas: el enlace se abre directamente en el navegador si la app no está instalada.',
          },
        ],
        ctaLabel: 'Empezar a escuchar',
      },
      'pt-BR': {
        title: 'LingoLive — Tradução e legendas ao vivo',
        description:
          'Transforme a fala em texto legível e traduza na hora. Em uma reunião, um auditório, um táxi ou uma sala de espera — no seu navegador e sem instalar nada.',
        h1: 'Entenda todas as conversas, ao vivo.',
        intro:
          'O LingoLive ouve o que está sendo dito ao seu redor, escreve enquanto acontece e pode traduzir para o idioma em que você lê. Três opções e mais nada para configurar.',
        sections: [
          {
            heading: 'Ouvir',
            body: 'Deixe o celular sobre a mesa e acompanhe. Uma palestra, uma aula, uma reunião de equipe, uma conversa em um bar barulhento — um único modo cobre tudo, sem modelo para escolher antes.',
          },
          {
            heading: 'Conversar',
            body: 'De duas a quatro pessoas, um só aparelho. Cada uma tem seu painel voltado para si, no seu idioma e com seu próprio botão de microfone. Você fala uma vez; cada pessoa lê no idioma dela.',
          },
          {
            heading: 'Entrar',
            body: 'Escaneie um código, escolha um idioma e comece a ler. Sem conta e sem download — o link abre direto no navegador se o app não estiver instalado.',
          },
        ],
        ctaLabel: 'Começar a ouvir',
      },
      it: {
        title: 'LingoLive — Traduzione e sottotitoli in diretta',
        description:
          'Trasforma il parlato in testo leggibile e traducilo all’istante. In riunione, in aula, in taxi o in sala d’attesa: nel tuo browser e senza installare nulla.',
        h1: 'Capisci ogni conversazione, in diretta.',
        intro:
          'LingoLive ascolta ciò che viene detto intorno a te, lo scrive mentre accade e può tradurlo nella lingua in cui leggi. Tre scelte e nient’altro da configurare.',
        sections: [
          {
            heading: 'Ascolta',
            body: 'Appoggia il telefono sul tavolo e leggi. Una conferenza, una lezione, una riunione di lavoro, una conversazione in un bar rumoroso: un solo modo copre tutto, senza modelli da scegliere prima.',
          },
          {
            heading: 'Parla',
            body: 'Da due a quattro persone, un solo dispositivo. Ognuno ha il proprio riquadro rivolto verso di sé, nella propria lingua e con il proprio pulsante microfono. Parli una volta; ciascuno legge nella sua lingua.',
          },
          {
            heading: 'Entra',
            body: 'Scansiona un codice, scegli una lingua e inizia a leggere. Senza account e senza download: il link si apre direttamente nel browser se l’app non è installata.',
          },
        ],
        ctaLabel: 'Inizia ad ascoltare',
      },
      de: {
        title: 'LingoLive — Live-Übersetzung und Untertitel',
        description:
          'Verwandle Sprache in lesbaren Text und übersetze sie sofort. Im Meeting, im Hörsaal, im Taxi oder im Wartezimmer — im Browser und ohne Installation.',
        h1: 'Verstehe jedes Gespräch, live.',
        intro:
          'LingoLive hört zu, was um dich herum gesagt wird, schreibt es mit und kann es in deine Lesesprache übersetzen. Drei Auswahlmöglichkeiten, sonst nichts einzustellen.',
        sections: [
          {
            heading: 'Zuhören',
            body: 'Leg dein Handy auf den Tisch und lies mit. Ein Vortrag, eine Vorlesung, ein Teammeeting, ein Gespräch in einer lauten Bar — ein Modus deckt alles ab, ohne vorher eine Vorlage zu wählen.',
          },
          {
            heading: 'Sprechen',
            body: 'Zwei bis vier Personen, ein Gerät. Jede Person hat eine eigene, ihr zugewandte Kachel in ihrer Sprache mit eigener Mikrofontaste. Einmal sprechen — alle lesen es in ihrer Sprache.',
          },
          {
            heading: 'Beitreten',
            body: 'Code scannen, Sprache wählen, mitlesen. Ohne Konto, ohne Download — der Link öffnet direkt im Browser, wenn die App nicht installiert ist.',
          },
        ],
        ctaLabel: 'Jetzt zuhören',
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    path: 'live-transcription',
    kind: 'use-case',
    ctaPath: 'listen',
    copy: {
      en: {
        title: 'Live transcription in your browser | LingoLive',
        description:
          'Read what is being said as it is said. Live speech-to-text with large, high-contrast captions — no recording kept, no installation required.',
        h1: 'Live transcription, as it happens',
        intro:
          'LingoLive writes down speech while it is still being spoken. Words appear within a second, then settle into punctuated sentences you can read comfortably from across a table.',
        sections: [
          {
            heading: 'Partial text, then final text',
            body: 'Words appear the moment they are recognised, in a lighter shade. When the sentence is complete it settles into full contrast with punctuation. You always see something, and you always know what is still provisional.',
          },
          {
            heading: 'Built for a real room',
            body: 'Text size scales with a pinch, the screen stays awake for the whole session, and scrolling stops chasing you the moment you scroll back — with one button to return to the live edge.',
          },
          {
            heading: 'Nothing recorded',
            body: 'Audio is never stored, and a transcript is kept only if you press Save. Close the session without saving and there is nothing left to delete.',
          },
        ],
        ctaLabel: 'Start listening',
      },
      fr: {
        title: 'Transcription en direct dans votre navigateur | LingoLive',
        description:
          'Lisez ce qui se dit, pendant que ça se dit. Transcription vocale en direct, en grand et en fort contraste — aucun enregistrement conservé, aucune installation.',
        h1: 'La transcription en direct, au fil de la parole',
        intro:
          "LingoLive écrit la parole pendant qu'elle est prononcée. Les mots apparaissent en moins d'une seconde, puis se figent en phrases ponctuées, lisibles de l'autre côté d'une table.",
        sections: [
          {
            heading: 'Texte partiel, puis texte définitif',
            body: "Les mots apparaissent dès qu'ils sont reconnus, dans une teinte plus claire. Quand la phrase est complète, elle passe en contraste normal avec sa ponctuation. Vous voyez toujours quelque chose, et vous savez toujours ce qui est encore provisoire.",
          },
          {
            heading: 'Pensé pour une vraie salle',
            body: "La taille du texte s'ajuste au pincement, l'écran reste allumé pendant toute la session, et le défilement cesse de vous poursuivre dès que vous remontez — avec un bouton pour revenir au direct.",
          },
          {
            heading: 'Rien n’est enregistré',
            body: "L'audio n'est jamais conservé, et une transcription n'est gardée que si vous appuyez sur Sauvegarder. Fermez sans sauvegarder et il ne reste rien à supprimer.",
          },
        ],
        ctaLabel: 'Commencer à écouter',
      },
      ar: {
        title: 'تفريغ نصي مباشر في متصفحك | LingoLive',
        description:
          'اقرأ ما يُقال أثناء قوله. تحويل الكلام إلى نص مباشرةً بخط كبير وتباين عالٍ — دون حفظ أي تسجيل ودون تثبيت.',
        h1: 'تفريغ نصي مباشر، لحظة بلحظة',
        intro:
          'يكتب LingoLive الكلام أثناء نطقه. تظهر الكلمات خلال أقل من ثانية ثم تستقر في جمل مرقّمة العلامات يمكن قراءتها من الجهة الأخرى للطاولة.',
        sections: [
          {
            heading: 'نص مؤقت ثم نص نهائي',
            body: 'تظهر الكلمات فور التعرّف عليها بلون أفتح. وعندما تكتمل الجملة تنتقل إلى التباين الكامل مع علامات الترقيم. ترى دائمًا شيئًا، وتعرف دائمًا ما هو مؤقت.',
          },
          {
            heading: 'مصمَّم لقاعة حقيقية',
            body: 'يتغيّر حجم النص بالقرص، وتبقى الشاشة مضاءة طوال الجلسة، ويتوقف التمرير عن ملاحقتك بمجرد أن تعود للأعلى — مع زر واحد للعودة إلى المباشر.',
          },
          {
            heading: 'لا شيء يُسجَّل',
            body: 'لا يُخزَّن الصوت أبدًا، ولا يُحفَظ النص إلا إذا ضغطت على «حفظ». أغلق الجلسة دون حفظ ولن يبقى شيء لحذفه.',
          },
        ],
        ctaLabel: 'ابدأ الاستماع',
      },
      es: {
        title: 'Transcripción en directo en tu navegador | LingoLive',
        description:
          'Lee lo que se dice mientras se dice. Voz a texto en directo, con letra grande y alto contraste: sin grabaciones guardadas y sin instalar nada.',
        h1: 'Transcripción en directo, al ritmo del habla',
        intro:
          'LingoLive escribe el habla mientras se pronuncia. Las palabras aparecen en menos de un segundo y luego se fijan en frases con puntuación, legibles desde el otro lado de una mesa.',
        sections: [
          {
            heading: 'Texto provisional y texto definitivo',
            body: 'Las palabras aparecen en cuanto se reconocen, en un tono más claro. Cuando la frase está completa, pasa a contraste normal con su puntuación. Siempre ves algo y siempre sabes qué es provisional.',
          },
          {
            heading: 'Pensado para una sala real',
            body: 'El tamaño del texto se ajusta pellizcando, la pantalla no se apaga durante la sesión y el desplazamiento deja de perseguirte en cuanto subes, con un botón para volver al directo.',
          },
          {
            heading: 'No se graba nada',
            body: 'El audio nunca se almacena y la transcripción solo se conserva si pulsas Guardar. Cierra sin guardar y no queda nada que borrar.',
          },
        ],
        ctaLabel: 'Empezar a escuchar',
      },
      'pt-BR': {
        title: 'Transcrição ao vivo no seu navegador | LingoLive',
        description:
          'Leia o que está sendo dito enquanto é dito. Voz para texto ao vivo, com letra grande e alto contraste: sem gravações guardadas e sem instalar nada.',
        h1: 'Transcrição ao vivo, no ritmo da fala',
        intro:
          'O LingoLive escreve a fala enquanto ela acontece. As palavras aparecem em menos de um segundo e depois se fixam em frases pontuadas, legíveis do outro lado de uma mesa.',
        sections: [
          {
            heading: 'Texto provisório e texto final',
            body: 'As palavras aparecem assim que são reconhecidas, num tom mais claro. Quando a frase termina, ela passa para o contraste normal com pontuação. Você sempre vê algo e sempre sabe o que ainda é provisório.',
          },
          {
            heading: 'Feito para uma sala de verdade',
            body: 'O tamanho do texto muda com um pinçar, a tela fica acesa durante toda a sessão e a rolagem para de perseguir você assim que volta para cima — com um botão para retornar ao ao vivo.',
          },
          {
            heading: 'Nada é gravado',
            body: 'O áudio nunca é armazenado e a transcrição só fica guardada se você tocar em Salvar. Feche sem salvar e não sobra nada para excluir.',
          },
        ],
        ctaLabel: 'Começar a ouvir',
      },
      it: {
        title: 'Trascrizione in diretta nel browser | LingoLive',
        description:
          'Leggi ciò che viene detto mentre viene detto. Voce-testo in diretta, con caratteri grandi e alto contrasto: nessuna registrazione conservata, nessuna installazione.',
        h1: 'Trascrizione in diretta, al ritmo del parlato',
        intro:
          'LingoLive scrive il parlato mentre viene pronunciato. Le parole compaiono in meno di un secondo e poi si fissano in frasi punteggiate, leggibili dall’altro lato di un tavolo.',
        sections: [
          {
            heading: 'Testo provvisorio, poi definitivo',
            body: 'Le parole compaiono appena riconosciute, in una tonalità più chiara. Quando la frase è completa passa al contrasto pieno con la punteggiatura. Vedi sempre qualcosa e sai sempre cosa è ancora provvisorio.',
          },
          {
            heading: 'Pensato per una sala vera',
            body: 'La dimensione del testo si regola con un pizzico, lo schermo resta acceso per tutta la sessione e lo scorrimento smette di inseguirti appena risali, con un pulsante per tornare alla diretta.',
          },
          {
            heading: 'Niente viene registrato',
            body: 'L’audio non viene mai conservato e la trascrizione resta solo se premi Salva. Chiudi senza salvare e non rimane nulla da cancellare.',
          },
        ],
        ctaLabel: 'Inizia ad ascoltare',
      },
      de: {
        title: 'Live-Transkription im Browser | LingoLive',
        description:
          'Lies mit, während gesprochen wird. Live-Spracherkennung mit großer, kontrastreicher Schrift — nichts wird aufgezeichnet, nichts muss installiert werden.',
        h1: 'Live-Transkription, im Takt des Gesprochenen',
        intro:
          'LingoLive schreibt Sprache mit, während sie gesprochen wird. Wörter erscheinen in unter einer Sekunde und setzen sich dann zu Sätzen mit Satzzeichen, lesbar quer über den Tisch.',
        sections: [
          {
            heading: 'Erst vorläufig, dann endgültig',
            body: 'Wörter erscheinen sofort nach der Erkennung in helleren Ton. Ist der Satz fertig, wechselt er in vollen Kontrast samt Satzzeichen. Du siehst immer etwas und weißt immer, was noch vorläufig ist.',
          },
          {
            heading: 'Für echte Räume gebaut',
            body: 'Die Schriftgröße folgt einer Pinch-Geste, der Bildschirm bleibt die ganze Sitzung an, und das Scrollen hört auf, dich zu verfolgen, sobald du zurückscrollst — mit einer Taste zurück zum Live-Text.',
          },
          {
            heading: 'Nichts wird aufgezeichnet',
            body: 'Audio wird nie gespeichert, und ein Transkript bleibt nur, wenn du auf Speichern tippst. Schließ die Sitzung ohne Speichern, und es bleibt nichts zu löschen.',
          },
        ],
        ctaLabel: 'Jetzt zuhören',
      },
    },
  },

  // -------------------------------------------------------------------------
  {
    path: 'live-translation',
    kind: 'use-case',
    ctaPath: 'listen',
    copy: {
      en: {
        title: 'Live translation while someone speaks | LingoLive',
        description:
          'Read a speaker in your own language while they talk. LingoLive transcribes once and translates into every language the room needs.',
        h1: 'Live translation, in the language you read',
        intro:
          'Pick the language you want to read in. LingoLive detects what is being spoken and shows you the translation as sentences complete, with the original always kept intact underneath.',
        sections: [
          {
            heading: 'The original is never overwritten',
            body: 'A translation is added alongside the speaker’s own words, never in place of them. Switch back to “Original text” at any moment and the full source is still there.',
          },
          {
            heading: 'Stable, not flickering',
            body: 'Translating every half-word would make the screen twitch. LingoLive waits for a phrase to settle, shows a provisional version, then replaces it cleanly when the sentence is final.',
          },
          {
            heading: 'Honest about its limits',
            body: 'Machine translation gets names, numbers and units right far more often than it gets nuance right. LingoLive is an assistive tool — it is not a substitute for a certified human interpreter.',
          },
        ],
        ctaLabel: 'Try it now',
      },
      fr: {
        title: "Traduction en direct pendant qu'on parle | LingoLive",
        description:
          "Lisez un intervenant dans votre langue pendant qu'il parle. LingoLive transcrit une fois et traduit dans toutes les langues dont la salle a besoin.",
        h1: 'La traduction en direct, dans la langue que vous lisez',
        intro:
          "Choisissez la langue dans laquelle vous voulez lire. LingoLive détecte la langue parlée et affiche la traduction à mesure que les phrases se terminent, en conservant toujours l'original en dessous.",
        sections: [
          {
            heading: "L'original n'est jamais écrasé",
            body: "Une traduction s'ajoute à côté des mots de l'intervenant, jamais à leur place. Revenez à « Texte original » à tout moment : la source complète est toujours là.",
          },
          {
            heading: 'Stable, sans clignotement',
            body: "Traduire chaque demi-mot ferait sursauter l'écran. LingoLive attend qu'une portion se stabilise, affiche une version provisoire, puis la remplace proprement quand la phrase est définitive.",
          },
          {
            heading: 'Honnête sur ses limites',
            body: "La traduction automatique respecte les noms, les nombres et les unités bien plus souvent qu'elle ne restitue les nuances. LingoLive est un outil d'assistance : il ne remplace pas un interprète humain certifié.",
          },
        ],
        ctaLabel: 'Essayer maintenant',
      },
      ar: {
        title: 'ترجمة مباشرة أثناء الحديث | LingoLive',
        description:
          'اقرأ المتحدث بلغتك أثناء كلامه. يفرّغ LingoLive مرة واحدة ويترجم إلى كل اللغات التي تحتاجها القاعة.',
        h1: 'ترجمة مباشرة، باللغة التي تقرأ بها',
        intro:
          'اختر اللغة التي تريد القراءة بها. يرصد LingoLive اللغة المنطوقة ويعرض الترجمة كلما اكتملت الجملة، مع إبقاء النص الأصلي كما هو تحتها.',
        sections: [
          {
            heading: 'النص الأصلي لا يُستبدل أبدًا',
            body: 'تُضاف الترجمة إلى جانب كلمات المتحدث، لا مكانها. يمكنك العودة إلى «النص الأصلي» في أي لحظة وستجد المصدر كاملًا.',
          },
          {
            heading: 'ثابتة بلا وميض',
            body: 'ترجمة كل نصف كلمة تجعل الشاشة ترتجف. ينتظر LingoLive استقرار الجزء، ويعرض نسخة مؤقتة، ثم يستبدلها بنظافة عندما تصبح الجملة نهائية.',
          },
          {
            heading: 'صريح بشأن حدوده',
            body: 'تحافظ الترجمة الآلية على الأسماء والأرقام والوحدات أكثر بكثير مما تنقل الفروق الدقيقة. LingoLive أداة مساعدة ولا يغني عن مترجم فوري بشري معتمد.',
          },
        ],
        ctaLabel: 'جرّبه الآن',
      },
      es: {
        title: 'Traducción en directo mientras alguien habla | LingoLive',
        description:
          'Lee a quien habla en tu idioma mientras habla. LingoLive transcribe una vez y traduce a todos los idiomas que la sala necesita.',
        h1: 'Traducción en directo, en el idioma en el que lees',
        intro:
          'Elige el idioma en el que quieres leer. LingoLive detecta lo que se habla y muestra la traducción a medida que las frases se completan, manteniendo siempre el original debajo.',
        sections: [
          {
            heading: 'El original nunca se sobrescribe',
            body: 'La traducción se añade junto a las palabras de quien habla, nunca en su lugar. Vuelve a «Texto original» cuando quieras: la fuente completa sigue ahí.',
          },
          {
            heading: 'Estable, sin parpadeos',
            body: 'Traducir cada media palabra haría temblar la pantalla. LingoLive espera a que una parte se estabilice, muestra una versión provisional y la sustituye limpiamente cuando la frase es definitiva.',
          },
          {
            heading: 'Honesto sobre sus límites',
            body: 'La traducción automática acierta con nombres, cifras y unidades mucho más que con los matices. LingoLive es una herramienta de apoyo: no sustituye a un intérprete humano certificado.',
          },
        ],
        ctaLabel: 'Probar ahora',
      },
      'pt-BR': {
        title: 'Tradução ao vivo enquanto alguém fala | LingoLive',
        description:
          'Leia quem fala no seu idioma enquanto a pessoa fala. O LingoLive transcreve uma vez e traduz para todos os idiomas de que a sala precisa.',
        h1: 'Tradução ao vivo, no idioma em que você lê',
        intro:
          'Escolha o idioma em que quer ler. O LingoLive detecta o que está sendo falado e mostra a tradução conforme as frases se completam, sempre mantendo o original abaixo.',
        sections: [
          {
            heading: 'O original nunca é sobrescrito',
            body: 'A tradução é acrescentada ao lado das palavras de quem fala, nunca no lugar delas. Volte para “Texto original” quando quiser: a fonte completa continua lá.',
          },
          {
            heading: 'Estável, sem piscar',
            body: 'Traduzir cada meia palavra faria a tela tremer. O LingoLive espera o trecho estabilizar, mostra uma versão provisória e a substitui com limpeza quando a frase é final.',
          },
          {
            heading: 'Honesto sobre seus limites',
            body: 'A tradução automática acerta nomes, números e unidades muito mais do que nuances. O LingoLive é uma ferramenta de apoio: não substitui um intérprete humano certificado.',
          },
        ],
        ctaLabel: 'Experimentar agora',
      },
      it: {
        title: 'Traduzione in diretta mentre si parla | LingoLive',
        description:
          'Leggi chi parla nella tua lingua mentre parla. LingoLive trascrive una volta e traduce in tutte le lingue di cui la sala ha bisogno.',
        h1: 'Traduzione in diretta, nella lingua in cui leggi',
        intro:
          'Scegli la lingua in cui vuoi leggere. LingoLive rileva ciò che viene parlato e mostra la traduzione man mano che le frasi si completano, mantenendo sempre l’originale sotto.',
        sections: [
          {
            heading: 'L’originale non viene mai sovrascritto',
            body: 'La traduzione si aggiunge accanto alle parole di chi parla, mai al loro posto. Torna a «Testo originale» quando vuoi: la fonte completa è ancora lì.',
          },
          {
            heading: 'Stabile, senza sfarfallio',
            body: 'Tradurre ogni mezza parola farebbe sobbalzare lo schermo. LingoLive aspetta che una porzione si stabilizzi, mostra una versione provvisoria e la sostituisce con pulizia quando la frase è definitiva.',
          },
          {
            heading: 'Onesto sui propri limiti',
            body: 'La traduzione automatica rispetta nomi, numeri e unità molto più di quanto restituisca le sfumature. LingoLive è uno strumento di supporto: non sostituisce un interprete umano certificato.',
          },
        ],
        ctaLabel: 'Prova ora',
      },
      de: {
        title: 'Live-Übersetzung während des Sprechens | LingoLive',
        description:
          'Lies eine sprechende Person in deiner Sprache, während sie spricht. LingoLive transkribiert einmal und übersetzt in jede Sprache, die der Raum braucht.',
        h1: 'Live-Übersetzung in deiner Lesesprache',
        intro:
          'Wähle die Sprache, in der du lesen willst. LingoLive erkennt, was gesprochen wird, und zeigt die Übersetzung, sobald Sätze fertig sind — das Original bleibt darunter immer erhalten.',
        sections: [
          {
            heading: 'Das Original wird nie überschrieben',
            body: 'Eine Übersetzung tritt neben die Worte der sprechenden Person, nie an ihre Stelle. Wechsle jederzeit zurück auf „Originaltext“ — die vollständige Quelle ist noch da.',
          },
          {
            heading: 'Stabil statt flackernd',
            body: 'Jedes halbe Wort zu übersetzen ließe den Bildschirm zucken. LingoLive wartet, bis sich ein Abschnitt setzt, zeigt eine vorläufige Fassung und ersetzt sie sauber, sobald der Satz endgültig ist.',
          },
          {
            heading: 'Ehrlich über seine Grenzen',
            body: 'Maschinelle Übersetzung trifft Namen, Zahlen und Einheiten deutlich häufiger als Nuancen. LingoLive ist ein Hilfsmittel — kein Ersatz für zertifizierte menschliche Dolmetschung.',
          },
        ],
        ctaLabel: 'Jetzt ausprobieren',
      },
    },
  },
];
