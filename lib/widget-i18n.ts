import type { WidgetLanguage } from "@/lib/supabase/types";

/**
 * Phase 25a localization: static widget UI strings, per business-selected
 * `widget_language`. Dashboard stays English-only (STATE.md's approved
 * scope) -- this covers the public chat widget only. Six languages
 * chosen as a deliberately small initial set, not an exhaustive list;
 * adding one is a dictionary entry plus a constraint-check migration,
 * not an architecture change.
 *
 * These are engineering-quality translations (not reviewed by a native
 * speaker/professional translator for each language) -- adequate for a
 * functional first pass, a known limitation worth a professional review
 * pass before relying on it for a real non-English-market launch.
 */

export const SUPPORTED_WIDGET_LANGUAGES = ["en", "es", "fr", "de", "pt", "hi"] as const;

export const WIDGET_LANGUAGE_LABELS: Record<WidgetLanguage, string> = {
  en: "English",
  es: "Español (Spanish)",
  fr: "Français (French)",
  de: "Deutsch (German)",
  pt: "Português (Portuguese)",
  hi: "हिन्दी (Hindi)",
};

/** The plain English language name to interpolate into the Gemini system prompt (lib/rag.ts) -- a model instruction, not UI copy, so it stays in English regardless of `widget_language`. */
export const WIDGET_LANGUAGE_NAMES_FOR_PROMPT: Record<WidgetLanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  hi: "Hindi",
};

export type WidgetStrings = {
  panelTitle: string;
  panelSubtitle: string;
  openChatLabel: string;
  closeChatLabel: string;
  inputPlaceholder: string;
  sendLabel: string;
  consentText: string;
  consentLinkLabel: string;
  teamMemberLabel: string;
  retryLabel: string;
  escalationBannerText: string;
  defaultGreetingOpen: string;
  defaultGreetingClosed: string;
  panelUnavailable: string;
  errorUnauthorized: string;
  errorRateLimited: string;
  errorFailure: string;
  defaultCta: string;
  dismissCtaLabel: string;
  menuLabel: string;
  startNewChatLabel: string;
  endChatLabel: string;
  viewRecentChatsLabel: string;
  recentChatsTitle: string;
  recentChatsEmpty: string;
  recentChatsLoading: string;
  backLabel: string;
  suggestedQuestionsLabel: string;
};

const EN: WidgetStrings = {
  panelTitle: "AI Sales Assistant",
  panelSubtitle: "Usually replies in seconds",
  openChatLabel: "Open chat",
  closeChatLabel: "Close chat",
  inputPlaceholder: "Type a message…",
  sendLabel: "Send message",
  consentText: "I agree that contact details I share here may be stored to follow up with me.",
  consentLinkLabel: "Privacy Policy",
  teamMemberLabel: "Team member",
  retryLabel: "Retry",
  escalationBannerText:
    "Want to talk to a person? Leave your best contact info in the chat and our team will follow up.",
  defaultGreetingOpen: "Hi! Ask me anything and I'll do my best to help.",
  defaultGreetingClosed:
    "Hi! We're outside our usual hours right now, but ask away — I'll do my best to help, and our team will follow up if needed.",
  panelUnavailable: "This chat isn't available right now.",
  errorUnauthorized: "This chat isn't available right now.",
  errorRateLimited: "Too many messages — please wait a moment and try again.",
  errorFailure: "Something went wrong. Check your connection and try again.",
  defaultCta: "Chat with us",
  dismissCtaLabel: "Dismiss",
  menuLabel: "More options",
  startNewChatLabel: "Start new chat",
  endChatLabel: "End chat",
  viewRecentChatsLabel: "View recent chats",
  recentChatsTitle: "Recent chats",
  recentChatsEmpty: "No previous chats yet.",
  recentChatsLoading: "Loading…",
  backLabel: "Back",
  suggestedQuestionsLabel: "Suggested questions",
};

const ES: WidgetStrings = {
  panelTitle: "Asistente de ventas IA",
  panelSubtitle: "Normalmente responde en segundos",
  openChatLabel: "Abrir chat",
  closeChatLabel: "Cerrar chat",
  inputPlaceholder: "Escribe un mensaje…",
  sendLabel: "Enviar mensaje",
  consentText: "Acepto que los datos de contacto que comparta aquí se guarden para hacer seguimiento.",
  consentLinkLabel: "Política de privacidad",
  teamMemberLabel: "Miembro del equipo",
  retryLabel: "Reintentar",
  escalationBannerText:
    "¿Quieres hablar con una persona? Deja tus datos de contacto en el chat y nuestro equipo se pondrá en contacto.",
  defaultGreetingOpen: "¡Hola! Pregúntame lo que quieras y haré lo posible por ayudarte.",
  defaultGreetingClosed:
    "¡Hola! Estamos fuera de nuestro horario habitual, pero pregunta igualmente — haré lo posible por ayudarte y nuestro equipo dará seguimiento si es necesario.",
  panelUnavailable: "Este chat no está disponible en este momento.",
  errorUnauthorized: "Este chat no está disponible en este momento.",
  errorRateLimited: "Demasiados mensajes — espera un momento e inténtalo de nuevo.",
  errorFailure: "Algo salió mal. Revisa tu conexión e inténtalo de nuevo.",
  defaultCta: "Chatea con nosotros",
  dismissCtaLabel: "Descartar",
  menuLabel: "Más opciones",
  startNewChatLabel: "Iniciar nuevo chat",
  endChatLabel: "Finalizar chat",
  viewRecentChatsLabel: "Ver chats recientes",
  recentChatsTitle: "Chats recientes",
  recentChatsEmpty: "Aún no hay chats anteriores.",
  recentChatsLoading: "Cargando…",
  backLabel: "Atrás",
  suggestedQuestionsLabel: "Preguntas sugeridas",
};

