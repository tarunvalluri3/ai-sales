import type { WidgetLanguage } from "@/lib/supabase/types";

type Locale = Exclude<WidgetLanguage, "en" | "auto">;

type BookingPattern = {
  context: RegExp;
  completed: RegExp;
  exclusion: RegExp;
  fallback: string;
  callback: string;
};

// Each pattern requires a booking subject/date and affirmative completion.
// Negations, conditionals and explicit callback-only messages are excluded.
const patterns: Record<Locale, BookingPattern> = {
  es: {
    context: /cita|reserva|consulta|turno|horario|lunes|martes|miércoles|jueves|viernes|sábado|domingo/iu,
    completed: /reservad[oa]|programad[oa]|confirmad[oa]|agendad[oa]|(?:he|hemos) (?:reservado|programado|confirmado|agendado)/iu,
    exclusion: /\b(?:no|nunca|si|cuando|podemos|llamada)\b/iu,
    fallback: "No puedo reservar una hora aquí. Nuestro equipo puede coordinarla contigo.",
    callback: "He enviado tus datos a nuestro equipo. Te llamarán para acordar una hora.",
  },
  fr: {
    context: /rendez[- ]vous|réservation|créneau|consultation|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/iu,
    completed: /réservé[e]?|confirmé[e]?|planifié[e]?|programmé[e]?|fixé[e]?/iu,
    exclusion: /\b(?:pas|jamais|si|lorsque|pourrait|rappel)\b/iu,
    fallback: "Je ne peux pas réserver un créneau ici. Notre équipe peut en convenir avec vous.",
    callback: "J’ai transmis vos coordonnées à notre équipe. Elle vous appellera pour convenir d’un horaire.",
  },
  de: {
    context: /termin|buchung|reservierung|sprechstunde|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag/iu,
    completed: /gebucht|eingeplant|bestätigt|reserviert|vereinbart/iu,
    exclusion: /\b(?:nicht|kein(?:e|en)?|wenn|falls|sobald|könnte|rückruf)\b/iu,
    fallback: "Ich kann hier keinen Termin buchen. Unser Team kann einen Termin mit Ihnen vereinbaren.",
    callback: "Ich habe Ihre Daten weitergeleitet. Unser Team ruft Sie zur Terminvereinbarung an.",
  },
  pt: {
    context: /consulta|horário|reserva|agendamento|segunda|terça|quarta|quinta|sexta|sábado|domingo/iu,
    completed: /marcad[oa]|reservad[oa]|agendad[oa]|confirmad[oa]|marquei|agendei|reservei|confirmei/iu,
    exclusion: /\b(?:não|nunca|se|quando|podemos|ligação)\b/iu,
    fallback: "Não posso marcar um horário aqui. Nossa equipe pode combinar um horário com você.",
    callback: "Enviei seus dados à nossa equipe. Ela vai ligar para combinar um horário.",
  },
  hi: {
    context: /अपॉइंटमेंट|अपॉइंटमेन्ट|नियुक्ति|बुकिंग|स्लॉट|समय|मुलाकात|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार|\bappointment\b/iu,
    completed: /बुक (?:हो ग(?:या|ई)|कर द(?:िया|ी)|किया|की|हो चुका)|पुष्टि हो गई|निश्चित हो ग(?:या|ई)|तय (?:हो ग(?:या|ई)|कर द(?:िया|ी))|कन्फर्म (?:हो ग(?:या|ई)|कर द(?:िया|ी)|है)|\b(?:book|confirm) ho g(?:aya|ayi)\b/iu,
    exclusion: /नहीं|यदि|अगर|जब|कॉल.?बैक|करेंग[ेी]|होग[ाी]/u,
    fallback: "मैं यहाँ समय बुक नहीं कर सकता। हमारी टीम आपसे समय तय कर सकती है।",
    callback: "मैंने आपके संपर्क विवरण टीम को भेज दिए हैं। समय तय करने के लिए टीम आपको फ़ोन करेगी।",
  },
  te: {
    context: /అపాయింట్‌?మెంట్|అపాయింట్మెంట్|బుకింగ్|స్లాట్|సమయం|సమావేశం|సోమవారం|మంగళవారం|బుధవారం|గురువారం|శుక్రవారం|శనివారం|ఆదివారం|\b(?:appointment|slot)\b/iu,
    completed: /బుక్\s*(?:అయింది|చేశా(?:ను|ము)|చేసాను|చేయబడింది|అయ్యింది)|నిర్ధారించ(?:బడింది|ా(?:ను|ము))|ఖరార(?:ైంది|ు\s*చేశా(?:ను|ము))|కన్ఫర్మ్\s*(?:అయింది|చేశా(?:ను|ము))|షెడ్యూల్\s*(?:అయింది|చేయబడింది|చేశా(?:ను|ము))|రిజర్వ్\s*(?:అయింది|చేశా(?:ను|ము))|\bbook (?:ayyindi|chesanu)\b/iu,
    exclusion: /కాలేదు|చేయలేదు|లేదు|కాకపోతే|అయితే|కాల్‌బ్యాక్|చేస్తాము/u,
    fallback: "నేను ఇక్కడ సమయం బుక్ చేయలేను. మా బృందం మీతో సమయం నిర్ణయించగలదు.",
    callback: "మీ వివరాలను మా బృందానికి పంపాను. సమయం నిర్ణయించడానికి వారు మీకు ఫోన్ చేస్తారు.",
  },
  ta: {
    context: /சந்திப்பு|முன்பதிவு|நேரம்|அப்பாயிண்ட்மெண்ட்|நேரச்சாளரம்|திங்கள்|செவ்வாய்|புதன்|வியாழன்|வெள்ளி|சனி|ஞாயிறு|\b(?:appointment|slot)\b/iu,
    completed: /முன்பதிவு\s*(?:செய்யப்பட்டது|செய்துவிட்டேன்|செய்துள்ளேன்|முடிந்தது)|உறுதி\s*(?:செய்யப்பட்டது|செய்துவிட்டேன்|ஆகிவிட்டது|செய்யப்பட்டுள்ளது)|திட்டமிடப்பட்டது|ஒதுக்கப்பட்டுள்ளது|புக்\s*(?:செய்துவிட்டேன்|ஆகிவிட்டது)/u,
    exclusion: /இல்லை|முடியாது|செய்யவில்லை|என்றால்|மீண்டும் அழைப்பு|செய்வோம்/u,
    fallback: "என்னால் இங்கே நேரத்தை முன்பதிவு செய்ய முடியாது. எங்கள் குழு உங்களுடன் நேரத்தை முடிவு செய்யலாம்.",
    callback: "உங்கள் விவரங்களை எங்கள் குழுவுக்கு அனுப்பியுள்ளேன். நேரத்தை முடிவு செய்ய அவர்கள் உங்களை அழைப்பார்கள்.",
  },
  kn: {
    context: /ನೇಮಕಾತಿ|ಭೇಟಿ|ಅಪಾಯಿಂಟ್‌?ಮೆಂಟ್|ಬುಕಿಂಗ್|ಸ್ಲಾಟ್|ಸಮಯ|ಸೋಮವಾರ|ಮಂಗಳವಾರ|ಬುಧವಾರ|ಗುರುವಾರ|ಶುಕ್ರವಾರ|ಶನಿವಾರ|ಭಾನುವಾರ|\b(?:appointment|slot)\b/iu,
    completed: /ಬುಕ್\s*(?:ಆಗಿದೆ|ಮಾಡಿದೆ|ಮಾಡಿದ್ದೇನೆ|ಮಾಡಲಾಗಿದೆ)|ದೃಢೀಕರಿಸಲಾಗಿದೆ|ದೃಢಪಡಿಸಲಾಗಿದೆ|ನಿಗದಿಯಾಗಿದೆ|ನಿಗದಿಪಡಿಸಲಾಗಿದೆ|ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ|ಖಚಿತವಾಗಿದೆ/u,
    exclusion: /ಇಲ್ಲ|ಸಾಧ್ಯವಿಲ್ಲ|ಆಗದಿದ್ದರೆ|ಒಂದು ವೇಳೆ|ಮರಳಿ ಕರೆ|ಮಾಡುತ್ತೇವೆ/u,
    fallback: "ಇಲ್ಲಿ ಸಮಯವನ್ನು ಕಾಯ್ದಿರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ. ನಮ್ಮ ತಂಡ ನಿಮ್ಮೊಂದಿಗೆ ಸಮಯ ನಿಗದಿಪಡಿಸಬಹುದು.",
    callback: "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನಮ್ಮ ತಂಡಕ್ಕೆ ಕಳುಹಿಸಿದ್ದೇನೆ. ಸಮಯ ನಿಗದಿಪಡಿಸಲು ಅವರು ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ.",
  },
  mr: {
    context: /अपॉइंटमेंट|भेट|आरक्षण|बुकिंग|स्लॉट|वेळ|सोमवार|मंगळवार|बुधवार|गुरुवार|शुक्रवार|शनिवार|रविवार|\b(?:appointment|slot)\b/iu,
    completed: /बुक\s*(?:केल[ेीा]|झाल[ेीा]|केली आहे)|निश्चित\s*(?:केली|केले|झाली|झाले)|पुष्टी\s*(?:झाली|केली)|आरक्षित\s*(?:केले|आहे)|ठरवली आहे|कन्फर्म\s*(?:झाली|केली)/u,
    exclusion: /नाही|शकत नाही|जर|जेव्हा|परत फोन|करतील/u,
    fallback: "मी इथे वेळ आरक्षित करू शकत नाही. आमची टीम तुमच्याशी वेळ ठरवू शकते.",
    callback: "मी तुमचे तपशील आमच्या टीमला पाठवले आहेत. वेळ ठरवण्यासाठी ते तुम्हाला फोन करतील.",
  },
  bn: {
    context: /অ্যাপয়েন্টমেন্ট|অ্যাপয়েন্টমেন্ট|সাক্ষাৎ|বুকিং|স্লট|সময়|সময়|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|শনিবার|রবিবার|\b(?:appointment|slot)\b/iu,
    completed: /বুক\s*(?:করা হয়েছে|করা হয়েছে|করেছি|হয়ে গেছে|হয়ে গেছে|হয়েছে|হয়েছে)|নিশ্চিত\s*(?:হয়েছে|হয়েছে|করা হয়েছে|করা হয়েছে|করেছি)|নির্ধারিত\s*(?:হয়েছে|হয়েছে|করা হয়েছে)|কনফার্ম\s*(?:হয়েছে|করেছি)|সংরক্ষণ করেছি/u,
    exclusion: /হয়নি|হয়নি|করিনি|পারব না|যদি|যখন|কলব্যাক|করব/u,
    fallback: "আমি এখানে সময় বুক করতে পারি না। আমাদের দল আপনার সঙ্গে সময় ঠিক করতে পারবে।",
    callback: "আমি আপনার তথ্য আমাদের দলকে পাঠিয়েছি। সময় ঠিক করতে তারা আপনাকে ফোন করবে।",
  },
};

