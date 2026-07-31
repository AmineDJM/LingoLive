import { buildPage } from './build-page';
import type { MarketingPage } from './types';

/**
 * Legal pages.
 *
 * These are **templates that must be reviewed by counsel before launch**, and
 * the pages say so on their face. Two deliberate choices:
 *
 *  1. The summary a visitor reads first is short, concrete and translated into
 *     all seven locales, because that is the part people actually read.
 *  2. The full legal text lives in `docs/legal/` in English and is linked, not
 *     machine-translated into six other languages — mistranslated legal terms
 *     are worse than an untranslated document, and a real launch needs a
 *     jurisdiction-by-jurisdiction review anyway.
 */

const privacy = buildPage({
  path: 'privacy',
  kind: 'legal',
  ctaPath: 'security',
  rows: {
    en: [
      'Privacy policy | LingoLive',
      'What LingoLive collects, what it never collects, how long anything is kept, and how to delete all of it.',
      'Privacy policy',
      'Template pending legal review. The summary below describes what the software actually does today; the full policy must be reviewed by counsel for each jurisdiction before launch.',
      'What we never keep',
      'Audio: never stored, anywhere, at any point. Partial (not yet final) transcript text: held in memory only. Transcript content in logs or analytics: structurally impossible — the fields do not exist.',
      'What we keep, and for how long',
      'A transcript is kept only if you press Save, and until you delete it. An unsaved session is deleted within an hour of ending. Technical logs are kept for a limited, configurable period. You can delete your account and everything in it from inside the app.',
      'Read about security',
    ],
    fr: [
      'Politique de confidentialité | LingoLive',
      "Ce que LingoLive collecte, ce qu'il ne collecte jamais, combien de temps les données sont conservées, et comment tout supprimer.",
      'Politique de confidentialité',
      "Modèle en attente de validation juridique. Le résumé ci-dessous décrit ce que le logiciel fait réellement aujourd'hui ; la politique complète doit être revue par un juriste pour chaque juridiction avant le lancement.",
      'Ce que nous ne conservons jamais',
      "L'audio : jamais stocké, nulle part, à aucun moment. Le texte partiel (pas encore définitif) : en mémoire uniquement. Le contenu des transcriptions dans les journaux ou les analytics : structurellement impossible — les champs n'existent pas.",
      'Ce que nous conservons, et combien de temps',
      "Une transcription n'est conservée que si vous appuyez sur Sauvegarder, et jusqu'à ce que vous la supprimiez. Une session non sauvegardée est supprimée dans l'heure qui suit sa fin. Les journaux techniques sont conservés pendant une durée limitée et configurable. Vous pouvez supprimer votre compte et tout son contenu depuis l'application.",
      'En savoir plus sur la sécurité',
    ],
    ar: [
      'سياسة الخصوصية | LingoLive',
      'ما يجمعه LingoLive وما لا يجمعه أبدًا، ومدة الاحتفاظ بأي بيانات، وكيفية حذف كل شيء.',
      'سياسة الخصوصية',
      'نموذج بانتظار المراجعة القانونية. يصف الملخص أدناه ما يفعله البرنامج فعليًا اليوم؛ ويجب أن يراجع مستشار قانوني السياسة الكاملة لكل ولاية قضائية قبل الإطلاق.',
      'ما لا نحتفظ به أبدًا',
      'الصوت: لا يُخزَّن أبدًا في أي مكان وفي أي لحظة. النص المؤقت (غير النهائي): في الذاكرة فقط. محتوى النصوص في السجلات أو التحليلات: مستحيل بنيويًا — الحقول غير موجودة أصلًا.',
      'ما نحتفظ به ومدته',
      'لا يُحفَظ النص إلا إذا ضغطت على «حفظ»، ويبقى حتى تحذفه. تُحذف الجلسة غير المحفوظة خلال ساعة من انتهائها. تُحفظ السجلات التقنية لمدة محدودة وقابلة للضبط. ويمكنك حذف حسابك وكل ما فيه من داخل التطبيق.',
      'اقرأ عن الأمان',
    ],
    es: [
      'Política de privacidad | LingoLive',
      'Qué recoge LingoLive, qué no recoge nunca, cuánto tiempo se conserva algo y cómo borrarlo todo.',
      'Política de privacidad',
      'Plantilla pendiente de revisión legal. El resumen siguiente describe lo que el software hace hoy realmente; la política completa debe revisarla un abogado para cada jurisdicción antes del lanzamiento.',
      'Lo que nunca conservamos',
      'Audio: nunca se almacena, en ningún sitio ni en ningún momento. Texto parcial (aún no definitivo): solo en memoria. Contenido de transcripciones en registros o analítica: estructuralmente imposible, los campos no existen.',
      'Lo que conservamos y durante cuánto tiempo',
      'Una transcripción se conserva solo si pulsas Guardar, y hasta que la borres. Una sesión sin guardar se elimina en la hora siguiente a su fin. Los registros técnicos se guardan un periodo limitado y configurable. Puedes borrar tu cuenta y todo su contenido desde la propia app.',
      'Leer sobre seguridad',
    ],
    'pt-BR': [
      'Política de privacidade | LingoLive',
      'O que o LingoLive coleta, o que nunca coleta, por quanto tempo algo é guardado e como apagar tudo.',
      'Política de privacidade',
      'Modelo aguardando revisão jurídica. O resumo abaixo descreve o que o software realmente faz hoje; a política completa precisa ser revisada por um advogado para cada jurisdição antes do lançamento.',
      'O que nunca guardamos',
      'Áudio: nunca armazenado, em lugar nenhum, em momento nenhum. Texto parcial (ainda não final): apenas em memória. Conteúdo de transcrição em logs ou analytics: estruturalmente impossível — os campos não existem.',
      'O que guardamos, e por quanto tempo',
      'Uma transcrição só é guardada se você tocar em Salvar, e permanece até você excluí-la. Uma sessão não salva é apagada em até uma hora após terminar. Logs técnicos ficam por um período limitado e configurável. Você pode excluir sua conta e tudo nela de dentro do app.',
      'Ler sobre segurança',
    ],
    it: [
      'Informativa sulla privacy | LingoLive',
      'Cosa raccoglie LingoLive, cosa non raccoglie mai, per quanto tempo qualcosa viene conservato e come cancellare tutto.',
      'Informativa sulla privacy',
      'Modello in attesa di revisione legale. Il riepilogo qui sotto descrive ciò che il software fa realmente oggi; l’informativa completa deve essere revisionata da un legale per ciascuna giurisdizione prima del lancio.',
      'Cosa non conserviamo mai',
      'Audio: mai memorizzato, da nessuna parte e in nessun momento. Testo provvisorio (non ancora definitivo): solo in memoria. Contenuto delle trascrizioni nei log o nelle analytics: strutturalmente impossibile — i campi non esistono.',
      'Cosa conserviamo e per quanto',
      'Una trascrizione resta solo se premi Salva, e finché non la cancelli. Una sessione non salvata viene eliminata entro un’ora dalla fine. I log tecnici restano per un periodo limitato e configurabile. Puoi cancellare il tuo account e tutto ciò che contiene dall’app stessa.',
      'Leggi sulla sicurezza',
    ],
    de: [
      'Datenschutzerklärung | LingoLive',
      'Was LingoLive erhebt, was es nie erhebt, wie lange etwas bleibt und wie du alles löschst.',
      'Datenschutzerklärung',
      'Vorlage, juristische Prüfung ausstehend. Die Zusammenfassung unten beschreibt, was die Software heute tatsächlich tut; die vollständige Erklärung muss vor dem Start je Rechtsraum anwaltlich geprüft werden.',
      'Was wir nie behalten',
      'Audio: nirgendwo und zu keinem Zeitpunkt gespeichert. Vorläufiger (noch nicht endgültiger) Text: nur im Arbeitsspeicher. Transkriptinhalte in Logs oder Analytics: strukturell unmöglich — die Felder existieren nicht.',
      'Was wir behalten, und wie lange',
      'Ein Transkript bleibt nur, wenn du auf Speichern tippst — und bis du es löschst. Eine nicht gespeicherte Sitzung wird binnen einer Stunde nach Ende gelöscht. Technische Logs bleiben für einen begrenzten, konfigurierbaren Zeitraum. Konto und alles darin kannst du direkt in der App löschen.',
      'Mehr zur Sicherheit',
    ],
  },
});