const FR: WidgetStrings = {
  panelTitle: "Assistant commercial IA",
  panelSubtitle: "Répond généralement en quelques secondes",
  openChatLabel: "Ouvrir le chat",
  closeChatLabel: "Fermer le chat",
  inputPlaceholder: "Écrivez un message…",
  sendLabel: "Envoyer le message",
  consentText: "J'accepte que les coordonnées partagées ici soient conservées pour un suivi.",
  consentLinkLabel: "Politique de confidentialité",
  teamMemberLabel: "Membre de l'équipe",
  retryLabel: "Réessayer",
  escalationBannerText:
    "Vous voulez parler à quelqu'un ? Laissez vos coordonnées dans le chat et notre équipe vous recontactera.",
  defaultGreetingOpen: "Bonjour ! Posez-moi vos questions, je ferai de mon mieux pour vous aider.",
  defaultGreetingClosed:
    "Bonjour ! Nous sommes en dehors de nos horaires habituels, mais posez votre question — je ferai de mon mieux et notre équipe vous recontactera si besoin.",
  panelUnavailable: "Ce chat n'est pas disponible pour le moment.",
  errorUnauthorized: "Ce chat n'est pas disponible pour le moment.",
  errorRateLimited: "Trop de messages — veuillez patienter un instant et réessayer.",
  errorFailure: "Une erreur s'est produite. Vérifiez votre connexion et réessayez.",
  defaultCta: "Discutez avec nous",
  dismissCtaLabel: "Ignorer",
  menuLabel: "Plus d'options",
  startNewChatLabel: "Démarrer une nouvelle discussion",
  endChatLabel: "Terminer la discussion",
  viewRecentChatsLabel: "Voir les discussions récentes",
  recentChatsTitle: "Discussions récentes",
  recentChatsEmpty: "Pas encore de discussion précédente.",
  recentChatsLoading: "Chargement…",
  backLabel: "Retour",
  suggestedQuestionsLabel: "Questions suggérées",
};

const DE: WidgetStrings = {
  panelTitle: "KI-Vertriebsassistent",
  panelSubtitle: "Antwortet meist in Sekunden",
  openChatLabel: "Chat öffnen",
  closeChatLabel: "Chat schließen",
  inputPlaceholder: "Nachricht eingeben…",
  sendLabel: "Nachricht senden",
  consentText: "Ich stimme zu, dass hier geteilte Kontaktdaten zur Nachverfolgung gespeichert werden dürfen.",
  consentLinkLabel: "Datenschutzerklärung",
  teamMemberLabel: "Teammitglied",
  retryLabel: "Erneut versuchen",
  escalationBannerText:
    "Möchten Sie mit einer Person sprechen? Hinterlassen Sie Ihre Kontaktdaten im Chat, unser Team meldet sich.",
  defaultGreetingOpen: "Hallo! Fragen Sie mich alles — ich helfe Ihnen gerne weiter.",
  defaultGreetingClosed:
    "Hallo! Wir sind gerade außerhalb unserer üblichen Zeiten, aber fragen Sie ruhig — ich helfe so gut ich kann, unser Team meldet sich bei Bedarf.",
  panelUnavailable: "Dieser Chat ist gerade nicht verfügbar.",
  errorUnauthorized: "Dieser Chat ist gerade nicht verfügbar.",
  errorRateLimited: "Zu viele Nachrichten — bitte warten Sie einen Moment und versuchen Sie es erneut.",
  errorFailure: "Etwas ist schiefgelaufen. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
  defaultCta: "Chatten Sie mit uns",
  dismissCtaLabel: "Schließen",
  menuLabel: "Weitere Optionen",
  startNewChatLabel: "Neuen Chat starten",
  endChatLabel: "Chat beenden",
  viewRecentChatsLabel: "Letzte Chats anzeigen",
  recentChatsTitle: "Letzte Chats",
  recentChatsEmpty: "Noch keine früheren Chats.",
  recentChatsLoading: "Wird geladen…",
  backLabel: "Zurück",
  suggestedQuestionsLabel: "Vorgeschlagene Fragen",
};