const numericTime = /[\p{N}]{1,2}:[\p{N}]{2}|[\p{N}]{1,2}\s*(?:h|uhr|बजे|वाजता|గంటలకు|மணிக்கு|ಗಂಟೆಗೆ|টায়|টায়)/iu;

export function localizedBookingLanguage(sentence: string, preferred?: WidgetLanguage): Locale | undefined {
  const text = sentence.normalize("NFC").replace(/\p{Cf}/gu, "");
  const matches = ({ context, completed, exclusion }: BookingPattern) =>
    !exclusion.test(text) && completed.test(text) && (context.test(text) || numericTime.test(text));
  if (preferred && preferred !== "en" && preferred !== "auto" && matches(patterns[preferred])) return preferred;
  return (Object.entries(patterns) as [Locale, BookingPattern][]).find(([, pattern]) => matches(pattern))?.[0];
}

export function localizedBookingRewrite(language: WidgetLanguage | undefined, callback: boolean) {
  if (!language || language === "en" || language === "auto") return undefined;
  return callback ? patterns[language].callback : patterns[language].fallback;
}

export function diagnosticReplyLanguage(text: string, configured?: WidgetLanguage): string {
  if (/\p{Script=Telugu}/u.test(text)) return "te";
  if (/\p{Script=Tamil}/u.test(text)) return "ta";
  if (/\p{Script=Kannada}/u.test(text)) return "kn";
  if (/\p{Script=Bengali}/u.test(text)) return "bn";
  if (/\p{Script=Devanagari}/u.test(text)) return configured === "hi" || configured === "mr" ? configured : "und-Deva";
  return configured && configured !== "auto" ? configured : "und";
}