const terms = buildPage({
  path: 'terms',
  kind: 'legal',
  ctaPath: 'privacy',
  rows: {
    en: [
      'Terms of service | LingoLive',
      'What LingoLive provides, what it does not guarantee, and what you are responsible for when you record other people.',
      'Terms of service',
      'Template pending legal review. The points below are the ones that matter most in practice and are stated plainly here rather than buried in a clause.',
      'What this is, and is not',
      'LingoLive is an assistive transcription and translation tool. It is not a certified interpretation service, and its output must not be relied on where an error would carry legal, medical or financial consequences. Accuracy varies with noise, accent, overlap and subject matter.',
      'Your responsibility when others are speaking',
      'You are responsible for having the consent of the people around you where the law or the situation requires it. Recording and transcription rules differ substantially between countries, and in some places between regions of the same country.',
      'Read the privacy policy',
    ],
    fr: [
      "Conditions d'utilisation | LingoLive",
      "Ce que LingoLive fournit, ce qu'il ne garantit pas, et ce dont vous êtes responsable lorsque vous transcrivez d'autres personnes.",
      "Conditions d'utilisation",
      "Modèle en attente de validation juridique. Les points ci-dessous sont ceux qui comptent le plus en pratique, et ils sont énoncés clairement ici plutôt qu'enfouis dans une clause.",
      "Ce que c'est, et ce que ce n'est pas",
      "LingoLive est un outil d'assistance à la transcription et à la traduction. Ce n'est pas un service d'interprétation certifié, et sa sortie ne doit pas servir de référence là où une erreur aurait des conséquences juridiques, médicales ou financières. La précision varie selon le bruit, l'accent, les chevauchements et le sujet.",
      "Votre responsabilité quand d'autres parlent",
      "Il vous revient d'obtenir le consentement des personnes présentes lorsque la loi ou le contexte l'exige. Les règles d'enregistrement et de transcription diffèrent fortement d'un pays à l'autre, et parfois entre régions d'un même pays.",
      'Lire la politique de confidentialité',
    ],
    ar: [
      'شروط الاستخدام | LingoLive',
      'ما يقدّمه LingoLive وما لا يضمنه وما تتحمّل مسؤوليته عند تفريغ كلام الآخرين.',
      'شروط الاستخدام',
      'نموذج بانتظار المراجعة القانونية. النقاط أدناه هي الأهم عمليًا، وقد ذُكرت بوضوح هنا بدل دفنها داخل بند.',
      'ما هو، وما ليس هو',
      'LingoLive أداة مساعدة للتفريغ والترجمة. وهو ليس خدمة ترجمة فورية معتمدة، ولا ينبغي الاعتماد على مخرجاته حيث يحمل الخطأ عواقب قانونية أو طبية أو مالية. تتفاوت الدقة بحسب الضجيج واللكنة وتداخل الأصوات وطبيعة الموضوع.',
      'مسؤوليتك عندما يتحدث الآخرون',
      'أنت مسؤول عن الحصول على موافقة من حولك حين يقتضي القانون أو السياق ذلك. تختلف قواعد التسجيل والتفريغ اختلافًا كبيرًا بين الدول، وأحيانًا بين مناطق البلد الواحد.',
      'اقرأ سياسة الخصوصية',
    ],
    es: [
      'Términos del servicio | LingoLive',
      'Qué ofrece LingoLive, qué no garantiza y de qué eres responsable cuando transcribes a otras personas.',
      'Términos del servicio',
      'Plantilla pendiente de revisión legal. Los puntos siguientes son los que más importan en la práctica y se exponen aquí con claridad en lugar de esconderse en una cláusula.',
      'Qué es y qué no es',
      'LingoLive es una herramienta de apoyo a la transcripción y la traducción. No es un servicio de interpretación certificado, y no debe confiarse en su resultado allí donde un error tenga consecuencias legales, médicas o financieras. La precisión varía con el ruido, el acento, los solapamientos y la materia.',
      'Tu responsabilidad cuando hablan otras personas',
      'Es tu responsabilidad contar con el consentimiento de quienes te rodean cuando la ley o la situación lo exijan. Las normas sobre grabación y transcripción difieren mucho entre países y a veces entre regiones de un mismo país.',
      'Leer la política de privacidad',
    ],
    'pt-BR': [
      'Termos de uso | LingoLive',
      'O que o LingoLive oferece, o que não garante e pelo que você é responsável ao transcrever outras pessoas.',
      'Termos de uso',
      'Modelo aguardando revisão jurídica. Os pontos abaixo são os que mais importam na prática e estão declarados aqui com clareza, em vez de enterrados numa cláusula.',
      'O que é e o que não é',
      'O LingoLive é uma ferramenta de apoio à transcrição e à tradução. Não é um serviço de interpretação certificado, e seu resultado não deve ser usado como referência onde um erro tenha consequências jurídicas, médicas ou financeiras. A precisão varia com ruído, sotaque, sobreposição de vozes e assunto.',
      'Sua responsabilidade quando outras pessoas falam',
      'Cabe a você obter o consentimento de quem está por perto quando a lei ou a situação exigirem. As regras de gravação e transcrição variam bastante entre países e, às vezes, entre regiões de um mesmo país.',
      'Ler a política de privacidade',
    ],
    it: [
      'Termini di servizio | LingoLive',
      'Cosa offre LingoLive, cosa non garantisce e di cosa sei responsabile quando trascrivi altre persone.',
      'Termini di servizio',
      'Modello in attesa di revisione legale. I punti seguenti sono quelli che contano di più nella pratica e sono enunciati chiaramente qui invece che sepolti in una clausola.',
      'Cos’è e cosa non è',
      'LingoLive è uno strumento di supporto alla trascrizione e alla traduzione. Non è un servizio di interpretariato certificato e il suo output non va usato come riferimento dove un errore avrebbe conseguenze legali, mediche o finanziarie. L’accuratezza varia con rumore, accento, sovrapposizioni e argomento.',
      'La tua responsabilità quando parlano altri',
      'Spetta a te ottenere il consenso delle persone presenti dove la legge o il contesto lo richiedono. Le regole su registrazione e trascrizione differiscono molto tra Paesi e talvolta tra regioni dello stesso Paese.',
      'Leggi l’informativa sulla privacy',
    ],
    de: [
      'Nutzungsbedingungen | LingoLive',
      'Was LingoLive bietet, was es nicht garantiert und wofür du verantwortlich bist, wenn du andere transkribierst.',
      'Nutzungsbedingungen',
      'Vorlage, juristische Prüfung ausstehend. Die folgenden Punkte sind die praktisch wichtigsten und stehen hier im Klartext, statt in einer Klausel vergraben zu sein.',
      'Was es ist — und was nicht',
      'LingoLive ist ein Hilfsmittel für Transkription und Übersetzung. Es ist kein zertifizierter Dolmetschdienst, und auf seine Ausgabe darf man sich dort nicht verlassen, wo ein Fehler rechtliche, medizinische oder finanzielle Folgen hätte. Die Genauigkeit schwankt mit Lärm, Akzent, Überlappung und Thema.',
      'Deine Verantwortung, wenn andere sprechen',
      'Du bist dafür verantwortlich, die Zustimmung der Anwesenden einzuholen, wo Gesetz oder Situation es verlangen. Regeln zu Aufzeichnung und Transkription unterscheiden sich erheblich zwischen Ländern und teils zwischen Regionen desselben Landes.',
      'Datenschutzerklärung lesen',
    ],
  },
});

export const LEGAL_PAGES: readonly MarketingPage[] = [privacy, terms];