const PT: WidgetStrings = {
  panelTitle: "Assistente de vendas IA",
  panelSubtitle: "Normalmente responde em segundos",
  openChatLabel: "Abrir chat",
  closeChatLabel: "Fechar chat",
  inputPlaceholder: "Digite uma mensagem…",
  sendLabel: "Enviar mensagem",
  consentText: "Concordo que os dados de contacto partilhados aqui sejam guardados para acompanhamento.",
  consentLinkLabel: "Política de privacidade",
  teamMemberLabel: "Membro da equipa",
  retryLabel: "Tentar novamente",
  escalationBannerText:
    "Quer falar com uma pessoa? Deixe os seus dados de contacto no chat e a nossa equipa dará seguimento.",
  defaultGreetingOpen: "Olá! Pergunte-me o que quiser, farei o meu melhor para ajudar.",
  defaultGreetingClosed:
    "Olá! Estamos fora do nosso horário habitual, mas pode perguntar à vontade — farei o meu melhor e a nossa equipa dará seguimento se necessário.",
  panelUnavailable: "Este chat não está disponível neste momento.",
  errorUnauthorized: "Este chat não está disponível neste momento.",
  errorRateLimited: "Demasiadas mensagens — aguarde um momento e tente novamente.",
  errorFailure: "Algo correu mal. Verifique a sua ligação e tente novamente.",
  defaultCta: "Converse connosco",
  dismissCtaLabel: "Dispensar",
  menuLabel: "Mais opções",
  startNewChatLabel: "Iniciar nova conversa",
  endChatLabel: "Terminar conversa",
  viewRecentChatsLabel: "Ver conversas recentes",
  recentChatsTitle: "Conversas recentes",
  recentChatsEmpty: "Ainda não há conversas anteriores.",
  recentChatsLoading: "A carregar…",
  backLabel: "Voltar",
  suggestedQuestionsLabel: "Perguntas sugeridas",
};

const HI: WidgetStrings = {
  panelTitle: "एआई सेल्स असिस्टेंट",
  panelSubtitle: "आमतौर पर सेकंडों में जवाब देता है",
  openChatLabel: "चैट खोलें",
  closeChatLabel: "चैट बंद करें",
  inputPlaceholder: "संदेश लिखें…",
  sendLabel: "संदेश भेजें",
  consentText: "मैं सहमत हूं कि यहां साझा की गई संपर्क जानकारी फॉलो-अप के लिए संग्रहीत की जा सकती है।",
  consentLinkLabel: "गोपनीयता नीति",
  teamMemberLabel: "टीम सदस्य",
  retryLabel: "पुनः प्रयास करें",
  escalationBannerText: "किसी व्यक्ति से बात करना चाहते हैं? चैट में अपनी संपर्क जानकारी छोड़ें, हमारी टीम संपर्क करेगी।",
  defaultGreetingOpen: "नमस्ते! मुझसे कुछ भी पूछें, मैं मदद करने की पूरी कोशिश करूंगा।",
  defaultGreetingClosed:
    "नमस्ते! अभी हमारे सामान्य समय के बाहर है, लेकिन बेझिझक पूछें — मैं मदद करने की पूरी कोशिश करूंगा और ज़रूरत पड़ने पर हमारी टीम संपर्क करेगी।",
  panelUnavailable: "यह चैट अभी उपलब्ध नहीं है।",
  errorUnauthorized: "यह चैट अभी उपलब्ध नहीं है।",
  errorRateLimited: "बहुत सारे संदेश — कृपया थोड़ी देर रुकें और फिर से प्रयास करें।",
  errorFailure: "कुछ गलत हो गया। अपना कनेक्शन जांचें और फिर से प्रयास करें।",
  defaultCta: "हमसे चैट करें",
  dismissCtaLabel: "खारिज करें",
  menuLabel: "अधिक विकल्प",
  startNewChatLabel: "नई चैट शुरू करें",
  endChatLabel: "चैट समाप्त करें",
  viewRecentChatsLabel: "हाल की चैट देखें",
  recentChatsTitle: "हाल की चैट",
  recentChatsEmpty: "अभी तक कोई पिछली चैट नहीं है।",
  recentChatsLoading: "लोड हो रहा है…",
  backLabel: "वापस",
  suggestedQuestionsLabel: "सुझाए गए प्रश्न",
};

const DICTIONARIES: Record<WidgetLanguage, WidgetStrings> = { en: EN, es: ES, fr: FR, de: DE, pt: PT, hi: HI };

export function getWidgetStrings(language: WidgetLanguage): WidgetStrings {
  return DICTIONARIES[language] ?? EN;
}

export function isSupportedWidgetLanguage(value: string): value is WidgetLanguage {
  return (SUPPORTED_WIDGET_LANGUAGES as readonly string[]).includes(value);
}
